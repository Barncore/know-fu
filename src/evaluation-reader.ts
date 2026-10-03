import path from "node:path";
import { Store } from "./store.js";
import { Reading } from "./reading.js";
import {
  atomic,
  ensure,
  hash,
  immutable,
  json,
  key,
  now,
  ref,
} from "./core.js";
import type { Ref, Scope } from "./core.js";
import type { Purpose } from "./navigation.js";
import { renderReadingResponse } from "./reading-render.js";

export type ReaderSessionConfig = {
  interface_version: "1.0.0";
  root: string;
  project: string;
  ledger_root: string;
  release_id: string;
  scope: Scope;
  graph: boolean;
  purpose: Purpose;
  trace_directory: string;
  max_calls: number;
  max_rendered_characters: number;
};

/** The evaluation process owns this binding; tool input cannot choose another corpus or release. */
export class EvaluationReader {
  readonly store: Store;
  readonly reading: Reading;
  private calls = 0;
  private characters = 0;
  private serial: Promise<unknown> = Promise.resolve();
  private full = new Map<string, string>();
  private required = new Map<string, Ref>();
  private sectionReads = new Map<string, Set<string>>();
  private summaries = new Set<string>();
  private entries: any[] = [];
  private unresolvedContext = new Set<string>();

  constructor(
    readonly config: ReaderSessionConfig,
    reading?: Reading,
  ) {
    ensure(
      config.interface_version === "1.0.0" &&
        Number.isInteger(config.max_calls) &&
        config.max_calls > 0 &&
        Number.isInteger(config.max_rendered_characters) &&
        config.max_rendered_characters > 0,
      "VALIDATION_FAILED",
      "Invalid evaluation reader configuration",
    );
    this.store =
      reading?.store ??
      new Store(config.root, config.project, config.ledger_root);
    this.reading = reading ?? new Reading(this.store);
  }

  call(name: string, request: any) {
    const next = this.serial.then(() => this.execute(name, request));
    this.serial = next.catch(() => {});
    return next;
  }

  private async execute(name: string, input: any) {
    const started = performance.now();
    this.calls++;
    const entry: any = {
      call: this.calls,
      tool: name,
      request: input,
      started_at: now(),
    };
    try {
      ensure(
        this.calls <= this.config.max_calls,
        "BUDGET_EXHAUSTED",
        "The reading-call budget is exhausted. Answer with the remaining limitations explicit.",
      );
      ensure(
        input && typeof input === "object" && !Array.isArray(input),
        "VALIDATION_FAILED",
        "Supply a request object",
      );
      const permittedFields = new Set([
        "kind",
        "query",
        "purpose",
        "context",
        "domains",
        "topic",
        "record_ref",
        "record_refs",
        "section_id",
        "offset",
        "context_offset",
        "limit",
        "semantic",
        "rerank",
        "reason",
      ]);
      ensure(
        Object.keys(input).every((k) => permittedFields.has(k)),
        "SCOPE_DENIED",
        "Evaluation tools accept reading choices only; corpus, scope, release and graph policy are fixed",
      );
      ensure(
        typeof input.reason === "string" && input.reason.trim(),
        "VALIDATION_FAILED",
        "Give a short reading reason",
      );
      await this.store.scope(this.config.scope);
      ensure(
        (await this.store.current()) === this.config.release_id,
        "REVISION_CONFLICT",
        "The corpus changed during evaluation; prepare a new comparison",
      );
      const { reason: _reason, ...choice } = input;
      const request = {
        ...choice,
        scope: this.config.scope,
        release_id: this.config.release_id,
        graph: this.config.graph,
        purpose: choice.purpose ?? this.config.purpose,
      };
      let result: any;
      if (name === "kb_retrieve") result = await this.reading.retrieve(request);
      else {
        ensure(
          name === "kb_read" &&
            [
              "catalogue",
              "topic",
              "account",
              "accounts",
              "sections",
              "context",
            ].includes(choice.kind),
          "SCOPE_DENIED",
          "Only scoped published reading operations are available",
        );
        result = await this.reading.read(request);
      }
      const contents = [result.content, ...(result.contents ?? [])].filter(
        Boolean,
      );
      const repeated = contents.filter(
        (content) =>
          content.coverage === "complete_account" &&
          this.full.get(key(content.record_ref)) === content.body_sha256,
      );
      // Lifecycle/context checks above still run on repeat requests. Only identical prose is deduplicated.
      if (repeated.length)
        result = {
          ...result,
          content: repeated.includes(result.content) ? null : result.content,
          ...(result.contents
            ? {
                contents: result.contents.filter(
                  (content: any) => !repeated.includes(content),
                ),
              }
            : {}),
          previously_read: repeated.map((content) => ({
            record_ref: content.record_ref,
            body_sha256: content.body_sha256,
            note: "This complete account already appeared in this session; reuse that text and the refreshed material context.",
          })),
        };
      const response = {
        result,
        budget: {
          calls_used: this.calls,
          calls_remaining: Math.max(0, this.config.max_calls - this.calls),
          rendered_characters_before_call: this.characters,
          rendered_character_limit: this.config.max_rendered_characters,
        },
      };
      const rendered = renderReadingResponse(response);
      ensure(
        this.characters + rendered.length <=
          this.config.max_rendered_characters,
        "BUDGET_EXHAUSTED",
        "This complete response exceeds the remaining evidence budget. Use fewer candidates or a section read; otherwise report the unresolved reading requirement.",
      );
      this.characters += rendered.length;
      for (const candidate of result.candidates)
        this.summaries.add(key(candidate.record_ref));
      for (const content of contents) {
        if (content.coverage === "complete_account")
          this.full.set(key(content.record_ref), content.body_sha256);
        else {
          const seen =
            this.sectionReads.get(key(content.record_ref)) ?? new Set<string>();
          seen.add(content.section_id);
          this.sectionReads.set(key(content.record_ref), seen);
          // Sections omit structured payload, so they remain partial even when all prose has been viewed.
        }
        for (const needed of result.necessary_reading)
          this.required.set(key(needed.record_ref), needed.record_ref);
        if (
          !result.material_context.resolved ||
          result.material_context.next_offset !== null
        )
          this.unresolvedContext.add(key(content.record_ref));
        else this.unresolvedContext.delete(key(content.record_ref));
      }
      if (choice.kind === "context") {
        for (const needed of result.necessary_reading)
          this.required.set(key(needed.record_ref), needed.record_ref);
        for (const r of choice.record_refs ?? []) {
          if (
            !result.material_context.resolved ||
            result.material_context.next_offset !== null
          )
            this.unresolvedContext.add(key(r));
          else this.unresolvedContext.delete(key(r));
        }
      }
      entry.state = "delivered";
      entry.response = response;
      entry.presentation_version = "1.0.0";
      entry.response_sha256 = hash(rendered);
      entry.rendered_characters = rendered.length;
      entry.repeated_accounts = repeated.map((content) => content.record_ref);
      return response;
    } catch (error: any) {
      entry.state = "denied";
      entry.error_code = error.code ?? "INTERNAL_ERROR";
      entry.error = error.code
        ? error.message
        : "The reader failed; inspect the coordinator's private diagnostics.";
      throw error;
    } finally {
      entry.elapsed_ms = performance.now() - started;
      this.entries.push(entry);
      await immutable(
        path.join(
          this.config.trace_directory,
          String(this.calls).padStart(6, "0") + ".json",
        ),
        json(entry),
      );
      await atomic(
        path.join(this.config.trace_directory, "trace.json"),
        json(this.snapshot()),
      );
    }
  }

  snapshot() {
    return {
      interface_version: "1.0.0",
      release_id: this.config.release_id,
      calls: this.calls,
      rendered_characters: this.characters,
      estimated_evidence_tokens: Math.ceil(this.characters / 4),
      token_measurement:
        "Actual MCP presentation character estimate only. Codex reported input usage separately includes repeated context and tool overhead.",
      selected_summaries: [...this.summaries],
      full_reads: [...this.full].map(([record, body_sha256]) => ({
        record,
        body_sha256,
      })),
      section_reads: [...this.sectionReads].map(([record, section_ids]) => ({
        record,
        section_ids: [...section_ids],
      })),
      unmet_required_reads: [...this.required]
        .filter(([record]) => !this.full.has(record))
        .map(([, reference]) => reference),
      unresolved_material_context: [...this.unresolvedContext],
      denied_calls: this.entries.filter((e) => e.state === "denied").length,
      entries: this.entries,
    };
  }
}

import { Store } from "./store.js";
import { Projections } from "./projections.js";
import {
  atomic,
  ensure,
  hash,
  json,
  key,
  readJson,
  ref,
  uid,
  validate,
} from "./core.js";
import type { Ref, Scope, RecordData } from "./core.js";
import {
  isAccount,
  purposeRequirements,
  purposeWeight,
  sections,
  summary,
} from "./navigation.js";
import type { Purpose } from "./navigation.js";
import { ResearchView } from "./research-view.js";
import type { ReadingContext } from "./research-view.js";

export type ReadingRequest = {
  kind?:
    "catalogue" | "topic" | "account" | "accounts" | "sections" | "context";
  query?: string;
  purpose?: Purpose;
  scope?: Scope;
  release_id?: string;
  context?: ReadingContext;
  domains?: string[];
  topic?: string;
  record_ref?: Ref;
  record_refs?: Ref[];
  section_id?: string;
  offset?: number;
  context_offset?: number;
  limit?: number;
  graph?: boolean;
  graph_required?: boolean;
  semantic?: boolean;
  rerank?: boolean;
};

/** Progressive discovery and reading. It never treats a summary as an inspected account. */
export class Reading {
  constructor(
    readonly store: Store,
    readonly projections = new Projections(store),
  ) {}

  async retrieve(input: ReadingRequest) {
    ensure(
      typeof input.query === "string" && input.query.trim(),
      "VALIDATION_FAILED",
      "A nonempty retrieval query is required",
    );
    return this.store.withReadSession(() => this.run(input, "discovery"));
  }

  async read(input: ReadingRequest) {
    ensure(
      [
        "catalogue",
        "topic",
        "account",
        "accounts",
        "sections",
        "context",
      ].includes(input.kind ?? ""),
      "VALIDATION_FAILED",
      "Unknown progressive reading operation",
    );
    return this.store.withReadSession(() => this.run(input, input.kind!));
  }

  private async run(input: ReadingRequest, kind: string) {
    await validate("reading-request", input);
    const started = performance.now(),
      view = await ResearchView.open(this.store, input);
    const purpose = input.purpose ?? "explain";
    ensure(
      Object.hasOwn(purposeRequirements, purpose),
      "VALIDATION_FAILED",
      "Unknown reading purpose",
    );
    for (const field of ["offset", "context_offset", "limit"] as const)
      ensure(
        input[field] === undefined ||
          (Number.isInteger(input[field]) &&
            input[field]! >= (field === "limit" ? 1 : 0)),
        "VALIDATION_FAILED",
        `Invalid ${field}`,
      );
    const limit = Math.min(input.limit ?? 8, 40),
      offset = input.offset ?? 0;
    const result: any = {
      interface_version: "1.0.0",
      request_id: uid("read-"),
      kind,
      release_id: view.release,
      current_release: view.current,
      purpose,
      purpose_requirements: [...purposeRequirements[purpose]],
      candidates: [],
      necessary_reading: [],
      relationships: [],
      traceable_support: [],
      topics: [],
      sections: [],
      content: null,
      route: ["canonical"],
      warnings: [...view.warnings],
      pagination: { offset, limit, total: 0, next_offset: null },
      material_context: {
        resolved: true,
        total_accounts: 0,
        total_relationships: 0,
        offset: input.context_offset ?? 0,
        next_offset: null,
      },
      reading_status: "orientation_only",
      completeness:
        "Reading selection is not proof of a complete answer. Open relevant accounts and resolve material context before relying on them.",
    };
    let chosen: RecordData[] = [];
    const usable = [...view.visible.values()].filter((r) => view.usable(r));
    const page = (records: RecordData[]) => {
      result.pagination.total = records.length;
      result.pagination.next_offset =
        offset + limit < records.length ? offset + limit : null;
      return records.slice(offset, offset + limit);
    };
    if (kind === "catalogue") {
      const config = await this.store.config();
      const topics = [
        ...new Set(usable.filter(isAccount).flatMap((r) => r.scope.domains)),
      ]
        .sort()
        .map((id) => {
          const members = usable.filter(
            (r) => isAccount(r) && r.scope.domains.includes(id),
          );
          return {
            topic: id,
            title: config.domains.find((d) => d.domain_id === id)?.title ?? id,
            accounts: members.length,
            primer_count: members.filter(
              (r) => (r.payload as any).form === "primer",
            ).length,
            primers: members
              .filter((r) => (r.payload as any).form === "primer")
              .slice(0, 3)
              .map((r) =>
                view.card(
                  r,
                  "Authored topic primer; inspect freshness and material context; topic lookup lists further primers",
                ),
              ),
          };
        });
      result.topics = topics.slice(offset, offset + limit);
      result.pagination.total = topics.length;
      result.pagination.next_offset =
        offset + limit < topics.length ? offset + limit : null;
    } else if (kind === "topic") {
      ensure(
        typeof input.topic === "string" && input.topic,
        "VALIDATION_FAILED",
        "A topic is required",
      );
      const members = usable.filter(
        (r) => isAccount(r) && r.scope.domains.includes(input.topic!),
      );
      members.sort(
        (a, b) =>
          purposeWeight(b, purpose) - purposeWeight(a, purpose) ||
          a.title.localeCompare(b.title) ||
          key(a).localeCompare(key(b)),
      );
      chosen = page(members);
    } else if (["account", "accounts", "sections"].includes(kind)) {
      if (kind === "accounts") {
        ensure(
          input.record_refs?.length && input.record_refs.length <= 12,
          "VALIDATION_FAILED",
          "Select 1–12 exact accounts for a batch read",
        );
        ensure(
          !input.section_id,
          "VALIDATION_FAILED",
          "Use an individual account read for a section",
        );
        chosen = await Promise.all(input.record_refs.map((r) => view.exact(r)));
        ensure(
          new Set(chosen.map(key)).size === chosen.length,
          "VALIDATION_FAILED",
          "A batch cannot contain duplicate references",
        );
        result.contents = [];
      } else chosen = [await view.exact(input.record_ref!)];
      for (const record of chosen) {
        const body =
          (await this.store.body(record)) || this.payloadText(record);
        const parts = sections(body, ref(record), view.release);
        if (kind !== "accounts")
          result.sections = parts.map(({ text: _text, ...locator }) => locator);
        result.pagination.total = chosen.length;
        if (kind !== "sections") {
          const section = input.section_id
            ? parts.find((s) => s.section_id === input.section_id)
            : null;
          ensure(
            !input.section_id || section,
            "SECTION_STALE",
            "Section does not match this exact account and release; request its section list again",
          );
          const payload = { ...(record.payload as any) };
          // Original passage prose belongs in content.text once; retain locator/asset metadata.
          if (payload.text === body) delete payload.text;
          const content = {
            record_ref: ref(record),
            body_sha256: hash(body),
            section_id: section?.section_id ?? null,
            text: section?.text ?? body,
            coverage: section ? "section_only" : "complete_account",
            // Structured learning/application/question content can determine how the prose is used.
            payload: section ? null : payload,
            extensions: record.extensions,
            assessments: record.assessments,
          };
          if (kind === "accounts") result.contents.push(content);
          else result.content = content;
          result.reading_status = section ? "section_read" : "account_read";
          if (section)
            result.warnings.push(
              "Only one section was read. Other sections may contain reasoning or conditions needed for the task.",
            );
        }
      }
    } else if (kind === "context") {
      ensure(
        input.record_refs?.length && input.record_refs.length <= 40,
        "VALIDATION_FAILED",
        "Supply 1–40 exact account references",
      );
      chosen = await Promise.all(input.record_refs.map((r) => view.exact(r)));
      result.pagination.total = chosen.length;
    } else {
      const terms = input.query!.toLowerCase().match(/[\p{L}\p{N}_-]+/gu) ?? [];
      const scores = new Map<string, number>();
      // Search across abstraction levels. Summaries and bodies share one identity and one score.
      const receipt = await this.projections.receipt();
      const semantic =
        input.semantic !== false && receipt?.search?.semantic === true;
      if (await this.projections.fresh(view.release, "search")) {
        try {
          const hits = await this.projections.search(
            input.query!,
            view.scope.read_modules,
            semantic,
            Math.min(120, (offset + limit) * 4),
            input.rerank === true,
          );
          ensure(
            await this.projections.fresh(view.release, "search"),
            "INDEX_STALE",
            "Search projection changed during discovery",
          );
          const mapping = await readJson<Record<string, any>>(
            this.store.p(`views/${view.release}/search-map.json`),
          );
          const permitted = new Set(usable.map(key));
          for (const hit of hits.items) {
            const file = String(hit.file ?? "")
                .replace(/^qmd:\/\//, "")
                .split(/[?#]/, 1)[0],
              entry = mapping[file];
            if (entry && permitted.has(key(entry.record_ref)))
              scores.set(
                entry.record_ref.id,
                Math.max(
                  scores.get(entry.record_ref.id) ?? 0,
                  Number(hit.score ?? 1) * 10,
                ),
              );
          }
          result.route.push(semantic ? "semantic" : "keyword_index");
        } catch {
          result.warnings.push(
            "Search projection unavailable; canonical keyword discovery is in use.",
          );
        }
      }
      if (input.semantic !== false && !semantic)
        result.warnings.push(
          "Semantic search is not confirmed for this release; keyword discovery is in use.",
        );
      for (const r of usable) {
        const { text: passageText, ...payloadMetadata } = r.payload as any;
        const metadata = [
          r.title,
          summary(r),
          JSON.stringify(r.extensions?.functional_facets ?? {}),
          JSON.stringify(payloadMetadata),
        ]
          .join(" ")
          .toLowerCase();
        // Extracted passage text is full body content, not an authored summary.
        // Giving it the metadata multiplier otherwise buries concise accounts.
        const body = (
          (await this.store.body(r)) ||
          passageText ||
          ""
        ).toLowerCase();
        const relevance = terms.reduce(
          (score, term) =>
            score + (metadata.includes(term) ? 2 : body.includes(term) ? 1 : 0),
          0,
        );
        if (relevance || scores.has(r.id))
          scores.set(
            r.id,
            (scores.get(r.id) ?? 0) +
              relevance +
              purposeWeight(r, purpose) +
              (input.domains?.some((d) => r.scope.domains.includes(d)) ? 1 : 0),
          );
      }
      const ranked = usable
        .filter((r) => scores.has(r.id))
        .sort(
          (a, b) =>
            scores.get(b.id)! - scores.get(a.id)! ||
            key(a).localeCompare(key(b)),
        );
      chosen = page(ranked);
      const graphFresh =
        input.graph !== false || input.graph_required
          ? await this.projections.fresh(view.release, "graph")
          : false;
      ensure(
        !input.graph_required || graphFresh,
        "GRAPH_UNAVAILABLE",
        "A matching graph projection is unavailable; reindex and resume",
      );
      if (graphFresh && input.graph !== false && chosen.length) {
        try {
          const found = await this.projections.adjacent(
            chosen.map((r) => r.id),
            view.scope.read_modules,
            100,
          );
          const seedIds = new Set(chosen.map((r) => r.id));
          const neighbors = new Map<string, RecordData>();
          for (const id of found) {
            const relation = view.visible.get(id);
            if (
              !relation ||
              relation.record_type !== "relationship" ||
              !view.usable(relation)
            )
              continue;
            const p = relation.payload as any;
            if (!seedIds.has(p.subject.id) && !seedIds.has(p.object.id))
              continue;
            for (const endpoint of [p.subject, p.object]) {
              const record = view.visible.get(endpoint.id);
              if (
                record &&
                key(record) === key(endpoint) &&
                view.usable(record) &&
                !seedIds.has(record.id)
              )
                neighbors.set(record.id, record);
            }
          }
          result.graph_candidates = [...neighbors.values()]
            .slice(0, limit)
            .map((r) =>
              view.card(
                r,
                "Optional typed graph neighbor; relevance and transfer still need judgment",
              ),
            );
          result.graph_omitted = Math.max(0, neighbors.size - limit);
          if (found.length === 100)
            result.warnings.push(
              "Graph exploration reached its edge limit; it does not establish complete coverage.",
            );
          result.route.push("graph");
          ensure(
            await this.projections.fresh(view.release, "graph"),
            "GRAPH_UNAVAILABLE",
            "Graph projection changed during discovery",
          );
        } catch (error: any) {
          ensure(!input.graph_required, "GRAPH_UNAVAILABLE", error.message);
          result.warnings.push(
            "Graph exploration failed; canonical material-context checks remain available.",
          );
          delete result.graph_candidates;
          delete result.graph_omitted;
          result.route = result.route.filter((r: string) => r !== "graph");
        }
      }
      if (!chosen.length)
        result.warnings.push(
          "No usable account matched. State the gap or change the search; do not invent library evidence.",
        );
    }
    result.candidates = chosen.map((r) => view.card(r));
    if (chosen.length) {
      const context = await view.materialContext(chosen),
        start = input.context_offset ?? 0;
      result.necessary_reading = context.required
        .slice(start, start + 40)
        .map(({ record, reason }) => view.card(record, reason));
      result.relationships = context.relationships.slice(start, start + 40);
      result.material_context = {
        resolved: context.complete,
        total_accounts: context.required.length,
        total_relationships: context.relationships.length,
        offset: start,
        next_offset:
          start + 40 <
          Math.max(context.required.length, context.relationships.length)
            ? start + 40
            : null,
      };
      result.warnings.push(...context.warnings);
      const support = new Map<string, Ref>();
      for (const record of chosen)
        for (const reference of record.depends_on)
          support.set(key(reference), reference);
      result.traceable_support = [...support.values()];
    }
    result.warnings = [...new Set(result.warnings)];
    result.timings_ms = { total: performance.now() - started };
    const rendered = json(result);
    result.usage = {
      rendered_characters: rendered.length,
      estimated_tokens: Math.ceil(rendered.length / 4),
      measurement:
        "JSON characters before this usage field; tokens are an estimate, not measured model input",
    };
    await validate("reading", result);
    await atomic(
      this.store.p(`retrieval-receipts/${result.request_id}.json`),
      json({
        interface_version: result.interface_version,
        request_id: result.request_id,
        kind,
        release_id: view.release,
        query_hash: input.query ? hash(input.query) : null,
        record_refs: chosen.map(ref),
        necessary_refs: result.necessary_reading.map((r: any) => r.record_ref),
        section_id: input.section_id ?? null,
        reading_status: result.reading_status,
        material_context: result.material_context,
        usage: result.usage,
        timings_ms: result.timings_ms,
      }),
    );
    return result;
  }

  private payloadText(record: RecordData) {
    const p = record.payload as any;
    return (
      p.text ||
      p.definition ||
      p.rationale ||
      p.summary ||
      (record.record_type === "question"
        ? `Known: ${p.known}\nUnknown: ${p.unknown}\nDecision impact: ${p.impact}\nNext action: ${p.next_action}`
        : json(record.payload))
    );
  }
}

import * as fs from "node:fs/promises";
import path from "node:path";
import { Store, type Materialized } from "./store.js";
import {
  VERSION,
  ENGINE_VERSION,
  APP,
  ensure,
  uid,
  hash,
  fileHash,
  immutableCopy,
  json,
  readJson,
  atomic,
  immutable,
  exists,
  validate,
  now,
  ref,
  key,
  objectPath,
  emptyScope,
  emptyAssessment,
  withLock,
  subset,
  safePath,
  STATE,
} from "./core.js";
import type { Ref, RecordData, Scope, JobData, ProposalData } from "./core.js";
import { run } from "./process.js";
import { Media } from "./media.js";
const STAGES = [
  "register",
  "convert",
  "reconstruct",
  "integrate",
  "discover",
  "reweave",
  "compile",
  "check",
  "publish",
] as const;
const guidance: Record<string, string> = {
  reconstruct:
    "Read source units independently, including visual assets. Submit a meaningful reading receipt per unit. Reconstruct the whole argument after section work; extraction does not count as reading.",
  integrate:
    "Compare the source account with permitted existing knowledge. Preserve definitions, evidence families and disagreements. Author coherent explanations and qualified links through kb_propose.",
  discover:
    "Search by mechanism, purpose and constraints. Retain warranted opportunities/questions or record that none survived. State searched scope, stopping reason and unfinished work.",
  reweave:
    "Review affected prose, prerequisites, cases, judgments and primers. Revise, reaffirm with evidence, or mark unresolved. Return resolutions keyed to impacted record IDs.",
  compile:
    "Create or revise coherent topic articles, appropriate domain primer, worked application and teaching material. Use only warranted forms; no quotas.",
  check:
    "Resolve structural and locator errors. Record source fidelity review, regression results and independent capability status. Semantic failure blocks affected synthesis; unassessed capability is explicit.",
  publish:
    "Publish validated staged meaning as one research release. Coverage obligations must be read/integrated/checked or explicitly excluded with a reason.",
};
export class Jobs {
  constructor(
    public store: Store,
    private mediaFactory = () => new Media(),
    private runtimeConfig = () => readJson(path.join(STATE, "config.json")),
  ) {}
  jobPath(id: string) {
    ensure(/^[a-zA-Z0-9_-]+$/.test(id), "VALIDATION_FAILED", "Invalid job ID");
    return this.store.p(`jobs/${id}`);
  }
  async load(id: string) {
    const j = await readJson<JobData>(path.join(this.jobPath(id), "job.json"));
    await validate("job", j);
    await this.store.scope(j.scope_policy);
    return j;
  }
  async save(j: JobData) {
    await validate("job", j);
    await atomic(path.join(this.jobPath(j.job_id), "job.json"), json(j));
  }
  async reservePaid(
    id: string,
    requestId: string,
    cost: number,
    budget: { limit: number; currency: string; authorization: string },
  ) {
    return withLock(this.store.root, "paid-accounting", async () => {
      await this.load(id);
      ensure(
        Number.isFinite(cost) &&
          cost >= 0 &&
          Number.isFinite(budget.limit) &&
          budget.limit > 0 &&
          budget.authorization,
        "PAID_BUDGET_REQUIRED",
        "Invalid paid reservation",
      );
      const file = path.join(this.jobPath(id), "paid-accounting.json"),
        account = await readJson(file).catch(() => ({
          currency: budget.currency,
          reservations: [],
        }));
      ensure(
        account.currency === budget.currency,
        "PAID_BUDGET_REQUIRED",
        "A job cannot mix pricing currencies",
      );
      const previous = account.reservations.find(
        (r: any) => r.request_id === requestId,
      );
      if (previous) {
        ensure(
          previous.estimated_cost === cost,
          "PAID_BUDGET_REQUIRED",
          "Reserved price changed; reconcile it before proceeding",
        );
        return account;
      }
      const total =
        account.reservations.reduce(
          (n: number, r: any) => n + r.estimated_cost,
          0,
        ) + cost;
      ensure(
        total <= budget.limit,
        "PAID_BUDGET_REQUIRED",
        "Combined job reservations exceed the authorized estimate allowance",
        {
          reserved_plus_next: total,
          limit: budget.limit,
          currency: budget.currency,
        },
      );
      account.reservations.push({
        request_id: requestId,
        estimated_cost: cost,
        reserved_at: now(),
      });
      account.limit = budget.limit;
      account.authorization = budget.authorization;
      account.estimated_reserved = total;
      account.actual_cost = null;
      await atomic(file, json(account));
      return account;
    });
  }
  async ingest(input: {
    paths: string[];
    module: string;
    domains: string[];
    idempotency_key: string;
    authorization: string;
    scope?: Scope;
  }) {
    const scope = await this.store.scope(input.scope);
    ensure(
      scope.write_modules.includes(input.module),
      "SCOPE_DENIED",
      "No write permission for source module",
    );
    ensure(
      input.paths.length,
      "VALIDATION_FAILED",
      "Supply at least one source",
    );
    return withLock(this.store.root, "jobs", async () => {
      const id = "job-" + hash(input.idempotency_key).slice(0, 28),
        dir = this.jobPath(id);
      const signature = hash(json(input));
      if (await exists(path.join(dir, "request.json"))) {
        const request = await readJson(path.join(dir, "request.json"));
        ensure(
          request.signature === signature,
          "REVISION_CONFLICT",
          "Idempotency key reused for a different ingestion",
        );
        if (await exists(path.join(dir, "job.json"))) return this.next(id);
        if (request.initial)
          return this.finishRegistration(dir, request.initial);
        // Legacy requests preceded their job checkpoint without a recovery snapshot.
        // Rebuild only initial staging; do not overwrite later authoring work.
        const staged = await readJson(path.join(dir, "staged.json")).catch(
          () => null,
        );
        ensure(
          !staged?.proposal_hash &&
            !(staged?.records ?? []).some(
              (r: RecordData) => r.record_type !== "source",
            ),
          "REVISION_CONFLICT",
          "Missing job checkpoint has later authoring work; preserve it for reconciliation",
        );
      }
      const sourceRecords: RecordData[] = [],
        coverage: any[] = [],
        known = await this.store.records();
      for (const supplied of input.paths) {
        const absolute = path.resolve(supplied);
        ensure(
          !(await fs.lstat(absolute)).isSymbolicLink(),
          "SOURCE_UNREADABLE",
          "Source symlink not accepted",
        );
        const digest = await fileHash(absolute);
        const duplicate = [...known.values(), ...sourceRecords].find(
          (r) =>
            r.record_type === "source" && (r.payload as any).sha256 === digest,
        );
        if (duplicate) {
          ensure(
            await this.store.allowed(duplicate, scope),
            "SCOPE_DENIED",
            "Duplicate source is outside this scope",
          );
          if (!sourceRecords.some((r) => r.id === duplicate.id))
            sourceRecords.push(duplicate);
          continue;
        }
        ensure(
          !(await this.store.ledger()).purged_hashes.includes(digest),
          "CONTENT_PURGED",
          "Source was previously purged",
        );
        const identity = { id: "source:" + digest.slice(0, 28), revision: 1 },
          extension = path.extname(absolute).toLowerCase();
        const original_path = `sources/${digest.slice(0, 28)}/1/original${extension}`;
        await immutableCopy(absolute, this.store.p(original_path), digest);
        const source = {
          schema_version: VERSION,
          ...identity,
          corpus_id: (await this.store.config()).corpus_id,
          record_type: "source",
          title: path.basename(absolute),
          created_at: now(),
          lifecycle: "active",
          archived: false,
          maintenance_module: input.module,
          epistemic: "administrative",
          scope: emptyScope(input.domains),
          provenance: {
            actor: "codex",
            method: "source_registration",
            source_refs: [],
            input_refs: [],
            tool_versions: { coordinator: ENGINE_VERSION },
          },
          assessments: {
            fidelity: emptyAssessment(),
            evidence: emptyAssessment(),
            applicability: emptyAssessment(),
          },
          depends_on: [],
          supersedes: [],
          change_reason: "Registered supplied original",
          body: null,
          extensions: {},
          payload: {
            original_path,
            sha256: digest,
            media_type:
              extension === ".pdf"
                ? "application/pdf"
                : [".md", ".txt", ".srt", ".vtt"].includes(extension)
                  ? "text/plain"
                  : extension === ".epub"
                    ? "application/epub+zip"
                    : extension === ".html"
                      ? "text/html"
                      : extension.replace(".", "media/"),
            edition: "supplied-" + digest.slice(0, 12),
            origin_id: digest,
            evidence_family: "unknown-" + digest.slice(0, 12),
            independence: "unknown",
            derived_from_sources: [],
          },
        } as RecordData;
        const registrationPath = this.store.p(
          path.posix.dirname(original_path) + "/registration.json",
        );
        let registered = source;
        if (await exists(registrationPath)) {
          const prior = await readJson(registrationPath);
          registered = prior.source_record ?? {
            ...source,
            created_at: prior.registered_at,
          };
          ensure(
            await this.store.allowed(registered, scope),
            "SCOPE_DENIED",
            "Previously registered source is outside this job scope",
          );
        } else
          await immutable(
            registrationPath,
            json({
              supplied_path: absolute,
              hash: digest,
              registered_at: source.created_at,
              user_supplied: true,
              source_record: source,
            }),
          );
        await validate("record", registered);
        sourceRecords.push(registered);
      }
      for (const source of sourceRecords)
        coverage.push({
          unit_id: source.id + ":unconverted",
          source_ref: ref(source),
          locator: {
            kind: "lines",
            label: "Pending structural conversion",
            start: 1,
            end: 1,
            anchor: null,
            precision: "approximate",
          },
          registered: "complete",
          converted: "pending",
          read: "pending",
          integrated: "pending",
          checked: "pending",
          receipts: [],
          gaps: ["Source structure not converted yet"],
          exclusion_reason: null,
        });
      const job: JobData = {
        schema_version: VERSION,
        job_id: id,
        corpus_id: (await this.store.config()).corpus_id,
        base_release: await this.store.current(),
        idempotency_key: input.idempotency_key,
        authorized_scope: input.authorization,
        scope_policy: scope,
        stage: "convert",
        status: "pending",
        source_refs: sourceRecords.map(ref),
        coverage,
        remaining_work: ["Convert sources and reconstruct understanding"],
        receipts: [],
        paid_budget: { currency: null, limit: null, provider_request_ids: [] },
        error: null,
      };
      const initial = {
        job,
        sources: sourceRecords,
        staged: {
          records: sourceRecords.filter((r) => !known.has(r.id)),
          bodies: {},
          local_refs: {},
          proposal_hash: "",
        },
      };
      await atomic(
        path.join(dir, "request.json"),
        json({ signature, input, initial }),
      );
      if (process.env.KB_TEST_FAULT === "ingest_after_request")
        ensure(
          false,
          "SIMULATED_CRASH",
          "Interrupted initial job registration",
        );
      return this.finishRegistration(dir, initial);
    });
  }
  private async finishRegistration(
    dir: string,
    initial: { job: JobData; sources: RecordData[]; staged: Materialized },
  ) {
    await validate("job", initial.job);
    const scope = await this.store.scope(initial.job.scope_policy);
    ensure(
      initial.job.corpus_id === (await this.store.config()).corpus_id &&
        dir === this.jobPath(initial.job.job_id),
      "SCOPE_DENIED",
      "Registration snapshot belongs to another job or corpus",
    );
    for (const source of initial.sources) {
      await validate("record", source);
      if (initial.staged.records.some((r) => r.id === source.id))
        await this.store.requireWritable(source, scope);
      else
        ensure(
          await this.store.allowed(source, scope),
          "SCOPE_DENIED",
          "Existing source is outside this job scope",
        );
      const payload = source.payload as any;
      ensure(
        !(await this.store.ledger()).purged_hashes.includes(payload.sha256),
        "CONTENT_PURGED",
        "Source was purged during registration",
      );
      ensure(
        (await fileHash(
          await safePath(this.store.root, payload.original_path),
        )) === payload.sha256,
        "SOURCE_UNREADABLE",
        "Preserved source changed during registration",
      );
    }
    await atomic(path.join(dir, "sources.json"), json(initial.sources));
    await atomic(path.join(dir, "staged.json"), json(initial.staged));
    await this.store.audit(
      "ingest",
      "Registered supplied source material",
      initial.job.source_refs,
      null,
      "completed",
      "event-ingest-" + hash(initial.job.job_id).slice(0, 28),
    );
    await this.save(initial.job);
    return this.next(initial.job.job_id);
  }
  async next(id: string) {
    const j = await this.load(id),
      sources = await readJson<RecordData[]>(
        path.join(this.jobPath(id), "sources.json"),
      );
    return {
      job: j,
      instruction:
        guidance[j.stage] ??
        "Convert original sources; inspect the extraction and coverage units.",
      source_paths: sources.map((s) => ({
        record_ref: ref(s),
        path: this.store.p((s.payload as any).original_path),
      })),
      recommended_guides: [
        ...new Set(
          sources.map((s) =>
            /\.(mp4|mkv|mov|webm|mp3|wav|m4a|flac|ogg)$/i.test(
              (s.payload as any).original_path,
            )
              ? "video"
              : /\.(pdf|epub)$/i.test((s.payload as any).original_path)
                ? "books"
                : "ingestion",
          ),
        ),
      ],
      staged_path: path.join(this.jobPath(id), "staged.json"),
    };
  }
  async readUnit(id: string, unitId: string, offset = 0, limit = 16000) {
    const j = await this.load(id),
      coverage = j.coverage.find((u) => u.unit_id === unitId);
    ensure(
      coverage && coverage.converted === "complete",
      "VALIDATION_FAILED",
      "Unknown or unconverted source unit",
    );
    ensure(
      Number.isInteger(offset) &&
        offset >= 0 &&
        Number.isInteger(limit) &&
        limit > 0 &&
        limit <= 32000,
      "VALIDATION_FAILED",
      "Use a nonnegative character offset and a limit of 1 to 32000",
    );
    const ledger = await this.store.ledger();
    ensure(
      !ledger.blocked_ids.includes(coverage.source_ref.id),
      "CONTENT_PURGED",
      "Source is blocked by deletion policy",
    );
    const mapping = coverage.receipts.find((r) =>
      /\/(extraction|supp-[a-f0-9]+)\.json$/.test(r),
    );
    ensure(mapping, "SOURCE_UNREADABLE", "Extraction mapping is unavailable");
    const extraction = await readJson(await safePath(this.store.root, mapping));
    const unit = extraction.units.find((u: any) => u.unit_id === unitId);
    ensure(
      unit,
      "SOURCE_UNREADABLE",
      "Coverage unit is missing from its extraction",
    );
    const text = unit.text ?? "";
    if (unit.sha256)
      ensure(
        hash(text) === unit.sha256,
        "SOURCE_UNREADABLE",
        "Extracted text hash mismatch",
      );
    ensure(
      offset <= text.length,
      "VALIDATION_FAILED",
      "Offset exceeds source unit length",
    );
    let image: { mimeType: string; data: string } | null = null;
    if (unit.asset_path && offset === 0) {
      const asset = await safePath(this.store.root, unit.asset_path),
        ext = path.extname(asset).toLowerCase();
      ensure(
        [".png", ".jpg", ".jpeg", ".webp"].includes(ext),
        "SOURCE_UNREADABLE",
        "Unsupported visual asset type",
      );
      if (unit.asset_sha256)
        ensure(
          hash(await fs.readFile(asset)) === unit.asset_sha256,
          "SOURCE_UNREADABLE",
          "Visual asset hash mismatch",
        );
      const stat = await fs.stat(asset);
      ensure(
        stat.size <= 10 * 1024 * 1024,
        "SOURCE_UNREADABLE",
        "Visual exceeds the 10 MiB tool limit; inspect it locally",
      );
      image = {
        mimeType:
          ext === ".png"
            ? "image/png"
            : ext === ".webp"
              ? "image/webp"
              : "image/jpeg",
        data: (await fs.readFile(asset)).toString("base64"),
      };
    }
    return {
      unit_id: unitId,
      source_ref: coverage.source_ref,
      kind: unit.kind,
      locator: unit.locator,
      extraction_sha256: unit.sha256,
      asset_path: unit.asset_path ?? null,
      text: text.slice(offset, offset + limit),
      offset,
      total_characters: text.length,
      next_offset: offset + limit < text.length ? offset + limit : null,
      limitations: extraction.limitations ?? [],
      details: unit.details ?? null,
      evidence_only: true,
      image,
    };
  }
  async recoverProposal(id: string) {
    const dir = this.jobPath(id),
      file = path.join(dir, "pending-proposal.json");
    if (!(await exists(file))) return;
    const pending = await readJson(file),
      staged = await fs.readFile(path.join(dir, "staged.json"));
    const after = json(pending.after);
    ensure(
      [pending.before_hash, hash(after)].includes(hash(staged)),
      "REVISION_CONFLICT",
      "Interrupted proposal has conflicting staging; preserve it for reconciliation",
    );
    ensure(
      hash(json(pending.proposal)) === pending.digest,
      "VALIDATION_FAILED",
      "Proposal journal hash mismatch",
    );
    await atomic(path.join(dir, "staged.json"), after);
    const name = hash(pending.proposal.proposal_id);
    await immutable(
      path.join(
        dir,
        "proposals",
        name + "." + pending.digest + ".proposal.json",
      ),
      json(pending.proposal),
    );
    await immutable(
      path.join(dir, "proposals", pending.digest + ".receipt.json"),
      json(pending.receipt),
    );
    await atomic(
      path.join(dir, "proposals", name + ".json"),
      json(pending.receipt),
    );
    await fs.rm(file, { force: true });
  }
  async convert(
    id: string,
    budget?: { limit: number; currency: string; authorization: string },
    options: { pdf_profile?: "technical" | "prose" | "ocr" } = {},
  ) {
    ensure(
      !options.pdf_profile ||
        ["technical", "prose", "ocr"].includes(options.pdf_profile),
      "VALIDATION_FAILED",
      "Unknown PDF profile",
    );
    return withLock(this.store.root, "conversion", async () => {
      const started = performance.now(),
        j = await this.load(id);
      ensure(
        j.status !== "cancelled" && j.stage === "convert",
        "VALIDATION_FAILED",
        "Job is not at conversion",
      );
      const sources = await readJson<RecordData[]>(
        path.join(this.jobPath(id), "sources.json"),
      );
      const units: any[] = [];
      if (
        sources.some((s) =>
          /\.(mp4|mkv|mov|webm|mp3|wav|m4a|flac|ogg)$/i.test(
            (s.payload as any).original_path,
          ),
        )
      ) {
        ensure(
          budget?.limit && budget.authorization,
          "PAID_BUDGET_REQUIRED",
          "Media needs a job allowance",
        );
        const runtime = await this.runtimeConfig();
        let total = 0;
        for (const s of sources) {
          if (
            /\.(mp4|mkv|mov|webm|mp3|wav|m4a|flac|ogg)$/i.test(
              (s.payload as any).original_path,
            )
          ) {
            const plan = await this.mediaFactory().plan(
              this.store.p((s.payload as any).original_path),
              runtime.transcription,
            );
            ensure(
              plan.currency === budget.currency,
              "PAID_BUDGET_REQUIRED",
              "Currency mismatch",
            );
            total += plan.estimated_reservation;
          }
        }
        ensure(
          total <= budget.limit,
          "PAID_BUDGET_REQUIRED",
          "Whole media job estimate exceeds allowance before any request",
          { estimated_reservation: total, limit: budget.limit },
        );
      }
      for (const source of sources) {
        const p = source.payload as any,
          folder = path.posix.dirname(p.original_path) + "/extractions/" + id,
          ext = path.extname(p.original_path);
        let extraction: any;
        await fs.mkdir(this.store.p(folder), { recursive: true });
        const target = this.store.p(folder + "/extraction.json");
        ensure(
          (await fileHash(this.store.p(p.original_path))) === p.sha256,
          "SOURCE_UNREADABLE",
          "Preserved original hash mismatch",
        );
        if (await exists(target)) {
          extraction = await readJson(target);
          ensure(
            extraction.source_sha256 === p.sha256,
            "SOURCE_UNREADABLE",
            "Existing extraction belongs to different source bytes",
          );
          if (ext === ".pdf")
            ensure(
              extraction.settings?.pdf_profile ===
                (options.pdf_profile ?? "technical"),
              "REVISION_CONFLICT",
              "PDF profile changed during conversion; use a new job",
            );
        } else if ([".md", ".txt", ".srt", ".vtt"].includes(ext)) {
          const text = await fs.readFile(this.store.p(p.original_path), "utf8"),
            lines = text.split(/\r?\n/),
            chunks: any[] = [];
          let start = 0;
          for (let i = 1; i <= lines.length; i++) {
            if (
              i === lines.length ||
              (/^#{1,4} /.test(lines[i] ?? "") && i > start) ||
              i - start >= 120
            ) {
              const part = lines.slice(start, i).join("\n");
              if (part.trim())
                chunks.push({
                  unit_id: `${source.id}:lines-${start + 1}-${i}`,
                  kind: "text",
                  text: part,
                  sha256: hash(part),
                  asset_path: null,
                  locator: {
                    kind: "lines",
                    label: `Lines ${start + 1}–${i}`,
                    start: start + 1,
                    end: i,
                    anchor: null,
                    precision: "exact",
                  },
                });
              start = i;
            }
          }
          if (lines.some((l) => l.length > 8000)) {
            chunks.length = 0;
            let offset = 0;
            while (offset < text.length) {
              let end = Math.min(offset + 5500, text.length);
              if (end < text.length) {
                const boundary = text.lastIndexOf(". ", end);
                if (boundary > offset + 3000) end = boundary + 2;
              }
              const part = text.slice(offset, end);
              chunks.push({
                unit_id: `${source.id}:chars-${offset}-${end}`,
                kind: "text",
                text: part,
                sha256: hash(part),
                asset_path: null,
                locator: {
                  kind: "lines",
                  label: `Original text UTF-16 characters ${offset}–${end}`,
                  start: text.slice(0, offset).split("\n").length,
                  end: text.slice(0, end).split("\n").length,
                  anchor: `utf16-chars:${offset}:${end}`,
                  precision: "exact",
                },
              });
              offset = end;
            }
          }
          extraction = {
            version: 1,
            source_sha256: p.sha256,
            parser: "direct-text-1",
            offset_encoding: "utf16-code-units",
            units: chunks,
            limitations:
              ext === ".srt" || ext === ".vtt"
                ? [
                    "Caption file: original media visuals remain outside this supplied source.",
                  ]
                : [],
          };
        } else {
          const runtime = await this.runtimeConfig();
          const output = this.store.p(folder);
          if (
            [
              ".mp4",
              ".mkv",
              ".mov",
              ".webm",
              ".mp3",
              ".wav",
              ".m4a",
              ".flac",
              ".ogg",
            ].includes(ext)
          ) {
            j.paid_budget.currency = budget?.currency ?? null;
            j.paid_budget.limit = budget?.limit ?? null;
            await this.save(j);
            try {
              extraction = await this.mediaFactory().convert(
                this.store.p(p.original_path),
                output,
                budget!,
                runtime.transcription,
                async () => {
                  ensure(
                    (await this.load(id)).status !== "cancelled",
                    "JOB_CANCELLED",
                    "Cancelled: no new paid request submitted",
                  );
                },
                (requestId, cost) =>
                  this.reservePaid(id, requestId, cost, budget!),
              );
            } finally {
              const requests = await readJson<any[]>(
                path.join(output, "transcription-requests.json"),
              ).catch(() => []);
              const current = await this.load(id);
              current.paid_budget.provider_request_ids = [
                ...new Set([
                  ...current.paid_budget.provider_request_ids,
                  ...requests.map((r) => r.provider_request_id ?? r.id),
                ]),
              ];
              await this.save(current);
            }
          } else {
            const result = await run(
              runtime.python,
              [
                path.join(APP, "scripts/convert.py"),
                this.store.p(p.original_path),
                output,
                JSON.stringify({ ...options, pdftotext: runtime.pdftotext }),
              ],
              { timeout: 1800000, env: { KB_NODE: process.execPath } },
            );
            extraction = JSON.parse(result.stdout);
          }
          for (const u of extraction.units) {
            u.unit_id = source.id + ":" + u.unit_id;
            u.locator.anchor = "extract:" + id + ":" + (u.locator.anchor ?? "");
            if (u.asset_path)
              u.asset_path = path
                .relative(this.store.root, u.asset_path)
                .replaceAll("\\", "/");
          }
        }
        await immutable(target, json(extraction));
        for (const u of extraction.units)
          units.push({
            unit_id: u.unit_id,
            source_ref: ref(source),
            locator: u.locator,
            registered: "complete",
            converted: "complete",
            read: "pending",
            integrated: "pending",
            checked: "pending",
            receipts: [folder + "/extraction.json"],
            gaps:
              u.kind === "figure" || u.kind === "frame"
                ? ["Visual interpretation pending"]
                : [],
            exclusion_reason: null,
          });
      }
      ensure(
        units.length,
        "SOURCE_UNREADABLE",
        "No readable source units were extracted",
      );
      const current = await this.load(id);
      j.paid_budget = current.paid_budget;
      j.coverage = units;
      j.stage = "reconstruct";
      j.status =
        current.status === "cancelled" ? "cancelled" : "waiting_for_codex";
      j.remaining_work = units.map((u) => u.unit_id);
      await this.save(j);
      await atomic(
        path.join(this.jobPath(id), "conversion-usage.json"),
        json({
          elapsed_ms: performance.now() - started,
          sources: sources.length,
          units: units.length,
          model_tokens: null,
          model_tokens_status:
            "Conversion does not expose Codex usage; do not infer from bytes.",
          peak_rss: null,
          peak_rss_status:
            "Per-operation peak unavailable; see measured acceptance benchmarks.",
        }),
      );
      return this.next(id);
    });
  }
  async propose(p: ProposalData, replace = false) {
    return withLock(this.store.root, "jobs", async () => {
      const j = await this.load(p.job_id);
      await this.recoverProposal(p.job_id);
      ensure(
        !["cancelled", "complete"].includes(j.status),
        "VALIDATION_FAILED",
        "Job cannot accept a proposal",
      );
      ensure(
        p.base_release === j.base_release,
        "REVISION_CONFLICT",
        "Proposal base differs from job",
      );
      const dir = this.jobPath(j.job_id),
        receiptFile = path.join(
          dir,
          "proposals",
          hash(p.proposal_id) + ".json",
        ),
        digest = hash(json(p));
      let previousReceipt: any = null;
      if (await exists(receiptFile)) {
        previousReceipt = await readJson(receiptFile);
        if (previousReceipt.proposal_hash === digest) return previousReceipt;
        ensure(
          replace,
          "REVISION_CONFLICT",
          "Proposal ID reused with different content; explicitly replace this uncommitted proposal",
        );
      }
      // Pending originals are committed only with the integrated release. Make them available to the compiler's exact resolver through the staged authoring batch.
      const before = await fs.readFile(path.join(dir, "staged.json")),
        staged = JSON.parse(before.toString()) as Materialized;
      subset(p.scope_policy, j.scope_policy);
      const removed = new Set<string>(
        (previousReceipt?.records ?? []).map((r: Ref) => r.id),
      );
      staged.records = staged.records.filter((r) => !removed.has(r.id));
      const compiled = await this.store.compile(p, staged.records);
      for (const r of compiled.records) {
        const previous = staged.records.find((x) => x.id === r.id);
        ensure(
          !previous,
          "REVISION_CONFLICT",
          "Record already staged in this job; revise the existing proposal as a batch",
        );
        staged.records.push(r);
      }
      Object.assign(staged.bodies, compiled.bodies);
      Object.assign(staged.local_refs, compiled.local_refs);
      await this.store.validateRecords(
        staged.records,
        staged.bodies,
        j.scope_policy,
        await this.store.records(),
      );
      const receipt = {
        proposal_hash: digest,
        records: compiled.records.map(ref),
        local_refs: compiled.local_refs,
        created_at: now(),
      };
      await atomic(
        path.join(dir, "pending-proposal.json"),
        json({
          before_hash: hash(before),
          after: staged,
          proposal: p,
          digest,
          receipt,
        }),
      );
      await atomic(path.join(dir, "staged.json"), json(staged));
      ensure(
        process.env.KB_TEST_FAULT !== "proposal_after_staging",
        "SIMULATED_CRASH",
        "Injected interruption after proposal staging",
      );
      await this.recoverProposal(p.job_id);
      return receipt;
    });
  }
  async submit(
    id: string,
    input: {
      step_id: string;
      stage: string;
      summary: string;
      coverage?: {
        unit_id: string;
        status: "complete" | "excluded";
        reason?: string;
      }[];
      resolutions?: unknown[];
      capability?: string;
      stopping_reason?: string;
      unfinished?: string[];
    },
  ) {
    return withLock(this.store.root, "jobs", async () => {
      const j = await this.load(id),
        receipt = `jobs/${id}/steps/${hash(input.step_id)}.json`,
        written = await exists(this.store.p(receipt));
      if (written) {
        const old = await readJson(this.store.p(receipt));
        ensure(
          old.input_hash === hash(json(input)),
          "REVISION_CONFLICT",
          "Step ID reused",
        );
        if (j.receipts.includes(receipt)) return this.next(id);
        if (STAGES.indexOf(j.stage) > STAGES.indexOf(input.stage as any)) {
          j.receipts.push(receipt);
          await this.save(j);
          return this.next(id);
        }
      }
      ensure(
        j.status !== "cancelled" &&
          j.status !== "complete" &&
          input.stage === j.stage,
        "VALIDATION_FAILED",
        "Receipt does not match active stage",
      );
      ensure(
        input.summary.trim().length > 20,
        "VALIDATION_FAILED",
        "A substantive receipt is required",
      );
      if (j.stage === "discover")
        ensure(
          input.stopping_reason && Array.isArray(input.unfinished),
          "VALIDATION_FAILED",
          "Discovery requires stopping reason and remaining scope",
        );
      if (j.stage === "check")
        ensure(
          input.capability &&
            ["checked", "unresolved_failures", "not_assessed"].includes(
              input.capability,
            ),
          "VALIDATION_FAILED",
          "Explicit capability state required",
        );
      const field =
        j.stage === "reconstruct"
          ? "read"
          : j.stage === "integrate"
            ? "integrated"
            : j.stage === "check"
              ? "checked"
              : null;
      if (field) {
        for (const update of input.coverage ?? []) {
          const unit = j.coverage.find((u) => u.unit_id === update.unit_id);
          ensure(unit, "VALIDATION_FAILED", "Unknown coverage unit");
          if (update.status === "excluded") {
            ensure(
              update.reason?.trim(),
              "VALIDATION_FAILED",
              "Excluded coverage requires a reason",
            );
            unit.exclusion_reason = update.reason!;
          }
          unit[field] = update.status;
          unit.receipts.push(receipt);
          if (field === "read") unit.gaps = [];
        }
      }
      if (!written)
        await immutable(
          this.store.p(receipt),
          json({
            input_hash: hash(json(input)),
            input,
            timestamp: now(),
            actor: "codex",
          }),
        );
      ensure(
        process.env.KB_TEST_FAULT !== "step_before_checkpoint",
        "SIMULATED_CRASH",
        "Injected interruption before step checkpoint",
      );
      j.receipts.push(receipt);
      const pending = field
        ? j.coverage.filter(
            (u) => u[field] !== "complete" && u[field] !== "excluded",
          )
        : [];
      if (!pending.length && input.capability !== "unresolved_failures")
        j.stage = STAGES[STAGES.indexOf(j.stage) + 1] ?? "publish";
      j.status = "waiting_for_codex";
      j.remaining_work = pending.length
        ? pending.map((u) => u.unit_id)
        : (input.unfinished ?? []);
      await this.save(j);
      return this.next(id);
    });
  }
  async publish(id: string) {
    return withLock(this.store.root, "jobs", async () => {
      const j = await this.load(id);
      await this.recoverProposal(id);
      ensure(
        j.stage === "publish" && j.status !== "cancelled",
        "VALIDATION_FAILED",
        "Job has not completed its required stages",
      );
      await this.store.recover();
      let release = await this.store.release();
      while (release) {
        if (release.change_reason === "Integrated research job " + id) {
          j.status = "complete";
          j.remaining_work = [];
          await this.save(j);
          return {
            release_id: release.release_id,
            status: "canonical_committed",
            views: "check_receipt",
            recovered: true,
          };
        }
        release = release.parent_release
          ? await this.store.release(release.parent_release)
          : null;
      }
      ensure(
        j.coverage.every((u) =>
          ["read", "integrated", "checked"].every((k) =>
            ["complete", "excluded"].includes((u as any)[k]),
          ),
        ),
        "COVERAGE_INCOMPLETE",
        "Unaccounted source units",
      );
      const staged = await readJson<Materialized>(
        path.join(this.jobPath(id), "staged.json"),
      );
      const result = await this.store.publish(
        staged.records,
        staged.bodies,
        j.base_release,
        "Integrated research job " + id,
        j.scope_policy,
        j.receipts,
      );
      j.status = "complete";
      j.remaining_work = [];
      await this.save(j);
      return result;
    });
  }
  async action(id: string, action: string) {
    return withLock(this.store.root, "jobs", async () => {
      const j = await this.load(id);
      if (action === "cancel") j.status = "cancelled";
      else if (action === "resume") {
        ensure(
          j.status !== "complete",
          "VALIDATION_FAILED",
          "Job is already complete",
        );
        j.status = "waiting_for_codex";
      } else if (action === "rebase") {
        ensure(
          j.status !== "complete",
          "VALIDATION_FAILED",
          "Job is already complete",
        );
        const staged = await readJson<Materialized>(
            path.join(this.jobPath(id), "staged.json"),
          ),
          current = await this.store.records();
        staged.records = staged.records.filter(
          (r) => !current.has(r.id) || key(current.get(r.id)!) !== key(r),
        );
        await this.store.validateRecords(
          staged.records,
          staged.bodies,
          j.scope_policy,
          current,
        );
        j.base_release = await this.store.current();
        j.stage = "reweave";
        j.status = "waiting_for_codex";
        await atomic(path.join(this.jobPath(id), "staged.json"), json(staged));
      } else throw new Error("Unknown job action");
      await this.save(j);
      return this.next(id);
    });
  }
}

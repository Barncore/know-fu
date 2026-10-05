import * as fs from "node:fs/promises";
import { AsyncLocalStorage } from "node:async_hooks";
import { VerifiedCache, mapLimit } from "./verified-cache.js";
import { knowledgeImpact } from "./knowledge-impact.js";
import { closestSpan, quoteFound } from "./quote.js";
import path from "node:path";
import {
  APP,
  VERSION,
  ENGINE_VERSION,
  KBError,
  ensure,
  exists,
  readJson,
  atomic,
  immutable,
  safePath,
  withLock,
  validate,
  hash,
  json,
  now,
  uid,
  key,
  ref,
  refs,
  recordRefs,
  uniqueRefs,
  objectPath,
  subset,
  emptyAssessment,
  STATE,
} from "./core.js";
import type {
  RecordData,
  CorpusData,
  ReleaseData,
  ProposalData,
  Ref,
  Scope,
} from "./core.js";

export type Materialized = {
  records: RecordData[];
  bodies: Record<string, string>;
  proposal_hash: string;
  local_refs: Record<string, Ref>;
};
export type Ledger = {
  version: 1;
  corpus_id: string;
  generation: number;
  blocked_ids: string[];
  /** Exact historical revisions (id@revision) purged while later revisions of the id remain. */
  blocked_refs?: string[];
  purged_hashes: string[];
  operations: unknown[];
};
type ReadSession = {
  config: CorpusData;
  ledger: Ledger;
  current: string | null;
  signature: string;
  memo: Map<string, Promise<unknown>>;
};

export class Store {
  private integrity = new Map<string, string>();
  private integrityRelease: string | null | undefined;
  private sessions = new AsyncLocalStorage<ReadSession>();
  private files: VerifiedCache;
  private controlSignature: string | null = null;

  constructor(
    public root: string,
    public project: string,
    public ledgerRoot = path.join(STATE, "ledgers"),
    cacheBytes?: number,
  ) {
    this.root = path.resolve(root);
    this.files = new VerifiedCache(this.root, cacheBytes);
  }

  p(relative: string) {
    return path.join(this.root, relative);
  }
  /** Identifies the controls snapshot of the active read session, for derived caches. */
  sessionSignature() {
    return this.sessions.getStore()?.signature ?? null;
  }
  cacheStats() {
    return this.files.stats();
  }
  clearReadCache() {
    this.files.clear();
    this.integrity.clear();
    this.integrityRelease = undefined;
  }

  private memo<T>(name: string, read: () => Promise<T>): Promise<T> {
    const session = this.sessions.getStore();
    if (!session) return read();
    let pending = session.memo.get(name) as Promise<T> | undefined;
    if (!pending) {
      pending = read();
      session.memo.set(name, pending);
      pending.catch(() => session.memo.delete(name));
    }
    return pending;
  }

  private async controls(): Promise<Omit<ReadSession, "memo">> {
    // Mutable authorization and deletion policy are deliberately never served
    // from the file cache. Check both copies of the independent ledger state.
    const configText = await fs.readFile(this.p("corpus.json"), "utf8");
    const config = JSON.parse(configText.replace(/^\uFEFF/, "")) as CorpusData;
    await validate("corpus", config);
    const ledgerPath = path.join(
      this.ledgerRoot,
      hash(config.corpus_id) + ".json",
    );
    const ledgerText = await fs.readFile(ledgerPath, "utf8").catch(() => null);
    const generationText = await fs
      .readFile(this.p("lifecycle/ledger-generation.json"), "utf8")
      .catch(() => null);
    ensure(
      ledgerText && generationText,
      "LEDGER_UNAVAILABLE",
      "Independent deletion ledger is missing; reads and restores are blocked",
    );
    const ledger = JSON.parse(ledgerText) as Ledger;
    const generation = JSON.parse(generationText);
    ensure(
      ledger.corpus_id === config.corpus_id &&
        generation.generation === ledger.generation,
      "LEDGER_UNAVAILABLE",
      "Deletion ledger must be reconciled before serving this corpus",
    );
    const currentText = await fs
      .readFile(this.p("CURRENT"), "utf8")
      .catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return "";
        throw error;
      });
    const dimensions = await fs
      .readFile(this.p("dimensions.json"), "utf8")
      .catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return "";
        throw error;
      });
    return {
      config,
      ledger,
      current: currentText.trim() || null,
      signature: hash(
        json([
          this.project,
          configText,
          ledgerText,
          generationText,
          currentText,
          dimensions,
        ]),
      ),
    };
  }

  async withReadSession<T>(read: () => Promise<T>): Promise<T> {
    if (this.sessions.getStore()) return read();
    try {
      const before = await this.controls();
      if (before.signature !== this.controlSignature) this.clearReadCache();
      this.controlSignature = before.signature;
      return await this.sessions.run(
        { ...before, memo: new Map() },
        async () => {
          const result = await read();
          const after = await this.controls();
          ensure(
            before.signature === after.signature,
            "REVISION_CONFLICT",
            "Library or access policy changed during retrieval; retry",
          );
          return result;
        },
      );
    } catch (error) {
      this.clearReadCache();
      throw error;
    }
  }

  async config(): Promise<CorpusData> {
    const snapshot = this.sessions.getStore();
    if (snapshot) return snapshot.config;
    const config = await readJson<CorpusData>(this.p("corpus.json"));
    await validate("corpus", config);
    return config;
  }

  async scope(request?: Scope) {
    const config = await this.config();
    const binding = config.project_bindings.find(
      (binding) => binding.project_id === this.project,
    );
    ensure(binding, "SCOPE_DENIED", "Project is not bound to this corpus");
    const permitted = {
      read_modules: binding.read_modules,
      write_modules: binding.write_modules,
      source_refs: config.default_scope.source_refs,
    };
    return request ? subset(request, permitted) : permitted;
  }

  async requireFullScope(write = false) {
    const scope = await this.scope(),
      config = await this.config();
    ensure(
      !scope.source_refs.length &&
        config.modules.every(
          (m) =>
            scope.read_modules.includes(m.module_id) &&
            (!write || scope.write_modules.includes(m.module_id)),
        ),
      "SCOPE_DENIED",
      "This whole-library operation requires unrestricted corpus-wide access",
    );
    return scope;
  }

  async requireWritable(record: RecordData, scope: Scope) {
    ensure(
      scope.write_modules.includes(record.maintenance_module) &&
        (await this.allowed(record, scope)),
      "SCOPE_DENIED",
      "Existing record or its evidence is outside the caller's writable/readable scope",
    );
  }

  // A purge can delete the records needed for its own authorization check.
  // Retain only the required permissions in its recovery inventory, not content.
  async requiredScope(records: RecordData[]): Promise<Scope> {
    const read = new Set<string>(),
      sources: Ref[] = [],
      seen = new Set<string>();
    const visit = async (record: RecordData): Promise<void> => {
      if (seen.has(key(record))) return;
      seen.add(key(record));
      read.add(record.maintenance_module);
      if (record.record_type === "source") sources.push(ref(record));
      for (const target of recordRefs(record))
        await visit(await this.exact(target));
    };
    for (const record of records) await visit(record);
    return {
      read_modules: [...read],
      write_modules: [...new Set(records.map((r) => r.maintenance_module))],
      source_refs: uniqueRefs(sources),
    };
  }

  async init(config: CorpusData) {
    await validate("corpus", config);
    ensure(
      !(await exists(this.p("corpus.json"))),
      "REVISION_CONFLICT",
      "Corpus already exists",
    );
    await fs.mkdir(this.root, { recursive: true });
    await immutable(this.p("corpus.json"), json(config));
    const ledger: Ledger = {
      version: 1,
      corpus_id: config.corpus_id,
      generation: 0,
      blocked_ids: [],
      purged_hashes: [],
      operations: [],
    };
    await immutable(
      path.join(this.ledgerRoot, hash(config.corpus_id) + ".json"),
      json(ledger),
    );
    await atomic(
      this.p("lifecycle/ledger-generation.json"),
      json({ generation: 0 }),
    );
    await this.audit("initialize", "Created an empty research library", []);
    return config;
  }

  async ledger(): Promise<Ledger> {
    const snapshot = this.sessions.getStore();
    if (snapshot) return snapshot.ledger;
    const config = await this.config();
    const file = path.join(this.ledgerRoot, hash(config.corpus_id) + ".json");
    ensure(
      await exists(file),
      "LEDGER_UNAVAILABLE",
      "Independent deletion ledger is missing; reads and restores are blocked",
    );
    const ledger = await readJson<Ledger>(file);
    const local = await readJson(
      this.p("lifecycle/ledger-generation.json"),
    ).catch(() => null);
    ensure(
      local &&
        local.generation === ledger.generation &&
        ledger.corpus_id === config.corpus_id,
      "LEDGER_UNAVAILABLE",
      "Deletion ledger must be reconciled before serving this corpus",
    );
    return ledger;
  }

  async current(): Promise<string | null> {
    const snapshot = this.sessions.getStore();
    if (snapshot) return snapshot.current;
    return (
      (
        await fs
          .readFile(this.p("CURRENT"), "utf8")
          .catch((error: NodeJS.ErrnoException) => {
            if (error.code === "ENOENT") return "";
            throw error;
          })
      ).trim() || null
    );
  }

  private async loadRelease(selected: string): Promise<ReleaseData> {
    ensure(
      /^[a-zA-Z0-9_-]+$/.test(selected),
      "VALIDATION_FAILED",
      "Invalid release ID",
    );
    return this.memo("release:" + selected, async () => {
      const release = await this.files.json<ReleaseData>(
        `releases/${selected}.json`,
        "release",
      );
      ensure(
        release.corpus_id === (await this.config()).corpus_id &&
          release.release_id === selected,
        "SCOPE_DENIED",
        "Release corpus mismatch",
      );
      return release;
    });
  }

  async committedReleases(): Promise<ReleaseData[]> {
    const current = await this.current();
    return this.memo("committed:" + current, async () => {
      const releases: ReleaseData[] = [],
        seen = new Set<string>();
      let id = current;
      while (id) {
        ensure(!seen.has(id), "VALIDATION_FAILED", "Cyclic release ancestry");
        seen.add(id);
        const release = await this.loadRelease(id);
        releases.push(release);
        id = release.parent_release;
      }
      return releases;
    });
  }

  async release(id?: string | null): Promise<ReleaseData | null> {
    const current = await this.current(),
      selected = id ?? current;
    if (!selected) return null;
    if (selected === current) return this.loadRelease(selected);
    const release = (await this.committedReleases()).find(
      (r) => r.release_id === selected,
    );
    ensure(
      release,
      "VALIDATION_FAILED",
      "Release is not in committed CURRENT ancestry",
    );
    return release;
  }

  async records(releaseId?: string | null): Promise<Map<string, RecordData>> {
    await this.scope();
    const ledger = await this.ledger();
    const release = await this.release(releaseId);
    return this.memo(
      "records:" + (release?.release_id ?? "empty"),
      async () => {
        const blocked = new Set(ledger.blocked_ids);
        const blockedRefs = new Set(ledger.blocked_refs ?? []);
        const entries = (release?.records ?? []).filter(
          (entry) =>
            !blocked.has(entry.record_ref.id) &&
            !blockedRefs.has(key(entry.record_ref)),
        );
        const records = await mapLimit(entries, async (entry) => {
          const record = await this.memo("exact:" + key(entry.record_ref), () =>
            this.files.json<RecordData>(
              entry.metadata_path,
              "record",
              entry.sha256,
            ),
          );
          ensure(
            key(record) === key(entry.record_ref) &&
              record.corpus_id === release!.corpus_id,
            "VALIDATION_FAILED",
            "Manifest reference mismatch",
          );
          this.integrity.set(key(entry.record_ref), entry.sha256);
          return record;
        });
        return new Map(records.map((record) => [record.id, record]));
      },
    );
  }

  async exact(reference: Ref): Promise<RecordData> {
    const ledger = await this.ledger();
    ensure(
      !ledger.blocked_ids.includes(reference.id) &&
        !(ledger.blocked_refs ?? []).includes(key(reference)),
      "CONTENT_PURGED",
      "Record is blocked by deletion policy",
    );
    const current = await this.current();
    if (this.integrityRelease !== current) {
      this.integrity.clear();
      this.integrityRelease = current;
    }
    return this.memo("exact:" + key(reference), async () => {
      if (!this.integrity.has(key(reference))) {
        for (const manifest of await this.committedReleases()) {
          for (const entry of manifest.records)
            this.integrity.set(key(entry.record_ref), entry.sha256);
        }
      }
      const expected = this.integrity.get(key(reference));
      ensure(
        expected,
        "VALIDATION_FAILED",
        "Record revision is not in a published manifest",
        { record: reference },
      );
      const record = await this.files.json<RecordData>(
        objectPath(reference) + "/record.json",
        "record",
        expected,
      );
      ensure(
        key(record) === key(reference) &&
          record.corpus_id === (await this.config()).corpus_id,
        "VALIDATION_FAILED",
        "Record identity mismatch",
      );
      return record;
    });
  }

  async body(record: RecordData): Promise<string> {
    if (!record.body) return "";
    const body = record.body;
    return this.memo("body:" + body.path + ":" + body.sha256, () =>
      this.files.text(body.path, body.sha256),
    );
  }

  async allowed(
    record: RecordData,
    scope: Scope,
    cache = new Map<string, boolean>(),
    trail = new Set<string>(),
  ): Promise<boolean> {
    if (cache.has(key(record))) return cache.get(key(record))!;
    if (trail.has(key(record))) return true;
    if (!scope.read_modules.includes(record.maintenance_module)) return false;
    if (scope.source_refs.length) {
      const sources =
        record.record_type === "source"
          ? [ref(record)]
          : record.provenance.source_refs;
      if (
        !sources.length ||
        sources.some(
          (source) =>
            !scope.source_refs.some((allowed) => key(allowed) === key(source)),
        )
      )
        return false;
    }
    trail.add(key(record));
    for (const target of recordRefs(record)) {
      let dependency: RecordData;
      try {
        dependency = await this.exact(target);
      } catch {
        return false;
      }
      if (!(await this.allowed(dependency, scope, cache, new Set(trail)))) {
        cache.set(key(record), false);
        return false;
      }
    }
    cache.set(key(record), true);
    return true;
  }

  async read(reference: Ref, request?: Scope) {
    return this.withReadSession(async () => {
      const scope = await this.scope(request);
      const record = await this.exact(reference);
      ensure(
        await this.allowed(record, scope),
        "SCOPE_DENIED",
        "Record or its evidence exceeds the allowed scope",
      );
      return { record, body: await this.body(record) };
    });
  }
  async audit(
    operation: string,
    description: string,
    affected: Ref[],
    release: string | null = null,
    outcome = "completed",
    eventId = uid("event-"),
  ) {
    if (await exists(this.p(`audit/events/${eventId}.json`))) {
      await this.renderAudit();
      return readJson(this.p(`audit/events/${eventId}.json`));
    }
    const event = {
      schema_version: VERSION,
      event_id: eventId,
      timestamp: now(),
      job_id: null,
      operation,
      description,
      actor: "know-fu",
      record_refs: affected,
      before_release: null,
      after_release: release,
      outcome:
        outcome === "completed"
          ? "committed"
          : outcome === "incomplete"
            ? "failed"
            : outcome,
      reason: description,
    };
    await validate("audit-event", event);
    // Each event is immutable. The derived journal is appended under the caller's
    // operation lock and fully rebuilt only when it is out of step with the events.
    await immutable(this.p(`audit/events/${eventId}.json`), json(event));
    await this.appendAudit(event);
    return event;
  }
  private auditEntry(e: any) {
    return `## [${e.timestamp.slice(0, 10)}] ${e.operation} | ${e.description}\n\nOutcome: ${e.outcome}; release: ${e.after_release ?? "none"}.\n`;
  }
  private async appendAudit(event: any) {
    const state = await readJson(this.p("audit/journal-state.json")).catch(
      () => null,
    );
    const count = (
      await fs.readdir(this.p("audit/events")).catch(() => [] as string[])
    ).filter((x) => x.endsWith(".json")).length;
    if (!state || state.count !== count - 1) return this.renderAudit();
    await fs.appendFile(
      this.p("audit/events.jsonl"),
      JSON.stringify(event) + "\n",
    );
    await fs.appendFile(
      this.p("log.md"),
      (count > 1 ? "\n" : "") + this.auditEntry(event),
    );
    await atomic(
      this.p("audit/journal-state.json"),
      json({ count, last_event_id: event.event_id }),
    );
  }
  async renderAudit() {
    const names = (
      await fs.readdir(this.p("audit/events")).catch(() => [])
    ).filter((x) => x.endsWith(".json"));
    const events = await Promise.all(
      names.map((n) => readJson(this.p("audit/events/" + n))),
    );
    events.sort(
      (a, b) =>
        a.timestamp.localeCompare(b.timestamp) ||
        a.event_id.localeCompare(b.event_id),
    );
    await atomic(
      this.p("audit/events.jsonl"),
      events.map((e) => JSON.stringify(e)).join("\n") + "\n",
    );
    await atomic(
      this.p("log.md"),
      events.map((e) => this.auditEntry(e)).join("\n"),
    );
    await atomic(
      this.p("audit/journal-state.json"),
      json({
        count: events.length,
        last_event_id: events.at(-1)?.event_id ?? null,
      }),
    );
  }
  /** Whether an exact revision belongs to CURRENT or any release it descends from. */
  async committed(reference: Ref) {
    const wanted = key(reference);
    return (await this.committedReleases()).some((release) =>
      release.records.some((e) => key(e.record_ref) === wanted),
    );
  }

  /**
   * An interrupted publication can leave object files for a revision that never committed.
   * When a corrected revision with the same number is published, those leftovers are removed,
   * but only after proving no committed release refers to that revision. Runs under the
   * publication lock, so no other publisher can be writing the same files.
   */
  private async clearAbortedRevision(
    r: RecordData,
    bodies: Record<string, string>,
  ) {
    const dir = this.p(objectPath(r));
    const recordFile = path.join(dir, "record.json");
    const differs = async (file: string, data: string) =>
      (await exists(file)) && hash(await fs.readFile(file)) !== hash(data);
    const stale =
      (await differs(recordFile, json(r))) ||
      (!!r.body &&
        bodies[key(r)] !== undefined &&
        (await differs(
          await safePath(this.root, r.body.path, true),
          bodies[key(r)],
        )));
    if (!stale || (await this.committed(r))) return;
    await fs.rm(dir, { recursive: true, force: true });
  }

  async recover() {
    const journal = await readJson(this.p("publication.json")).catch(
      () => null,
    );
    if (!journal) return;
    const current = await this.current();
    if (current === journal.release.release_id) {
      if (journal.impacts)
        await atomic(
          this.p(`releases/${current}.impacts.json`),
          json(journal.impacts),
        );
      await this.audit(
        "publish",
        "Committed research release",
        journal.changed_refs,
        current,
        "completed",
        journal.event_id,
      );
    }
    await fs.rm(this.p("publication.json"), { force: true });
  }
  async compile(
    proposal: ProposalData,
    existingStaged: RecordData[] = [],
  ): Promise<Materialized> {
    await validate("proposal", proposal);
    const scope = await this.scope(proposal.scope_policy);
    ensure(
      (await this.current()) === proposal.base_release,
      "REVISION_CONFLICT",
      "Rebase the proposal against the current release",
    );
    const originals = await this.records();
    const local: Record<string, Ref> = {};
    for (const item of proposal.items) {
      ensure(
        !local[item.local_id],
        "VALIDATION_FAILED",
        "Duplicate local reference",
      );
      ensure(
        scope.write_modules.includes(item.maintenance_module),
        "SCOPE_DENIED",
        "Proposal writes outside its module",
      );
      const old = item.existing_ref;
      if (old) {
        ensure(
          key(originals.get(old.id) ?? { id: "", revision: 0 }) === key(old),
          "REVISION_CONFLICT",
          "Record changed since proposal",
        );
        const previous = originals.get(old.id)!;
        await this.requireWritable(previous, scope);
        ensure(
          previous.maintenance_module === item.maintenance_module &&
            previous.record_type === item.record_type,
          "VALIDATION_FAILED",
          "A revision cannot change record family or maintenance ownership",
        );
        local[item.local_id] = { id: old.id, revision: old.revision + 1 };
      } else
        local[item.local_id] = {
          id: `${item.record_type}:${hash(proposal.proposal_id + ":" + item.local_id).slice(0, 28)}`,
          revision: 1,
        };
    }
    const expand = (v: any): any => {
      if (Array.isArray(v)) return v.map(expand);
      if (v && typeof v === "object") {
        if ("local_ref" in v) {
          ensure(
            local[v.local_ref],
            "VALIDATION_FAILED",
            "Unknown local reference",
            { local_ref: v.local_ref },
          );
          return local[v.local_ref];
        }
        return Object.fromEntries(
          Object.entries(v).map(([k, x]) => [k, expand(x)]),
        );
      }
      return v;
    };
    const config = await this.config(),
      records: RecordData[] = [],
      bodies: Record<string, string> = {};
    for (const original of proposal.items) {
      const i = expand(original),
        identity = local[i.local_id],
        body = i.body_markdown as string | null,
        previous = i.existing_ref
          ? originals.get(i.existing_ref.id)
          : undefined;
      const dependencies = uniqueRefs([
        ...i.source_refs,
        ...i.input_refs,
        ...refs(i.payload),
        ...refs(i.extensions ?? {}),
      ]).filter((r) => r.id !== identity.id);
      const r = {
        schema_version: VERSION,
        ...identity,
        corpus_id: config.corpus_id,
        record_type: i.record_type,
        title: i.title,
        created_at: now(),
        lifecycle: previous?.lifecycle ?? "active",
        archived: previous?.archived ?? false,
        maintenance_module: i.maintenance_module,
        epistemic: i.epistemic,
        scope: i.scope,
        provenance: {
          actor: "codex",
          method: "semantic_proposal",
          source_refs: i.source_refs,
          input_refs: i.input_refs,
          tool_versions: { coordinator: ENGINE_VERSION },
        },
        assessments: i.assessments ?? {
          fidelity: emptyAssessment(),
          evidence: emptyAssessment(),
          applicability: emptyAssessment(),
        },
        depends_on: dependencies,
        supersedes: structuredClone(previous?.supersedes ?? []),
        change_reason: i.change_reason,
        body: body
          ? { path: objectPath(identity) + "/body.md", sha256: hash(body) }
          : null,
        extensions: i.extensions ?? {},
        payload: i.payload,
      } as RecordData;
      if (body) bodies[key(r)] = body;
      records.push(r);
    }
    await this.validateRecords(
      records,
      bodies,
      scope,
      originals,
      existingStaged,
    );
    return {
      records,
      bodies,
      proposal_hash: hash(json(proposal)),
      local_refs: local,
    };
  }
  async validateRecords(
    records: RecordData[],
    bodies: Record<string, string>,
    scope: Scope,
    base: Map<string, RecordData>,
    existingStaged: RecordData[] = [],
  ) {
    const config = await this.config(),
      ledger = await this.ledger();
    const staged = new Map(
      [...existingStaged, ...records].map((r) => [key(r), r]),
    );
    ensure(
      new Set(records.map(key)).size === records.length,
      "VALIDATION_FAILED",
      "Duplicate record revisions",
    );
    const dimensions = await readJson(this.p("dimensions.json")).catch(
      () => ({}),
    );
    const checkCondition = (e: any): void => {
      if (!e) return;
      if (e.all || e.any) {
        for (const t of e.all ?? e.any) checkCondition(t);
        return;
      }
      if (e.not) {
        checkCondition(e.not);
        return;
      }
      const d = dimensions[e.dimension];
      ensure(
        d,
        "VALIDATION_FAILED",
        "Register the condition dimension before publication",
        { dimension: e.dimension },
      );
      ensure(
        (d.unit ?? null) === (e.unit ?? null),
        "VALIDATION_FAILED",
        "Condition unit differs from its registered dimension",
      );
      if (e.operator === "exists") return;
      const values = e.operator === "in" ? e.value : [e.value];
      ensure(
        Array.isArray(values) && values.every((v) => typeof v === d.type),
        "VALIDATION_FAILED",
        "Condition values have the wrong type",
      );
      if (["gt", "gte", "lt", "lte"].includes(e.operator))
        ensure(
          d.type === "number",
          "VALIDATION_FAILED",
          "Ordering comparisons require a numeric dimension",
        );
    };
    const resolve = async (r: Ref) =>
      staged.get(key(r)) ?? (await this.exact(r));
    const getBody = async (r: RecordData) =>
      bodies[key(r)] ?? (await this.body(r));
    for (const r of records) {
      await validate("record", r);
      ensure(
        r.corpus_id === config.corpus_id,
        "SCOPE_DENIED",
        "Foreign corpus record",
      );
      ensure(
        !ledger.blocked_ids.includes(r.id) &&
          !(ledger.blocked_refs ?? []).includes(key(r)),
        "CONTENT_PURGED",
        "Cannot restore purged identity",
      );
      ensure(
        scope.write_modules.includes(r.maintenance_module),
        "SCOPE_DENIED",
        "Unauthorized module write",
      );
      ensure(
        config.modules.some((m) => m.module_id === r.maintenance_module) &&
          r.scope.domains.every((d) =>
            config.domains.some((x) => x.domain_id === d),
          ),
        "VALIDATION_FAILED",
        "Unregistered module/domain",
      );
      const old = base.get(r.id);
      if (old) {
        await this.requireWritable(old, scope);
        ensure(
          old.maintenance_module === r.maintenance_module &&
            old.record_type === r.record_type,
          "VALIDATION_FAILED",
          "A revision cannot change record family or maintenance ownership",
        );
      }
      ensure(
        r.revision === (old?.revision ?? 0) + 1,
        "REVISION_CONFLICT",
        "Revision must advance the current record exactly once",
      );
      checkCondition(r.scope.condition_expression);
      if (r.body) {
        ensure(
          r.body.path === objectPath(r) + "/body.md",
          "VALIDATION_FAILED",
          "Body must belong to its immutable record",
        );
        ensure(
          hash(await getBody(r)) === r.body.sha256,
          "VALIDATION_FAILED",
          "Body hash does not match",
        );
      }
      const seen = new Set<string>();
      const checkScope = async (target: Ref): Promise<void> => {
        if (seen.has(key(target))) return;
        seen.add(key(target));
        const t = await resolve(target);
        ensure(
          scope.read_modules.includes(t.maintenance_module),
          "SCOPE_DENIED",
          "Dependency is outside readable modules",
        );
        if (scope.source_refs.length && t.record_type === "source")
          ensure(
            scope.source_refs.some((s) => key(s) === key(t)),
            "SCOPE_DENIED",
            "Evidence outside selected sources",
          );
        for (const d of recordRefs(t)) await checkScope(d);
      };
      for (const target of recordRefs(r)) await checkScope(target);
      for (const target of r.provenance.source_refs)
        ensure(
          (await resolve(target)).record_type === "source",
          "VALIDATION_FAILED",
          "Source provenance must reference sources",
        );
      const p = r.payload as any;
      if (r.record_type === "source") {
        const bytes = await fs.readFile(
          await safePath(this.root, p.original_path),
        );
        ensure(
          hash(bytes) === p.sha256,
          "VALIDATION_FAILED",
          "Original source hash does not match",
        );
        ensure(
          !ledger.purged_hashes.includes(p.sha256),
          "CONTENT_PURGED",
          "These source bytes were purged",
        );
        for (const s of p.derived_from_sources)
          ensure(
            (await resolve(s)).record_type === "source",
            "VALIDATION_FAILED",
            "Source lineage must reference sources",
          );
      }
      if (r.record_type === "passage") {
        const source = await resolve(p.source_ref);
        ensure(
          source.record_type === "source",
          "VALIDATION_FAILED",
          "Passage target is not a source",
        );
        await this.verifyLocator(r, source);
      }
      if (r.record_type === "knowledge" || r.record_type === "learning") {
        ensure(
          r.body && (await getBody(r)).trim(),
          "VALIDATION_FAILED",
          "An explanatory body is required",
        );
        for (const target of p.concept_refs ?? [])
          ensure(
            (await resolve(target)).record_type === "concept",
            "VALIDATION_FAILED",
            "Concept reference has wrong family",
          );
        for (const target of p.knowledge_refs ?? [])
          ensure(
            (await resolve(target)).record_type === "knowledge",
            "VALIDATION_FAILED",
            "Knowledge reference has wrong family",
          );
      }
      if (r.epistemic === "inference" || r.epistemic === "hypothesis")
        ensure(
          r.provenance.input_refs.length,
          "VALIDATION_FAILED",
          "Inference needs identified premises",
        );
      if (r.record_type === "relationship" && p.predicate === "exemplifies") {
        const t = await resolve(p.object);
        ensure(
          t.record_type === "concept" ||
            (t.record_type === "knowledge" &&
              ["mechanism", "procedure"].includes((t.payload as any).form)),
          "VALIDATION_FAILED",
          "exemplifies needs a concept, mechanism or procedure",
        );
        const s = await resolve(p.subject);
        ensure(
          s.record_type === "learning" ||
            s.record_type === "passage" ||
            s.epistemic === "illustration",
          "VALIDATION_FAILED",
          "exemplifies needs an attributable case",
        );
      }
      if (
        Object.keys(r.extensions).some(
          (k) => k !== "navigation" && k !== "citations",
        )
      )
        ensure(
          ["knowledge", "learning"].includes(r.record_type),
          "VALIDATION_FAILED",
          "Functional/application extensions belong to knowledge or learning",
        );
      // Quotes are checked against the cited passage, so a recalled quote is the source's wording.
      for (const citation of (r.extensions as any).citations ?? []) {
        ensure(
          r.provenance.input_refs.some((x) => key(x) === key(citation.ref)),
          "VALIDATION_FAILED",
          "A citation must quote one of the record's own inputs",
          { ref: citation.ref },
        );
        const cited = await resolve(citation.ref);
        ensure(
          cited.record_type === "passage",
          "VALIDATION_FAILED",
          "Citations quote passages",
          { ref: citation.ref },
        );
        const text = (cited.payload as any).text ?? "";
        ensure(
          quoteFound(citation.quote, text),
          "QUOTE_NOT_FOUND",
          "Quoted words do not appear in the cited passage",
          {
            ref: citation.ref,
            quote: citation.quote,
            closest: closestSpan(citation.quote, text),
          },
        );
      }
      for (const previous of r.supersedes) {
        const old = await resolve(previous);
        ensure(
          old.record_type !== "source",
          "VALIDATION_FAILED",
          "Original sources cannot be superseded as interpretations",
        );
        ensure(
          r.scope.domains.some((d) => old.scope.domains.includes(d)),
          "VALIDATION_FAILED",
          "Supersession needs an overlapping scope",
        );
      }
    }
    const visiting = new Set<string>(),
      done = new Set<string>();
    const visit = async (r: RecordData): Promise<void> => {
      if (done.has(key(r))) return;
      ensure(
        !visiting.has(key(r)),
        "VALIDATION_FAILED",
        "Regeneration dependency cycle",
        { record: ref(r) },
      );
      visiting.add(key(r));
      for (const d of r.depends_on) await visit(await resolve(d));
      visiting.delete(key(r));
      done.add(key(r));
    };
    for (const r of records) await visit(r);
  }
  async verifyLocator(passage: RecordData, source: RecordData) {
    const p = passage.payload as any,
      s = source.payload as any,
      l = p.locator;
    ensure(
      p.text || p.asset_path,
      "LOCATOR_UNRESOLVED",
      "Empty passage has no asset",
    );
    if (p.asset_path) await safePath(this.root, p.asset_path);
    if (l.kind === "lines") {
      const bytes = await fs.readFile(
        await safePath(this.root, s.original_path),
      );
      ensure(
        l.start >= 1 && l.end >= l.start,
        "LOCATOR_UNRESOLVED",
        "Invalid line interval",
      );
      const original = bytes.toString("utf8"),
        lines = original.split(/\r?\n/);
      ensure(
        l.end <= lines.length,
        "LOCATOR_UNRESOLVED",
        "Line interval exceeds original",
      );
      const anchor = l.anchor?.match(/^utf16-chars:(\d+):(\d+)$/);
      let text = lines.slice(l.start - 1, l.end).join("\n");
      if (anchor) {
        const start = Number(anchor[1]),
          end = Number(anchor[2]);
        ensure(
          end > start && end <= original.length,
          "LOCATOR_UNRESOLVED",
          "Character interval outside source",
        );
        text = original.slice(start, end);
      } else ensure(!l.anchor, "LOCATOR_UNRESOLVED", "Unsupported line anchor");
      ensure(
        p.text === text,
        "LOCATOR_UNRESOLVED",
        "Quoted lines do not match the original",
      );
      ensure(
        hash(text) === p.extraction_sha256,
        "LOCATOR_UNRESOLVED",
        "Extraction hash mismatch",
      );
    } else {
      const extraction = l.anchor?.match(
          /^extract:(job-[a-z0-9-]+):(?:(supp-[a-f0-9]+):)?/,
        ),
        suffix = extraction
          ? "/extractions/" +
            extraction[1] +
            "/" +
            (extraction[2] ?? "extraction") +
            ".json"
          : "/extraction.json";
      const manifest = await readJson(
        this.p(path.posix.dirname(s.original_path) + suffix),
      ).catch(() => null);
      ensure(
        manifest,
        "LOCATOR_UNRESOLVED",
        "Non-line locator requires extraction mapping",
      );
      const unit = manifest.units.find(
        (u: any) => JSON.stringify(u.locator) === JSON.stringify(l),
      );
      ensure(
        unit &&
          unit.sha256 === p.extraction_sha256 &&
          unit.text === p.text &&
          (unit.asset_path ?? null) === (p.asset_path ?? null),
        "LOCATOR_UNRESOLVED",
        "Locator does not resolve to preserved extraction",
      );
    }
  }
  async publish(
    records: RecordData[],
    bodies: Record<string, string>,
    baseRelease: string | null,
    reason: string,
    scope: Scope,
    receipts: string[] = [],
    omitIds: string[] = [],
  ) {
    return withLock(this.root, "publish", async () => {
      await this.recover();
      ensure(
        (await this.current()) === baseRelease,
        "REVISION_CONFLICT",
        "Another job published first",
      );
      const base = await this.records();
      const prior = new Map(base);
      await this.validateRecords(
        records,
        bodies,
        await this.scope(scope),
        base,
      );
      for (const r of records) {
        await this.clearAbortedRevision(r, bodies);
        if (r.body)
          await immutable(
            await safePath(this.root, r.body.path, true),
            bodies[key(r)] ?? (await this.body(r)),
          );
        await immutable(this.p(objectPath(r) + "/record.json"), json(r));
        base.set(r.id, r);
      }
      for (const id of omitIds) base.delete(id);
      const entries = [];
      for (const r of base.values()) {
        const metadata_path = objectPath(r) + "/record.json";
        entries.push({
          record_ref: ref(r),
          metadata_path,
          sha256: hash(await fs.readFile(this.p(metadata_path))),
        });
      }
      entries.sort((a, b) => a.record_ref.id.localeCompare(b.record_ref.id));
      const release: ReleaseData = {
        schema_version: VERSION,
        release_id: uid("release-"),
        corpus_id: (await this.config()).corpus_id,
        parent_release: baseRelease,
        created_at: now(),
        change_reason: reason,
        records: entries,
        coverage_receipts: receipts,
        validation_receipts: [],
      };
      await validate("release", release);
      const changed = new Set(records.map((r) => r.id)),
        affected = knowledgeImpact(
          base,
          records,
          prior,
          [...omitIds].flatMap((id) => (prior.has(id) ? [prior.get(id)!] : [])),
        ),
        impacts: any[] = await readJson<any[]>(
          this.p(`releases/${baseRelease}.impacts.json`),
        ).catch(() => []);
      for (const r of base.values())
        if (!changed.has(r.id) && affected.has(r.id)) {
          const previous = impacts.findIndex((x) => x.record_ref.id === r.id);
          const prior = previous >= 0 ? impacts[previous] : null;
          const currentImpact = affected.get(r.id)!;
          const materialChanges = [
            ...(prior?.material_change_refs ?? []),
            ...currentImpact.material_change_refs,
          ];
          const impact = {
            ...affected.get(r.id),
            material_change_refs: [
              ...new Map(materialChanges.map((x) => [key(x), x])).values(),
            ],
            status: "pending_reassessment",
            outside_write_scope: !scope.write_modules.includes(
              r.maintenance_module,
            ),
          };
          if (previous >= 0) impacts[previous] = impact;
          else impacts.push(impact);
        }
      for (let i = impacts.length - 1; i >= 0; i--)
        if (changed.has(impacts[i].record_ref.id)) impacts.splice(i, 1);
      const event_id = uid("event-");
      await atomic(
        this.p("publication.json"),
        json({ release, changed_refs: records.map(ref), event_id, impacts }),
      );
      await immutable(
        this.p(`releases/${release.release_id}.json`),
        json(release),
      );
      await atomic(
        this.p(`releases/${release.release_id}.impacts.json`),
        json(impacts),
      );
      if (process.env.KB_TEST_FAULT === "disk_full")
        throw new KBError(
          "ENOSPC",
          "Injected disk-full write failure; current release was not advanced",
        );
      if (process.env.KB_TEST_PAUSE_BEFORE_POINTER === "1") {
        await atomic(this.p("test-paused.json"), json({ pid: process.pid }));
        await new Promise(() => setInterval(() => {}, 1000));
      }
      if (process.env.KB_TEST_FAULT === "before_pointer")
        throw new KBError(
          "SIMULATED_CRASH",
          "Test interruption before pointer",
        );
      await atomic(this.p("CURRENT"), release.release_id + "\n");
      this.integrity.clear();
      if (process.env.KB_TEST_FAULT === "after_pointer")
        throw new KBError("SIMULATED_CRASH", "Test interruption after pointer");
      await this.audit(
        "publish",
        "Committed research release",
        records.map(ref),
        release.release_id,
        "completed",
        event_id,
      );
      await fs.rm(this.p("publication.json"), { force: true });
      return {
        release_id: release.release_id,
        status: "canonical_committed",
        views: "pending",
        records: records.map(ref),
        impacts,
      };
    });
  }
}

import { Store } from "./store.js";
import {
  blockedIds,
  condition,
  ensure,
  json,
  key,
  readJson,
  ref,
  relianceBlocked,
} from "./core.js";
import type { RecordData, Ref, Scope } from "./core.js";
import { navigationEntry } from "./navigation.js";

export type ReadingContext = Record<
  string,
  { value: unknown; unit?: string | null }
>;

/** One scoped snapshot for navigation, reading and material-context resolution. */
export class ResearchView {
  readonly visible = new Map<string, RecordData>();
  readonly liveVisible = new Map<string, RecordData>();
  readonly warnings: string[] = [];
  private permitted = new Set<string>();
  private pending = new Set<string>();
  private dimensions: any = {};
  private blockedLive?: Set<string>;
  private constructor(
    readonly store: Store,
    readonly scope: Scope,
    readonly release: string,
    readonly current: string,
    readonly records: Map<string, RecordData>,
    readonly live: Map<string, RecordData>,
    readonly context: ReadingContext,
  ) {}

  static async open(
    store: Store,
    request: { scope?: Scope; release_id?: string; context?: ReadingContext },
  ) {
    const scope = await store.scope(request.scope),
      release = await store.release(request.release_id);
    ensure(
      release,
      "NO_KNOWLEDGE",
      "The library has no published research yet",
    );
    const view = new ResearchView(
      store,
      scope,
      release.release_id,
      (await store.current())!,
      await store.records(release.release_id),
      await store.records(),
      request.context ?? {},
    );
    const allowedCache = new Map<string, boolean>();
    for (const [source, target] of [
      [view.records, view.visible],
      [view.live, view.liveVisible],
    ] as const)
      for (const record of source.values())
        if (await store.allowed(record, scope, allowedCache))
          target.set(record.id, record);
    if (
      view.visible.size < view.records.size ||
      view.liveVisible.size < view.live.size
    )
      view.warnings.push(
        "Some material is inaccessible in this scope; qualifications involving it cannot be assessed. No inaccessible titles or counts are exposed.",
      );
    let ancestor: typeof release | null = release;
    while (ancestor) {
      for (const entry of ancestor.records)
        view.permitted.add(key(entry.record_ref));
      ancestor = ancestor.parent_release
        ? await store.release(ancestor.parent_release)
        : null;
    }
    view.dimensions = await readJson(store.p("dimensions.json")).catch(
      () => ({}),
    );
    const impacts = await readJson<any[]>(
      store.p(`releases/${view.current}.impacts.json`),
    ).catch(() => []);
    view.pending = new Set(
      impacts
        .filter((x) => x.status === "pending_reassessment")
        .map((x) => x.record_ref.id),
    );
    return view;
  }

  blocked(record: RecordData): boolean {
    this.blockedLive ??= blockedIds(this.live);
    return relianceBlocked(record, this.live, this.blockedLive);
  }

  usable(record: RecordData) {
    const latest = this.live.get(record.id);
    return (
      record.record_type !== "idea" &&
      record.lifecycle === "active" &&
      !record.archived &&
      latest?.lifecycle === "active" &&
      !latest.archived &&
      !this.blocked(record)
    );
  }

  async exact(reference: Ref) {
    ensure(
      reference &&
        typeof reference.id === "string" &&
        Number.isInteger(reference.revision),
      "VALIDATION_FAILED",
      "An exact record reference is required",
    );
    ensure(
      this.permitted.has(key(reference)),
      "VALIDATION_FAILED",
      "The record revision is not in the selected release or its ancestry",
    );
    const record = await this.store.exact(reference);
    ensure(
      record.record_type !== "idea",
      "VALIDATION_FAILED",
      "Ideas aren't library accounts; read them with kb_idea",
    );
    ensure(
      await this.store.allowed(record, this.scope),
      "SCOPE_DENIED",
      "Record or its evidence exceeds the allowed scope",
    );
    ensure(
      !this.blocked(record),
      "RELIANCE_BLOCKED",
      "Current withdrawal or missing support blocks this account and its dependents",
    );
    return record;
  }

  card(
    record: RecordData,
    reason = "Orientation candidate; inspect the account before relying on its details",
  ) {
    const latest = this.live.get(record.id),
      p = record.payload as any;
    const applicability = condition(
      record.scope.condition_expression,
      this.context,
      this.dimensions,
    );
    const today = new Date().toISOString().slice(0, 10);
    const warnings: string[] = [];
    if (this.pending.has(record.id))
      warnings.push(
        "Changed support requires reassessment; this account is not settled orientation.",
      );
    if (latest?.revision !== record.revision)
      warnings.push(
        "Historical revision; current account differs. Preserve exact cited inputs.",
      );
    if (
      record.lifecycle !== "active" ||
      record.archived ||
      latest?.lifecycle !== "active" ||
      latest?.archived
    )
      warnings.push(
        "Historical or archived account; not a current recommendation.",
      );
    if (
      (record.scope.valid_from && today < record.scope.valid_from) ||
      (record.scope.valid_until && today > record.scope.valid_until)
    )
      warnings.push(`Outside stated validity on ${today}.`);
    if (record.scope.condition_expression && applicability !== "true")
      warnings.push(
        `Applicability is ${applicability}; resolve the condition before applying.`,
      );
    return {
      ...navigationEntry(record),
      read_release: this.permitted.has(key(record))
        ? this.release
        : this.current,
      current_ref:
        latest && this.liveVisible.has(latest.id) ? ref(latest) : null,
      current_lifecycle: latest?.lifecycle ?? "unavailable",
      current_archived: latest?.archived ?? false,
      freshness: this.pending.has(record.id)
        ? "pending_reassessment"
        : latest?.revision !== record.revision
          ? "historical"
          : "current",
      scope: record.scope,
      applicability,
      assessments: Object.fromEntries(
        Object.entries(record.assessments).map(([dimension, assessment]) => [
          dimension,
          assessment.level,
        ]),
      ),
      source_refs: record.provenance.source_refs,
      support_refs: record.depends_on,
      locator: p.locator ?? null,
      selection_reason: reason,
      warnings,
    };
  }

  /** Canonical guards are independent of search rank and optional graph exploration. */
  async materialContext(seeds: RecordData[]) {
    const selected = new Map(seeds.map((r) => [key(r), r]));
    const required = new Map<string, { record: RecordData; reason: string }>();
    const relations = new Map<string, RecordData>();
    const candidates = new Map(
      [...this.visible.values(), ...this.liveVisible.values()].map((r) => [
        key(r),
        r,
      ]),
    );
    const warnings = [...this.warnings];
    let incomplete = false;
    const resolve = async (reference: Ref) => {
      let record = candidates.get(key(reference));
      if (!record) {
        const exact = await this.store.exact(reference).catch(() => null);
        if (exact && (await this.store.allowed(exact, this.scope))) {
          record = exact;
          candidates.set(key(exact), exact);
        }
      }
      if (!record || this.blocked(record)) {
        incomplete = true;
        return null;
      }
      return record;
    };
    const add = async (reference: Ref, reason: string) => {
      const record = await resolve(reference);
      if (!record) return;
      if (!selected.has(key(record))) {
        selected.set(key(record), record);
        required.set(key(record), { record, reason });
      }
    };
    let previous = -1;
    const premises = new Map<string, RecordData>();
    while (previous !== selected.size) {
      previous = selected.size;
      // Trace exact supporting inputs to find their caveats, without loading their bodies.
      const queue = [...selected.values()];
      for (let i = 0; i < queue.length; i++) {
        const r = queue[i];
        if (premises.has(key(r))) continue;
        premises.set(key(r), r);
        const assessedIssues = new Set<string>(
          r.record_type === "judgment"
            ? (r.payload as any).issue_refs.map(key)
            : [],
        );
        for (const dependency of r.depends_on) {
          // The subjects of an assessment are not automatically its premises.
          // One judgment may qualify several unrelated procedures. Their own
          // prerequisites are required only when those procedures are selected,
          // or an explicit conceptual depends_on relationship requests them.
          // Full dependency closure still enforces scope, withdrawal and history.
          if (assessedIssues.has(key(dependency))) continue;
          const target = await resolve(dependency);
          if (!target) continue;
          queue.push(target);
          const plainBoundary = (record: RecordData) =>
            json({
              conditions: record.scope.conditions,
              exclusions: record.scope.exclusions,
            });
          // Repeated source-wide scope is already carried by the dependent account.
          // A distinct inherited boundary still requires inspection; explicit predicates below always do.
          const newPlainBoundary =
            (target.scope.conditions.length ||
              target.scope.exclusions.length) &&
            plainBoundary(target) !== plainBoundary(r);
          if (
            target.scope.condition_expression ||
            newPlainBoundary ||
            target.scope.valid_from ||
            target.scope.valid_until ||
            this.pending.has(target.id)
          )
            await add(
              ref(target),
              "Supporting premise has a distinct applicability boundary, structured condition, validity limit or pending reassessment; inspect before relying on it",
            );
        }
      }
      const ids = new Set([...premises.values()].map((r) => r.id));
      for (const r of candidates.values()) {
        const p = r.payload as any;
        // Old guards retired in the present cannot be described as current guidance.
        if (!this.usable(r)) continue;
        if (r.record_type === "relationship") {
          const incoming =
            ["qualifies", "challenges"].includes(p.predicate) &&
            ids.has(p.object.id);
          const prerequisite =
            p.predicate === "depends_on" && ids.has(p.subject.id);
          if (incoming || prerequisite) {
            relations.set(key(r), r);
            await add(
              incoming ? p.subject : p.object,
              incoming
                ? `${p.predicate} ${key(p.object)}: ${p.rationale}`
                : `Conceptual prerequisite of ${key(p.subject)}: ${p.rationale}`,
            );
          }
        } else if (
          r.record_type === "judgment" &&
          this.live.get(r.id)?.revision === r.revision &&
          p.issue_refs.some((x: Ref) => ids.has(x.id))
        ) {
          await add(
            ref(r),
            "Current judgment affecting a selected account; inspect its rationale and unresolved alternatives",
          );
        }
      }
    }
    if (incomplete)
      warnings.push(
        "A material context record is unavailable or blocked; do not present the account as settled.",
      );
    return {
      required: [...required.values()],
      relationships: [...relations.values()].map((r) => ({
        record_ref: ref(r),
        ...(r.payload as object),
        scope: r.scope,
        assessments: r.assessments,
        warnings: this.card(r).warnings,
      })),
      warnings,
      complete: !incomplete && !this.warnings.length,
    };
  }
}

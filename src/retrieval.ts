import { Store } from "./store.js";
import { mapLimit } from "./verified-cache.js";
import { Projections } from "./projections.js";
import {
  VERSION,
  ENGINE_VERSION,
  ensure,
  uid,
  key,
  ref,
  readJson,
  condition,
  validate,
  atomic,
  json,
  hash,
} from "./core.js";
import type { RecordData, Scope, Ref } from "./core.js";
import type { RetrievalData } from "./generated/retrieval.js";

export class Retrieval {
  constructor(
    public store: Store,
    public projections = new Projections(store),
  ) {}
  async retrieve(input: {
    query: string;
    purpose?: RetrievalData["purpose"];
    scope?: Scope;
    domains?: string[];
    release_id?: string;
    semantic?: boolean;
    rerank?: boolean;
    graph_required?: boolean;
    graph?: boolean;
    limit?: number;
    hops?: number;
    context?: Record<string, { value: unknown; unit?: string | null }>;
  }) {
    return this.store.withReadSession(() => this.retrieveSnapshot(input));
  }
  private async retrieveSnapshot(input: {
    query: string;
    purpose?: RetrievalData["purpose"];
    scope?: Scope;
    domains?: string[];
    release_id?: string;
    semantic?: boolean;
    rerank?: boolean;
    graph_required?: boolean;
    graph?: boolean;
    limit?: number;
    hops?: number;
    context?: Record<string, { value: unknown; unit?: string | null }>;
  }) {
    const start = performance.now(),
      scope = await this.store.scope(input.scope),
      release = await this.store.release(input.release_id);
    ensure(
      release,
      "NO_KNOWLEDGE",
      "The library has no published research yet",
    );
    const all = await this.store.records(release.release_id),
      allowed = new Map<string, RecordData>(),
      cache = new Map<string, boolean>(),
      warnings: string[] = [],
      missing: string[] = [];
    for (const r of all.values())
      if (await this.store.allowed(r, scope, cache)) allowed.set(r.id, r);
    if (allowed.size < all.size)
      warnings.push(
        "Some corpus material is outside this scope; qualifications involving it cannot be assessed.",
      );
    const current = await this.store.records();
    const relianceBlocked = new Set<string>();
    const checkReliance = (
      r: RecordData,
      trail = new Set<string>(),
    ): boolean => {
      if (trail.has(r.id)) return false;
      trail.add(r.id);
      if (
        current.get(r.id)?.lifecycle === "withdrawn" ||
        r.lifecycle === "withdrawn"
      )
        return true;
      return r.depends_on.some((d) => {
        const a = current.get(d.id);
        return a ? checkReliance(a, new Set(trail)) : true;
      });
    };
    for (const r of allowed.values())
      if (checkReliance(r)) relianceBlocked.add(r.id);
    const route: RetrievalData["route"] = [],
      scores = new Map<string, number>(),
      selection = new Map<string, string>(),
      roles = new Map<string, RetrievalData["items"][number]["role"]>();
    let searchMs = 0,
      graphMs = 0,
      truncated = false;
    ensure(
      typeof input.query === "string" && input.query.trim(),
      "VALIDATION_FAILED",
      "A nonempty retrieval query is required",
    );
    const graphFresh = await this.projections.fresh(
      release.release_id,
      "graph",
    );
    ensure(
      !input.graph_required || graphFresh,
      "GRAPH_UNAVAILABLE",
      "A matching graph projection is unavailable; reindex and resume",
    );
    const initialReceipt = await this.projections.receipt(),
      useSemantic =
        input.semantic !== false && initialReceipt?.search?.semantic === true;
    if (input.semantic !== false && !useSemantic)
      warnings.push(
        "This search projection has no confirmed embeddings; keyword lookup is in use.",
      );
    const limit = Math.max(1, Math.min(input.limit ?? 8, 30)),
      terms = input.query.toLowerCase().match(/[\p{L}\p{N}_-]+/gu) ?? [];
    const searchable = [...allowed.values()].filter(
      (r) =>
        !r.archived && r.lifecycle === "active" && !relianceBlocked.has(r.id),
    );
    if (await this.projections.fresh(release.release_id, "search")) {
      try {
        const result = await this.projections.search(
          input.query,
          scope.read_modules,
          useSemantic,
          limit * 4,
          input.rerank === true,
        );
        searchMs = result.elapsed_ms;
        ensure(
          await this.projections.fresh(release.release_id, "search"),
          "INDEX_STALE",
          "Search projection changed during retrieval",
        );
        const map = await readJson<Record<string, any>>(
          this.store.p(`views/${release.release_id}/search-map.json`),
        );
        for (const hit of result.items) {
          const file = String(hit.file ?? "")
            .replace(/^qmd:\/\//, "")
            .split(/[?#]/, 1)[0];
          const entry = map[file];
          if (entry && searchable.some((r) => key(r) === key(entry.record_ref)))
            scores.set(entry.record_ref.id, Number(hit.score ?? 1) * 10);
        }
        route.push(useSemantic ? "semantic" : "exact");
      } catch (e: any) {
        warnings.push("Search index unavailable: " + e.message);
      }
    }
    if (!route.length) {
      route.push("canonical_fallback");
      warnings.push(
        "Canonical keyword lookup is in use; semantic ranking is unavailable for this request.",
      );
    }
    const bodies = new Map(
      await mapLimit(
        searchable,
        async (r) => [r.id, await this.store.body(r)] as const,
      ),
    );
    for (const r of searchable) {
      const p = r.payload as any;
      const text = [
        r.title,
        p.summary,
        p.text,
        p.definition,
        p.unknown,
        bodies.get(r.id),
      ]
        .join(" ")
        .toLowerCase();
      let score = terms.reduce((s, t) => s + (text.includes(t) ? 1 : 0), 0);
      if (
        input.domains?.length &&
        r.scope.domains.some((d) => input.domains!.includes(d))
      )
        score += 1;
      if (input.purpose === "teach" && r.record_type === "learning")
        score += 0.5;
      if (input.purpose === "invent" && p.form === "mechanism") score += 0.5;
      if (score > 0) scores.set(r.id, (scores.get(r.id) ?? 0) + score);
    }
    const seeds = [...scores]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, limit)
        .map(([id]) => id),
      selected = new Set(seeds),
      relations = new Set<string>(),
      judgments = new Set<string>();
    for (const id of seeds) {
      selection.set(
        id,
        "Relevant source-grounded account for the requested purpose",
      );
      roles.set(
        id,
        allowed.get(id)!.record_type === "passage" ? "evidence" : "explanation",
      );
    }
    if (graphFresh && input.graph !== false && seeds.length) {
      try {
        const t = performance.now();
        let frontier = seeds;
        for (let hop = 0; hop < Math.min(input.hops ?? 2, 4); hop++) {
          const found = await this.projections.adjacent(
            frontier,
            scope.read_modules,
            100,
          );
          if (found.length === 100) truncated = true;
          const next: string[] = [];
          for (const id of found) {
            const r = allowed.get(id);
            if (!r || r.lifecycle !== "active" || relianceBlocked.has(id))
              continue;
            relations.add(id);
            const p = r.payload as any;
            for (const end of [p.subject.id, p.object.id])
              if (
                allowed.has(end) &&
                !selected.has(end) &&
                !relianceBlocked.has(end)
              ) {
                selected.add(end);
                next.push(end);
                selection.set(end, `Graph ${p.predicate} relationship ${id}`);
                roles.set(
                  end,
                  p.predicate === "challenges"
                    ? "counterevidence"
                    : p.predicate === "qualifies"
                      ? "qualification"
                      : p.predicate === "depends_on"
                        ? "prerequisite"
                        : "evidence",
                );
              }
          }
          frontier = next;
          if (!next.length) break;
        }
        graphMs = performance.now() - t;
        route.push("graph");
      } catch (e: any) {
        ensure(!input.graph_required, "GRAPH_UNAVAILABLE", e.message);
        warnings.push(
          "Graph expansion failed; canonical qualifications remain available.",
        );
      }
    }
    // Bring in dependencies before checking qualifications, including qualifications of prerequisites.
    for (let round = 0; round < 8; round++) {
      let added = false;
      for (const id of [...selected]) {
        const r = allowed.get(id);
        if (!r) continue;
        for (const d of r.depends_on) {
          const t = allowed.get(d.id);
          if (t && !selected.has(t.id) && !relianceBlocked.has(t.id)) {
            selected.add(t.id);
            roles.set(t.id, "evidence");
            selection.set(t.id, "Cited prerequisite or supporting input");
            added = true;
          }
        }
      }
      if (!added) break;
      if (round === 7) truncated = true;
    }
    // Material qualifications are mandatory even when they rank below a generalization.
    for (let round = 0; round < 8; round++) {
      const before = selected.size;
      for (const r of allowed.values()) {
        const p = r.payload as any;
        if (
          r.record_type === "relationship" &&
          r.lifecycle === "active" &&
          !relianceBlocked.has(r.id) &&
          ["qualifies", "challenges"].includes(p.predicate) &&
          selected.has(p.object.id)
        ) {
          relations.add(r.id);
          if (allowed.has(p.subject.id)) {
            selected.add(p.subject.id);
            roles.set(
              p.subject.id,
              p.predicate === "qualifies" ? "qualification" : "counterevidence",
            );
            selection.set(
              p.subject.id,
              "Material qualification of a retrieved account",
            );
          }
        }
        if (
          r.record_type === "judgment" &&
          p.issue_refs.some((x: Ref) => selected.has(x.id))
        ) {
          judgments.add(r.id);
          selected.add(r.id);
          roles.set(r.id, "alternative");
          selection.set(r.id, "Current judgment about retrieved accounts");
        }
      }
      for (const id of [...selected]) {
        const r = allowed.get(id)!;
        for (const d of r.depends_on) {
          const t = allowed.get(d.id);
          if (t && !relianceBlocked.has(t.id)) {
            selected.add(t.id);
            if (!roles.has(t.id)) roles.set(t.id, "evidence");
            if (!selection.has(t.id))
              selection.set(t.id, "Cited prerequisite or supporting input");
          }
        }
      }
      if (before === selected.size) break;
      if (round === 7) truncated = true;
    }
    const dimensions = await readJson(this.store.p("dimensions.json")).catch(
      () => ({}),
    );
    const impacts = await readJson<any[]>(
      this.store.p(`releases/${await this.store.current()}.impacts.json`),
    ).catch(() => []);
    const items: RetrievalData["items"] = [];
    for (const id of selected) {
      const r = allowed.get(id);
      if (!r || relianceBlocked.has(id)) continue;
      if (items.length >= 120) {
        truncated = true;
        break;
      }
      const p = r.payload as any,
        body = await this.store.body(r);
      let excerpt =
        body ||
        p.text ||
        p.definition ||
        p.rationale ||
        p.summary ||
        p.known ||
        r.title;
      excerpt =
        `Epistemic status: ${r.epistemic}. Assessments: ${JSON.stringify(r.assessments)}\n` +
        excerpt;
      if (r.record_type === "source")
        excerpt += `\nEvidence family: ${p.evidence_family}; independence: ${p.independence}.`;
      const applicability = condition(
        r.scope.condition_expression,
        input.context ?? {},
        dimensions,
      );
      const qualifiers = [...r.scope.conditions, ...r.scope.exclusions];
      if (qualifiers.length)
        excerpt += "\nConditions/limits: " + qualifiers.join("; ");
      if (r.scope.condition_expression && applicability !== "true")
        warnings.push(
          `${key(r)}: applicability ${applicability}; retain the condition in reasoning.`,
        );
      if (
        impacts.some(
          (x) => x.record_ref.id === id && x.status === "pending_reassessment",
        )
      )
        warnings.push(
          `${key(r)} has a changed dependency and needs reassessment.`,
        );
      if (current.get(id)?.revision !== r.revision)
        warnings.push(`${key(r)} is historical; current revision differs.`);
      items.push({
        record_ref: ref(r),
        role: roles.get(id) ?? "evidence",
        excerpt: excerpt.slice(0, 6000),
        generated: !["source", "passage"].includes(r.record_type),
        locator: p.locator ?? null,
        selection_reason: selection.get(id) ?? "Required evidence",
      });
      if (excerpt.length > 6000) truncated = true;
    }
    const exactInputs = new Set(items.map((i) => key(i.record_ref)));
    for (const id of selected) {
      const r = allowed.get(id);
      if (!r) continue;
      for (const d of r.depends_on)
        if (
          !exactInputs.has(key(d)) &&
          current.get(d.id)?.revision !== d.revision
        ) {
          const old = await this.store.exact(d);
          if (
            !(await this.store.allowed(old, scope)) ||
            relianceBlocked.has(d.id)
          )
            continue;
          exactInputs.add(key(d));
          if (items.length >= 120) {
            truncated = true;
            continue;
          }
          const p = old.payload as any;
          items.push({
            record_ref: d,
            role: "evidence",
            excerpt: (
              (await this.store.body(old)) ||
              p.text ||
              p.definition ||
              old.title
            ).slice(0, 6000),
            generated: !["source", "passage"].includes(old.record_type),
            locator: p.locator ?? null,
            selection_reason:
              "Exact historical revision cited by a retrieved account",
          });
          warnings.push(
            `${key(d)} is a historical cited premise; do not substitute its newer revision without reassessment.`,
          );
        }
    }
    if (
      route.includes("graph") &&
      !(await this.projections.fresh(release.release_id, "graph"))
    ) {
      ensure(
        !input.graph_required,
        "GRAPH_UNAVAILABLE",
        "Graph changed during retrieval; retry",
      );
      warnings.push(
        "Graph projection changed during retrieval; returned records were verified against the pinned canonical release.",
      );
    }
    if (!items.length)
      missing.push(
        "No usable account was found in the selected corpus scope. State the gap rather than inventing library evidence.",
      );
    if (relianceBlocked.size)
      warnings.push(
        "Withdrawn support and its unresolved dependents were excluded from current reliance.",
      );
    const receipt = await this.projections.receipt();
    const packet: any = {
      schema_version: VERSION,
      request_id: uid("retrieve-"),
      corpus_id: release.corpus_id,
      release_id: release.release_id,
      purpose: input.purpose ?? "explain",
      query: input.query,
      scope_selection: {
        allowed_modules: scope.read_modules,
        selected_domains: input.domains ?? [],
        source_refs: scope.source_refs,
        rationale:
          "Begin with the requested topic, then include permitted evidence and material qualifications.",
      },
      route,
      items,
      relationship_refs: [...relations].map((id) => ref(allowed.get(id)!)),
      judgment_refs: [...judgments].map((id) => ref(allowed.get(id)!)),
      missing_evidence: missing,
      warnings: [...new Set(warnings)],
      truncated,
      freshness: {
        canonical_release: release.release_id,
        graph_release:
          receipt?.graph?.state === "ready" ? receipt.release_id : null,
        search_release:
          receipt?.search?.state === "ready" ? receipt.release_id : null,
        degraded: route.includes("canonical_fallback") || !graphFresh,
      },
      fingerprints: {
        coordinator: ENGINE_VERSION,
        schema: VERSION,
        qmd: receipt?.search?.version ?? "unavailable",
      },
      timings_ms: {
        total: performance.now() - start,
        search: searchMs,
        graph: graphMs,
      },
    };
    packet.freshness =
      route.includes("canonical_fallback") ||
      !graphFresh ||
      (input.semantic !== false && !useSemantic)
        ? "degraded"
        : release.release_id === (await this.store.current())
          ? "current"
          : "pinned_historical";
    packet.fingerprints.graph_release =
      receipt?.graph?.state === "ready" ? receipt.release_id : "unavailable";
    packet.fingerprints.search_release =
      receipt?.search?.state === "ready" ? receipt.release_id : "unavailable";
    packet.fingerprints.semantic_mode = route.includes("canonical_fallback")
      ? "canonical_keyword_fallback"
      : !route.includes("semantic")
        ? "keyword"
        : input.rerank
          ? "qmd_hybrid_with_rerank"
          : "qmd_keyword_vector_rrf_codex_reasoning";
    await validate("retrieval", packet);
    await atomic(
      this.store.p(`retrieval-receipts/${packet.request_id}.json`),
      json({
        request_id: packet.request_id,
        release_id: packet.release_id,
        query_hash: hash(input.query),
        record_refs: items.map((i) => i.record_ref),
        route,
        timings_ms: packet.timings_ms,
        fingerprints: packet.fingerprints,
        truncated,
      }),
    );
    return packet as RetrievalData;
  }
}

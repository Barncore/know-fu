import type { LibraryIndex } from "./library-index.js";
import type { RecordData } from "./core.js";

export type Gap = {
  kind: "disagreement" | "foundation" | "boundary";
  question: string;
  why: string;
  ids: string[];
  weight: number;
};

/**
 * Questions the library's own shape suggests, computed from records already there:
 * a challenge nobody has weighed, an account many others build on that rests on one
 * source, and a central mechanism or procedure with no recorded limits. They are
 * suggestions for the ranked question list, never records, and an open question that
 * already covers the same accounts suppresses them.
 */
export function gapSignals(
  index: LibraryIndex,
  records: RecordData[],
  centrality = new Map<string, number>(),
): Gap[] {
  const asked = new Set<string>();
  for (const id of index.usableIds) {
    const q = index.visible.get(id)!;
    if (
      q.record_type === "question" &&
      (q.payload as any).resolution_status !== "answered"
    )
      for (const r of (q.payload as any).related_refs ?? []) asked.add(r.id);
  }
  const judged = (id: string) =>
    (index.judgmentsByIssue.get(id) ?? []).some(
      (j) => index.live.get(j.id)?.revision === j.revision,
    );
  const families = (r: RecordData) => {
    const found = new Set<string>();
    for (const s of r.provenance.source_refs)
      found.add(
        (index.visible.get(s.id)?.payload as any)?.evidence_family ?? s.id,
      );
    return found.size;
  };
  const gaps: Gap[] = [];
  const pairs = new Set<string>();
  for (const r of records) {
    if (!index.usableIds.has(r.id) || !index.isAccount(r)) continue;
    const incoming = index.incoming.get(r.id) ?? [];
    for (const link of incoming) {
      if (link.predicate !== "challenges") continue;
      const other = index.visible.get(link.subject);
      const pair = [r.id, link.subject].sort().join("|");
      if (
        !other ||
        pairs.has(pair) ||
        judged(r.id) ||
        judged(other.id) ||
        asked.has(r.id) ||
        asked.has(other.id)
      )
        continue;
      pairs.add(pair);
      gaps.push({
        kind: "disagreement",
        question: `Which holds, and when: "${other.title}" or "${r.title}"?`,
        why: "one challenges the other and no judgment weighs them",
        ids: [other.id, r.id],
        weight: 3,
      });
    }
    if (asked.has(r.id)) continue;
    const builders = incoming.filter(
      (l) => l.predicate === "depends_on",
    ).length;
    const evidence = r.assessments?.evidence?.level;
    if (
      builders >= 2 &&
      families(r) <= 1 &&
      !["moderate", "high"].includes(evidence ?? "")
    )
      gaps.push({
        kind: "foundation",
        question: `Does "${r.title}" hold up?`,
        why: `${builders} accounts build on it and it rests on ${families(r) ? "one source" : "no source"}`,
        ids: [r.id],
        weight: 2 + builders / 10,
      });
    const form = (r.payload as any).form;
    const facets = (r.extensions as any)?.functional_facets;
    const limited =
      r.scope.conditions.length ||
      r.scope.exclusions.length ||
      r.scope.condition_expression ||
      facets?.preconditions?.length ||
      facets?.failure_modes?.length ||
      incoming.some((l) => ["qualifies", "challenges"].includes(l.predicate));
    if (
      r.record_type === "knowledge" &&
      ["mechanism", "procedure"].includes(form) &&
      !limited &&
      (index.adjacency.get(r.id)?.size ?? 0) >= 2
    )
      gaps.push({
        kind: "boundary",
        question: `Where does "${r.title}" stop working?`,
        why: "nothing records its conditions, limits or failure modes",
        ids: [r.id],
        weight: 1 + (centrality.get(r.id) ?? 0),
      });
  }
  return gaps.sort(
    (a, b) => b.weight - a.weight || a.question.localeCompare(b.question),
  );
}

export const gapLine = (g: Gap) =>
  `- ${g.question} (${g.why}; ${g.ids.join(", ")})`;

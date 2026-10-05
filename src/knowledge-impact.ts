import { key, ref } from "./core.js";
import type { RecordData, Ref } from "./core.js";

/**
 * Invalidation follows exact provenance and incoming changes to the meaning of existing accounts.
 * `base` is the resulting release; `prior` is the release before the change, which is where a
 * retargeted or removed relationship or judgment still names its former endpoints.
 */
export function knowledgeImpact(
  base: Map<string, RecordData>,
  changes: RecordData[],
  prior: Map<string, RecordData> = base,
  removed: RecordData[] = [],
) {
  const causes = new Map<string, Map<string, Ref>>();
  const add = (id: string, references: Ref[]) => {
    const found = causes.get(id) ?? new Map<string, Ref>();
    const before = found.size;
    for (const reference of references) found.set(key(reference), reference);
    causes.set(id, found);
    return found.size !== before;
  };
  for (const r of changes) {
    add(r.id, [ref(r)]);
    const p = r.payload as any;
    if (r.record_type === "relationship") {
      // A new/changed/retired qualification can change an old account even without a backlink.
      if (
        ["qualifies", "challenges", "supports", "contradicts"].includes(
          p.predicate,
        )
      )
        add(p.object.id, [ref(r)]);
      if (p.predicate === "depends_on") add(p.subject.id, [ref(r)]);
      const old = prior.get(r.id)?.payload as any;
      if (
        old &&
        ["qualifies", "challenges", "supports", "contradicts"].includes(
          old.predicate,
        )
      )
        add(old.object.id, [ref(r)]);
      if (old?.predicate === "depends_on") add(old.subject.id, [ref(r)]);
    }
    if (r.record_type === "judgment") {
      for (const reference of p.issue_refs) add(reference.id, [ref(r)]);
      for (const reference of (prior.get(r.id)?.payload as any)?.issue_refs ??
        [])
        add(reference.id, [ref(r)]);
    }
  }
  // A relationship or judgment dropped from the release still changes what it used to touch.
  for (const r of removed) {
    const p = r.payload as any;
    if (
      r.record_type === "relationship" &&
      ["qualifies", "challenges", "supports", "contradicts"].includes(
        p.predicate,
      )
    )
      add(p.object.id, [ref(r)]);
    if (r.record_type === "relationship" && p.predicate === "depends_on")
      add(p.subject.id, [ref(r)]);
    if (r.record_type === "judgment")
      for (const reference of p.issue_refs) add(reference.id, [ref(r)]);
  }
  let grew = true;
  while (grew) {
    grew = false;
    for (const r of base.values())
      for (const dependency of r.depends_on) {
        const upstream = causes.get(dependency.id);
        if (upstream && add(r.id, [...upstream.values()])) grew = true;
      }
  }
  return new Map(
    [...causes]
      .filter(([id]) => base.has(id))
      .map(([id, changed]) => [
        id,
        {
          record_ref: ref(base.get(id)!),
          material_change_refs: [...changed.values()],
          changed_dependencies: base
            .get(id)!
            .depends_on.filter((d) => causes.has(d.id)),
          reason:
            "An input or material relationship changed; reconsider the explanation, scope, examples and dependent orientation.",
        },
      ]),
  );
}

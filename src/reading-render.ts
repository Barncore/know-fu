import { key } from "./core.js";

/** MCP presentation only. Canonical JSON and complete reading receipts remain unchanged. */
export function renderReadingResponse(value: any): string {
  const result = value?.result?.interface_version ? value.result : value;
  if (!result?.interface_version || !Array.isArray(result.candidates))
    return JSON.stringify(value);

  const scopes = new Map<string, string>();
  const assessments = new Map<string, string>();
  const shared = (map: Map<string, string>, prefix: string, data: any) => {
    const encoded = JSON.stringify(data);
    if (!map.has(encoded)) map.set(encoded, `${prefix}${map.size + 1}`);
    return map.get(encoded)!;
  };
  const refs = (values: any[] = []) => values.map(key).join(", ") || "none";
  const records = new Map<string, { card: any; roles: string[] }>();
  const collect = (cards: any[] = [], role: string) => {
    for (const card of cards) {
      const { selection_reason: _reason, ...identity } = card;
      const id = JSON.stringify(identity);
      const entry = records.get(id) ?? { card, roles: [] };
      entry.roles.push(`${role}: ${card.selection_reason}`);
      records.set(id, entry);
    }
  };
  collect(result.candidates, "candidate");
  collect(result.necessary_reading, "necessary reading");
  collect(result.graph_candidates, "optional graph candidate");
  for (const topic of result.topics ?? [])
    collect(topic.primers, `primer for ${topic.topic}`);
  const lines = [
    `Know Fu reading presentation 1.0.0 | canonical interface ${result.interface_version}`,
    `Request ${result.request_id}; operation ${result.kind}; release ${result.release_id}; current release ${result.current_release}.`,
    `Purpose: ${result.purpose}. Requirements: ${result.purpose_requirements.join("; ")}.`,
    `Status: ${result.reading_status}. ${result.completeness}`,
    "References below use id@revision. Tool input uses record_ref={id,revision} or record_refs=[{id,revision}]. Shared scopes and assessments are printed once, in full, below.",
    ["discovery", "topic", "catalogue"].includes(result.kind)
      ? "These are orientation choices. Necessary reading applies when relying on the associated candidate; select the relevant accounts, then resolve their returned material context."
      : "Resolve necessary reading for the accounts used in your answer. Provenance references are available for verification; they are not all automatic full-text reading requirements.",
  ];
  for (const { card: c, roles } of records.values()) {
    lines.push(`\n${key(c.record_ref)} — ${c.title}`);
    lines.push(...roles);
    lines.push(
      `Summary (${c.summary_state}): ${c.summary ?? "No authored summary."}`,
    );
    lines.push(
      `Type ${c.record_type}/${c.form}; epistemic ${c.epistemic}; domains ${c.domains.join(", ")}; scope ${shared(scopes, "S", c.scope)}; applicability ${c.applicability}; assessments ${shared(assessments, "A", c.assessments)}.`,
    );
    lines.push(
      `Lifecycle ${c.lifecycle}, archived=${c.archived}; current=${c.current_ref ? key(c.current_ref) : "unavailable"}, lifecycle=${c.current_lifecycle}, archived=${c.current_archived}; freshness=${c.freshness}; read release=${c.read_release}.`,
    );
    lines.push(
      `Sources: ${refs(c.source_refs)}. Exact support: ${refs(c.support_refs)}.`,
    );
    if (c.body_sha256) lines.push(`Body SHA256: ${c.body_sha256}`);
    if (c.locator) lines.push(`Locator: ${JSON.stringify(c.locator)}`);
    if (c.warnings.length) lines.push(`Warnings: ${c.warnings.join(" | ")}`);
  }
  for (const r of result.relationships ?? []) {
    lines.push(
      `\nRelationship ${key(r.record_ref)}: ${key(r.subject)} ${r.predicate} ${key(r.object)} (${r.materiality}). ${r.rationale}`,
    );
    lines.push(
      `Scope ${shared(scopes, "S", r.scope)}; assessments ${shared(assessments, "A", r.assessments)}; warnings: ${r.warnings.join(" | ") || "none"}.`,
    );
  }
  for (const c of [result.content, ...(result.contents ?? [])].filter(
    Boolean,
  )) {
    lines.push(
      `\nCONTENT ${key(c.record_ref)} | ${c.coverage} | SHA256 ${c.body_sha256} | section ${c.section_id ?? "whole account"}`,
    );
    lines.push(c.text);
    const payload = { ...(c.payload ?? {}) };
    const card = [...records.values()].find(
      (r) => key(r.card.record_ref) === key(c.record_ref),
    )?.card;
    // The summary already appears verbatim on the account card; this does not shorten source prose.
    if (payload.summary === card?.summary) delete payload.summary;
    if (Object.keys(payload).length)
      lines.push(`Structured content: ${JSON.stringify(payload)}`);
    if (c.extensions && Object.keys(c.extensions).length)
      lines.push(`Extensions: ${JSON.stringify(c.extensions)}`);
    lines.push(
      `Content assessments: ${shared(assessments, "A", c.assessments)}`,
    );
  }
  for (const [encoded, id] of scopes) lines.push(`\nScope ${id}: ${encoded}`);
  for (const [encoded, id] of assessments)
    lines.push(`\nAssessments ${id}: ${encoded}`);
  const remainder: any = { ...result };
  for (const field of [
    "interface_version",
    "request_id",
    "kind",
    "release_id",
    "current_release",
    "purpose",
    "purpose_requirements",
    "reading_status",
    "completeness",
    "candidates",
    "necessary_reading",
    "graph_candidates",
    "relationships",
    "content",
    "contents",
  ])
    delete remainder[field];
  if (remainder.topics)
    remainder.topics = remainder.topics.map(({ primers, ...topic }: any) => ({
      ...topic,
      primer_refs: (primers ?? []).map((c: any) => c.record_ref),
    }));
  lines.push(`\nReading metadata: ${JSON.stringify(remainder)}`);
  if (value !== result) {
    const { result: _result, ...envelope } = value;
    lines.push(`Session: ${JSON.stringify(envelope)}`);
  }
  return lines.join("\n");
}

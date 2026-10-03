import { hash, key, ref } from "./core.js";
import type { RecordData, Ref } from "./core.js";

/** Navigation is derived from authored metadata, never an on-read model summary. */
export function summary(record: RecordData): string | null {
  const p = record.payload as any;
  const authored = (record.extensions as any)?.navigation?.summary;
  const value =
    authored ??
    (record.record_type === "knowledge"
      ? p.summary
      : record.record_type === "concept"
        ? p.definition
        : record.record_type === "learning"
          ? p.objectives.join("; ")
          : record.record_type === "question"
            ? `Known: ${p.known}\nUnresolved: ${p.unknown}`
            : null);
  return value &&
    value.trim().toLowerCase() !== record.title.trim().toLowerCase()
    ? value
    : null;
}

export function navigationEntry(record: RecordData) {
  const p = record.payload as any;
  return {
    record_ref: ref(record),
    title: record.title,
    summary: summary(record),
    summary_state: summary(record) === null ? "missing" : "authored",
    record_type: record.record_type,
    form: p.form ?? record.record_type,
    domains: record.scope.domains,
    epistemic: record.epistemic,
    lifecycle: record.lifecycle,
    archived: record.archived,
    body_sha256: record.body?.sha256 ?? null,
  };
}

export function isAccount(record: RecordData) {
  return ["knowledge", "concept", "learning", "question"].includes(
    record.record_type,
  );
}

export const purposeRequirements = {
  explain: ["Meaning and mechanism", "Boundary that changes the explanation"],
  teach: [
    "Prerequisites and a coherent sequence",
    "Worked case and likely misunderstanding",
    "A check of the learner's understanding",
  ],
  apply: [
    "Decision criteria and necessary inputs",
    "Failed preconditions and exceptions",
    "What the conclusion permits",
  ],
  compare: [
    "Each account's definitions and scope",
    "Relevant evidence for each position",
    "Unresolved differences and a deciding test",
  ],
  invent: [
    "Mechanisms and supporting premises",
    "Compatibility and the proposed connection",
    "Prior attempts, missing links and a discriminating test",
  ],
  synthesize: [
    "Coverage of relevant topic branches",
    "Minority positions and exceptions",
    "Connections supported by inspected accounts",
  ],
  investigate: [
    "What is known",
    "The gap that could change the decision",
    "A useful next action and its cost or uncertainty",
  ],
} as const;
export type Purpose = keyof typeof purposeRequirements;

export function purposeWeight(record: RecordData, purpose: Purpose) {
  const p = record.payload as any;
  const forms: Record<Purpose, string[]> = {
    explain: ["mechanism", "explanation", "synthesis"],
    teach: ["primer", "teaching_sequence", "worked_example", "near_miss"],
    apply: ["procedure", "application", "worked_example", "near_miss"],
    compare: ["synthesis", "judgment"],
    invent: ["mechanism", "question"],
    synthesize: ["primer", "synthesis"],
    investigate: ["question", "judgment"],
  };
  return forms[purpose].includes(p.form ?? record.record_type) ? 1 : 0;
}

/** Heading boundaries outside fenced code; locators bind release, exact revision and body. */
export function sections(body: string, reference: Ref, release: string) {
  const lines = body.split(/(?<=\n)/),
    starts: { start: number; heading: string }[] = [];
  let position = 0,
    fence: string | null = null;
  for (const line of lines) {
    const marker = /^\s{0,3}(`{3,}|~{3,})/.exec(line)?.[1];
    if (marker) {
      if (!fence) fence = marker;
      else if (marker[0] === fence[0] && marker.length >= fence.length)
        fence = null;
    } else if (!fence) {
      const heading = /^#{1,6}\s+(.+?)\s*#*\s*$/.exec(line.trimEnd())?.[1];
      if (heading) starts.push({ start: position, heading });
    }
    position += line.length;
  }
  if (!starts.length || starts[0].start !== 0)
    starts.unshift({ start: 0, heading: "Opening" });
  const bodyHash = hash(body);
  return starts.map((s, i) => {
    const text = body.slice(s.start, starts[i + 1]?.start ?? body.length);
    return {
      section_id: hash(
        `${release}:${key(reference)}:${bodyHash}:${s.start}`,
      ).slice(0, 32),
      heading: s.heading,
      characters: text.length,
      sha256: hash(text),
      text,
    };
  });
}

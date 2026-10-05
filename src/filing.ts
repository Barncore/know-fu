import { Store } from "./store.js";
import { LibraryIndex } from "./library-index.js";
import { VERSION, ensure, key, ref, uid, uniqueRefs } from "./core.js";
import type { ProposalData, RecordData, Ref } from "./core.js";

export type FileRequest = {
  title: string;
  answer_markdown: string;
  cites: (Ref | string)[];
  summary?: string;
  question?: string;
  form?: string;
  epistemic?: "synthesis" | "inference" | "hypothesis";
  domains?: string[];
  module?: string;
  conditions?: string[];
  exclusions?: string[];
  authorization: string;
  dry_run?: boolean;
};

const KNOWLEDGE_FORMS = [
  "synthesis",
  "explanation",
  "procedure",
  "mechanism",
  "assertion",
];
const LEARNING_FORMS = [
  "application",
  "worked_example",
  "lesson",
  "teaching_sequence",
  "near_miss",
  "primer",
];

export function parseRef(value: Ref | string): Ref {
  if (typeof value !== "string")
    return { id: value.id, revision: value.revision };
  const match = /^([a-z][a-z0-9_-]*:[a-z0-9][a-z0-9_-]*)@(\d+)$/.exec(
    value.trim(),
  );
  ensure(
    match,
    "VALIDATION_FAILED",
    "Cite records as {id,revision} or id@revision",
    { value },
  );
  return { id: match[1], revision: Number(match[2]) };
}

/**
 * File a worked answer back into the library as a cited synthesis. It goes through the
 * normal compile and publish checks, pins the exact revisions it relied on, and becomes
 * pending reassessment automatically when any of them changes.
 */
export class Filing {
  constructor(readonly store: Store) {}

  async file(input: FileRequest) {
    ensure(
      typeof input.title === "string" && input.title.trim(),
      "VALIDATION_FAILED",
      "A title is required",
    );
    ensure(
      typeof input.answer_markdown === "string" &&
        input.answer_markdown.trim().length >= 80,
      "VALIDATION_FAILED",
      "answer_markdown must hold the explanation itself (at least 80 characters)",
    );
    ensure(
      Array.isArray(input.cites) && input.cites.length,
      "VALIDATION_FAILED",
      "Cite at least one library record the answer relies on",
    );
    ensure(
      typeof input.authorization === "string" &&
        input.authorization.trim().length >= 3,
      "AUTHORIZATION_REQUIRED",
      "Quote or summarize the user's request to file this answer",
    );
    const form = input.form ?? "synthesis";
    ensure(
      KNOWLEDGE_FORMS.includes(form) || LEARNING_FORMS.includes(form),
      "VALIDATION_FAILED",
      `form must be one of ${[...KNOWLEDGE_FORMS, ...LEARNING_FORMS].join(", ")}`,
    );
    const cites = uniqueRefs(input.cites.map(parseRef));

    // Resolve citations against a consistent read snapshot, then publish outside it.
    const plan = await this.store.withReadSession(async () => {
      const index = await LibraryIndex.open(this.store, {});
      const records: RecordData[] = [];
      for (const cite of cites) {
        const record = index.visible.get(cite.id);
        ensure(
          record && key(record) === key(cite) && index.usableIds.has(record.id),
          "VALIDATION_FAILED",
          "Every citation must be a current, usable record in your scope",
          { cite: key(cite) },
        );
        ensure(
          !["source", "relationship"].includes(record.record_type),
          "VALIDATION_FAILED",
          "Cite accounts or passages, not sources or links",
          { cite: key(cite) },
        );
        records.push(record);
      }
      const scope = await this.store.scope();
      const modules = [...new Set(records.map((r) => r.maintenance_module))];
      const module =
        input.module ?? (modules.length === 1 ? modules[0] : undefined);
      ensure(
        module,
        "VALIDATION_FAILED",
        "Cited records span several modules; name the module this answer belongs to",
      );
      ensure(
        scope.write_modules.includes(module),
        "SCOPE_DENIED",
        "This project cannot write to that module",
      );
      const sources: Ref[] = [];
      for (const r of records) {
        sources.push(...r.provenance.source_refs);
        if (r.record_type === "passage")
          sources.push((r.payload as any).source_ref);
      }
      const domains = input.domains?.length
        ? input.domains
        : [...new Set(records.flatMap((r) => r.scope.domains))];
      return {
        index,
        records,
        scope,
        module,
        sources: uniqueRefs(sources),
        domains,
        base: index.current,
      };
    });

    const summary = (
      input.summary ??
      input.answer_markdown
        .replace(/^#.*$/gm, "")
        .trim()
        .split(/(?<=[.!?])\s/)[0]
    ).trim();
    const body = `${input.question ? `> Question: ${input.question.trim()}\n\n` : ""}${input.answer_markdown.trim()}\n`;
    const learning = LEARNING_FORMS.includes(form);
    const knowledgeCites = plan.records
      .filter((r) => r.record_type === "knowledge")
      .map(ref);
    ensure(
      !learning || knowledgeCites.length,
      "VALIDATION_FAILED",
      "A lesson or application must cite at least one knowledge account",
    );
    const proposal: ProposalData = {
      schema_version: VERSION,
      proposal_id: uid("file-"),
      job_id: "filed-answer",
      base_release: plan.base,
      scope_policy: {
        read_modules: plan.scope.read_modules,
        write_modules: [plan.module],
        source_refs: plan.scope.source_refs,
      },
      items: [
        {
          local_id: "answer",
          record_type: learning ? "learning" : "knowledge",
          title: input.title.trim(),
          maintenance_module: plan.module,
          epistemic: input.epistemic ?? "synthesis",
          scope: {
            domains: plan.domains,
            conditions: input.conditions ?? [],
            exclusions: input.exclusions ?? [],
            condition_expression: null,
            valid_from: null,
            valid_until: null,
          },
          source_refs: plan.sources,
          input_refs: cites,
          change_reason: `Filed answer${input.question ? ": " + input.question.trim().slice(0, 300) : ""}. Request: ${input.authorization.trim().slice(0, 300)}`,
          body_markdown: body,
          payload: learning
            ? {
                form,
                knowledge_refs: knowledgeCites,
                objectives: [summary || input.title.trim()],
              }
            : {
                form,
                summary: summary || input.title.trim(),
                concept_refs: plan.records
                  .filter((r) => r.record_type === "concept")
                  .map(ref),
              },
        } as any,
      ],
    } as ProposalData;
    const compiled = await this.store.compile(proposal);
    const record = compiled.records[0];
    record.provenance.method = "filed_answer";
    if (input.dry_run)
      return {
        status: "preview",
        record,
        body: compiled.bodies[key(record)],
        note: "Nothing was published. Call again without dry_run to publish.",
      };
    const published = await this.store.publish(
      compiled.records,
      compiled.bodies,
      plan.base,
      `Filed answer: ${input.title.trim()}`,
      proposal.scope_policy,
    );
    return {
      status: "published",
      release_id: published.release_id,
      record_ref: ref(record),
      cites: cites.map(key),
      note: "Recall finds it now through keywords and links. Run kb_maintain reindex when convenient to refresh the wiki and semantic search views.",
    };
  }
}

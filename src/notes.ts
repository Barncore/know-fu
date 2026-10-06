import path from "node:path";
import { parse as parseYaml } from "yaml";
import { Jobs } from "./jobs.js";
import type { Materialized } from "./store.js";
import {
  VERSION,
  atomic,
  ensure,
  hash,
  json,
  key,
  readJson,
  ref,
  safePath,
} from "./core.js";
import type { ProposalData, RecordData, Ref } from "./core.js";
import { closestSpan, quoteFound } from "./quote.js";

/**
 * Notes are the authoring format: Markdown with a short frontmatter block. The engine
 * fills identities, defaults, passages and relationship records, then hands the result
 * to the normal proposal compiler, so every validation still applies.
 */
export type NotesRequest = {
  job_id: string;
  notes: string[];
  proposal_id?: string;
  replace?: boolean;
  dry_run?: boolean;
};

type Target = Ref | { local_ref: string };
type Unit = {
  unit_id: string;
  source_ref: Ref;
  kind: string;
  text: string;
  sha256: string;
  locator: any;
  asset_path: string | null;
};

const TYPES = [
  "knowledge",
  "concept",
  "learning",
  "judgment",
  "question",
] as const;
const PREDICATES = [
  "supports",
  "challenges",
  "qualifies",
  "depends_on",
  "explains",
  "exemplifies",
  "applies_to",
  "derived_from",
];
const ESSENTIAL = new Set(["qualifies", "challenges", "depends_on"]);
const SLUG = /^[a-z0-9][a-z0-9-]{0,60}$/;
const ASSESSMENT_LEVELS = [
  "low",
  "moderate",
  "high",
  "unknown",
  "not_assessed",
];
const EVIDENCE_BASES = [
  "review_of_studies",
  "controlled_comparison",
  "measured_observation",
  "worked_case",
  "reasoned_argument",
  "bare_assertion",
  "our_inference",
];
const THIN_BASES = ["worked_case", "bare_assertion", "our_inference"];

const list = (value: unknown): any[] =>
  value == null ? [] : Array.isArray(value) ? value : [value];
const text = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const FACET_SLOTS = [
  "purpose",
  "mechanism",
  "preconditions",
  "failure_modes",
  "evaluation_method",
];
const FACET_CORE = ["purpose", "mechanism"];
/** Forms that must say what they do when first written. */
const FACET_FORMS = ["mechanism", "procedure"];
const wordCount = (s: string) => s.split(/\s+/).filter(Boolean).length;

export function hasCoreFacets(facets: any) {
  return !!facets?.purpose?.length && !!facets?.mechanism?.length;
}

/**
 * Builds `extensions.functional_facets` from a note's `facets` block. Each entry is a short
 * phrase in the source's terms plus, for purpose and mechanism, an abstract wording without
 * the field's own terms, which is what lets a record from another field match it.
 */
export function facetsFrom(value: unknown, where: string, epistemic: string) {
  ensure(
    !!value && typeof value === "object" && !Array.isArray(value),
    "VALIDATION_FAILED",
    `${where}: facets is a map of slots: ${FACET_SLOTS.join(", ")}`,
  );
  const facets: Record<string, any[]> = {};
  for (const [slot, raw] of Object.entries(value as Record<string, unknown>)) {
    ensure(
      FACET_SLOTS.includes(slot),
      "VALIDATION_FAILED",
      `${where}: facets.${slot} isn't a facet slot; use ${FACET_SLOTS.join(", ")}`,
    );
    const entries = list(raw);
    ensure(
      entries.length >= 1 && entries.length <= 4,
      "VALIDATION_FAILED",
      `${where}: facets.${slot} takes one to four short entries`,
    );
    facets[slot] = entries.map((raw, i) => {
      const at = `${where}: facets.${slot}[${i}]`;
      const entry: any = typeof raw === "string" ? { text: raw } : (raw ?? {});
      const phrase = text(entry.text);
      const abstract = text(entry.abstract);
      ensure(phrase, "VALIDATION_FAILED", `${at} needs text`);
      ensure(
        wordCount(phrase) <= 30,
        "VALIDATION_FAILED",
        `${at}: keep the text to a short phrase of 30 words or fewer`,
      );
      ensure(
        !FACET_CORE.includes(slot) || abstract,
        "VALIDATION_FAILED",
        `${at} needs an abstract wording: the same ${slot} in domain-free words, so records from other fields can match it`,
      );
      if (abstract) {
        ensure(
          wordCount(abstract) <= 15,
          "VALIDATION_FAILED",
          `${at}: keep the abstract wording to 15 words or fewer`,
        );
        ensure(
          abstract.toLowerCase() !== phrase.toLowerCase(),
          "VALIDATION_FAILED",
          `${at}: the abstract wording repeats the text; restate it without the field's own terms`,
        );
      }
      const basis =
        text(entry.basis) ||
        (epistemic === "source_account" ? "source_stated" : "inferred");
      ensure(
        ["source_stated", "inferred", "proposed"].includes(basis),
        "VALIDATION_FAILED",
        `${at}: basis is source_stated, inferred or proposed`,
      );
      return {
        text: phrase,
        ...(abstract ? { abstract } : {}),
        basis,
        evidence_refs: [],
      };
    });
  }
  return facets;
}

export function splitNote(source: string) {
  const match = /^﻿?---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(source);
  ensure(
    match,
    "VALIDATION_FAILED",
    "A note starts with a --- frontmatter block and ends it with ---",
  );
  const front = parseYaml(match[1]) ?? {};
  ensure(
    front && typeof front === "object" && !Array.isArray(front),
    "VALIDATION_FAILED",
    "Frontmatter must be a mapping",
  );
  return { front: front as Record<string, any>, body: match[2].trim() };
}

function firstParagraph(body: string) {
  return (
    body
      .replace(/^#.*$/gm, "")
      .trim()
      .split(/\r?\n\s*\r?\n/)[0]
      ?.replace(/\s+/g, " ")
      .trim() ?? ""
  );
}

export class Notes {
  constructor(readonly jobs: Jobs) {}

  private get store() {
    return this.jobs.store;
  }

  async write(input: NotesRequest) {
    ensure(
      Array.isArray(input.notes) && input.notes.length,
      "VALIDATION_FAILED",
      "Supply notes: an array of Markdown notes",
    );
    ensure(
      input.notes.length <= 60,
      "VALIDATION_FAILED",
      "Write at most 60 notes per call",
    );
    const job = await this.jobs.load(input.job_id);
    const dir = this.jobs.jobPath(job.job_id);
    const sources = await readJson<RecordData[]>(
      path.join(dir, "sources.json"),
    );
    ensure(
      sources.length,
      "VALIDATION_FAILED",
      "Notes belong to an ingestion job with sources",
    );
    const module = sources[0].maintenance_module;
    const defaultDomains = [
      ...new Set(sources.flatMap((s) => s.scope.domains)),
    ];
    const staged = await readJson<Materialized>(path.join(dir, "staged.json"));
    const current = await this.store.records();
    const slugFile = path.join(dir, "slugs.json");
    const slugs = await readJson<Record<string, Ref>>(slugFile).catch(
      () => ({}) as Record<string, Ref>,
    );
    const known = new Map<string, RecordData>();
    for (const r of current.values()) known.set(r.id, r);
    for (const r of staged.records) known.set(r.id, r);

    const parsed = input.notes.map((source, i) => {
      const note = splitNote(source);
      const slug = text(note.front.id);
      ensure(
        SLUG.test(slug),
        "VALIDATION_FAILED",
        `Note ${i + 1}: id must be a short lowercase slug like "holm-step-down"`,
        { id: note.front.id },
      );
      return { ...note, slug, index: i + 1 };
    });
    const batch = new Set<string>();
    for (const n of parsed) {
      ensure(
        !batch.has(n.slug),
        "VALIDATION_FAILED",
        `Duplicate note id ${n.slug}`,
      );
      batch.add(n.slug);
    }

    const resolve = (value: unknown, where: string): Target => {
      const raw = text(
        typeof value === "object" && value ? (value as any).ref : value,
      );
      ensure(raw, "VALIDATION_FAILED", `${where}: empty reference`);
      const exact = /^([a-z][a-z0-9_-]*:[a-z0-9][a-z0-9_-]*)@(\d+)$/.exec(raw);
      if (exact) {
        const found = known.get(exact[1]);
        ensure(
          found && found.revision >= Number(exact[2]),
          "VALIDATION_FAILED",
          `${where}: ${raw} is not in this library`,
        );
        return { id: exact[1], revision: Number(exact[2]) };
      }
      if (/^[a-z][a-z0-9_-]*:[a-z0-9][a-z0-9_-]*$/.test(raw)) {
        const found = known.get(raw);
        ensure(
          found,
          "VALIDATION_FAILED",
          `${where}: ${raw} is not in this library`,
        );
        return ref(found);
      }
      if (batch.has(raw)) return { local_ref: raw };
      ensure(
        slugs[raw],
        "VALIDATION_FAILED",
        `${where}: unknown note "${raw}". Use a slug from this job, or an id from kb_recall.`,
      );
      return slugs[raw];
    };
    const typeOf = (target: Target) =>
      "local_ref" in target
        ? text(parsed.find((n) => n.slug === target.local_ref)!.front.type)
        : known.get(target.id)?.record_type;

    // Units cited by notes become passages, reusing any passage that already holds the same unit.
    const coverage = new Map(job.coverage.map((u) => [u.unit_id, u]));
    const extractions = new Map<string, any>();
    const unitCache = new Map<string, Unit>();
    const loadUnit = async (unitId: string, where: string): Promise<Unit> => {
      if (unitCache.has(unitId)) return unitCache.get(unitId)!;
      const entry = coverage.get(unitId);
      ensure(
        entry && entry.converted === "complete",
        "VALIDATION_FAILED",
        `${where}: ${unitId} is not a converted unit of this job`,
      );
      const mapping = entry.receipts.find((r) =>
        /\/(extraction|supp-[a-f0-9]+)\.json$/.test(r),
      );
      ensure(
        mapping,
        "SOURCE_UNREADABLE",
        `${where}: extraction mapping unavailable for ${unitId}`,
      );
      if (!extractions.has(mapping))
        extractions.set(
          mapping,
          await readJson(await safePath(this.store.root, mapping)),
        );
      const unit = extractions
        .get(mapping)
        .units.find((u: any) => u.unit_id === unitId);
      ensure(
        unit && unit.sha256 === hash(unit.text ?? ""),
        "SOURCE_UNREADABLE",
        `${where}: ${unitId} failed its integrity check`,
      );
      const result: Unit = {
        unit_id: unitId,
        source_ref: entry.source_ref,
        kind: unit.kind,
        text: unit.text ?? "",
        sha256: unit.sha256,
        locator: unit.locator,
        asset_path: unit.asset_path ?? null,
      };
      unitCache.set(unitId, result);
      return result;
    };
    const passageFor = new Map<string, Target>();
    const passageItems: any[] = [];
    // Sources sharing an evidence family (a PDF and its summary, say) count once.
    const familyOf = (sourceRef: Ref) =>
      (
        (known.get(sourceRef.id) ?? sources.find((s) => s.id === sourceRef.id))
          ?.payload as any
      )?.evidence_family ?? sourceRef.id;
    const sourceTitle = (sourceRef: Ref) =>
      (known.get(sourceRef.id)?.title ?? sourceRef.id).replace(
        /\.[a-z0-9]+$/i,
        "",
      );
    const passageTarget = async (unit: Unit): Promise<Target> => {
      if (passageFor.has(unit.unit_id)) return passageFor.get(unit.unit_id)!;
      const existing = [...known.values()].find(
        (r) =>
          r.record_type === "passage" &&
          (r.payload as any).extraction_sha256 === unit.sha256 &&
          key((r.payload as any).source_ref) === key(unit.source_ref) &&
          JSON.stringify((r.payload as any).locator) ===
            JSON.stringify(unit.locator),
      );
      const target: Target = existing
        ? ref(existing)
        : { local_ref: "unit-" + hash(unit.unit_id).slice(0, 12) };
      if (!existing)
        passageItems.push({
          local_id: (target as any).local_ref,
          record_type: "passage",
          title: `${sourceTitle(unit.source_ref)} ${unit.locator?.label ?? unit.unit_id}`,
          maintenance_module: module,
          epistemic: "source_account",
          scope: {
            domains: defaultDomains,
            conditions: [],
            exclusions: [],
            condition_expression: null,
            valid_from: null,
            valid_until: null,
          },
          source_refs: [unit.source_ref],
          input_refs: [],
          change_reason: "Located source evidence cited by an authored note",
          body_markdown: null,
          payload: {
            source_ref: unit.source_ref,
            kind: unit.kind,
            text: unit.text,
            asset_path: unit.asset_path,
            locator: unit.locator,
            extraction_sha256: unit.sha256,
          },
        });
      passageFor.set(unit.unit_id, target);
      return target;
    };

    const items: any[] = [];
    const relationships: any[] = [];
    const problems: string[] = [];
    const thinHigh: { slug: string; where: string; basis: string }[] = [];
    for (const n of parsed) {
      const where = `Note ${n.index} (${n.slug})`;
      const f = n.front;
      // A revision states only what changes; everything it omits is inherited from the current revision.
      const existing = f.revises ? resolve(f.revises, where) : undefined;
      ensure(
        !existing || !("local_ref" in existing),
        "VALIDATION_FAILED",
        `${where}: revises takes a published record id`,
      );
      const base = existing ? known.get((existing as Ref).id) : undefined;
      if (existing)
        ensure(
          base && base.revision === (existing as Ref).revision,
          "REVISION_CONFLICT",
          `${where}: revise the current revision ${base ? key(base) : (existing as Ref).id}`,
        );
      if (base)
        ensure(
          text(f.change) || text(f.reaffirm),
          "VALIDATION_FAILED",
          `${where}: a revision gives its reason under change or reaffirm`,
        );
      const basePayload: any = base ? structuredClone(base.payload) : {};
      const type = (text(f.type) ||
        base?.record_type) as (typeof TYPES)[number];
      ensure(
        TYPES.includes(type),
        "VALIDATION_FAILED",
        `${where}: type must be one of ${TYPES.join(", ")}`,
      );
      ensure(
        !base || base.record_type === type,
        "VALIDATION_FAILED",
        `${where}: a revision keeps its record type`,
      );
      const title = text(f.title) || base?.title || "";
      ensure(title, "VALIDATION_FAILED", `${where}: title is required`);

      // Evidence: unit ids (become passages, optionally with a verified quote) or existing records.
      const inputs: Target[] = base ? [...base.provenance.input_refs] : [];
      const sourceRefs = new Map<string, Ref>(
        (base?.provenance.source_refs ?? []).map((s) => [key(s), s]),
      );
      const citations: { ref: Target; quote: string }[] = [
        ...(((base?.extensions as any)?.citations ?? []) as any[]),
      ];
      for (const cite of list(f.cites)) {
        const unitId =
          typeof cite === "string"
            ? coverage.has(cite)
              ? cite
              : null
            : text(cite?.unit) || null;
        if (unitId) {
          const unit = await loadUnit(unitId, where);
          const target = await passageTarget(unit);
          inputs.push(target);
          sourceRefs.set(key(unit.source_ref), unit.source_ref);
          const quote = typeof cite === "object" ? text(cite.quote) : "";
          if (quote) {
            if (quoteFound(quote, unit.text))
              citations.push({ ref: target, quote });
            else {
              const closest = closestSpan(quote, unit.text);
              problems.push(
                `${where}: quote not found in ${unitId}${closest && closest.overlap > 0.4 ? `; closest wording: "${closest.text}"` : ""}`,
              );
            }
          }
          continue;
        }
        const target = resolve(cite, where);
        inputs.push(target);
        if (!("local_ref" in target)) {
          const record = known.get(target.id)!;
          for (const s of record.record_type === "source"
            ? [ref(record)]
            : record.provenance.source_refs)
            sourceRefs.set(key(s), s);
          const quote = typeof cite === "object" ? text(cite.quote) : "";
          if (quote && record.record_type === "passage") {
            if (quoteFound(quote, (record.payload as any).text ?? ""))
              citations.push({ ref: target, quote });
            else problems.push(`${where}: quote not found in ${key(target)}`);
          }
        }
      }
      const uses = list(f.uses).map((u) => resolve(u, where));
      inputs.push(...uses);
      for (const target of uses)
        if (!("local_ref" in target))
          for (const s of known.get(target.id)!.provenance.source_refs)
            sourceRefs.set(key(s), s);

      const body =
        n.body ||
        (base
          ? (staged.bodies[key(base)] ?? (await this.store.body(base)))
          : "");
      const summary =
        text(f.summary) ||
        (base && !n.body ? text(basePayload.summary) : "") ||
        firstParagraph(body).slice(0, 400);
      const domains = list(f.domains).map(text).filter(Boolean);
      const distinctSources = sourceRefs.size;
      const epistemic =
        text(f.epistemic) ||
        base?.epistemic ||
        (type === "judgment"
          ? "judgment"
          : (type === "knowledge" || type === "concept") &&
              distinctSources === 1 &&
              uses.length === 0
            ? "source_account"
            : "synthesis");
      const refs = (field: unknown, inherited: Target[] = []) => {
        const given = list(field).map((x) => resolve(x, where));
        return [
          ...new Map(
            [...inherited, ...given].map((t) => [JSON.stringify(t), t]),
          ).values(),
        ];
      };
      const payload: any = basePayload;
      if (type === "knowledge") {
        payload.form = text(f.form) || basePayload.form || "explanation";
        payload.summary = summary || title;
        payload.concept_refs = refs(
          [],
          [
            ...(basePayload.concept_refs ?? []),
            ...uses.filter((t) => typeOf(t) === "concept"),
          ],
        );
        ensure(
          body,
          "VALIDATION_FAILED",
          `${where}: knowledge needs explanatory prose below the frontmatter`,
        );
      } else if (type === "concept") {
        payload.definition =
          text(f.definition) ||
          basePayload.definition ||
          summary ||
          firstParagraph(body);
        payload.meaning_scope =
          text(f.meaning_scope) ||
          basePayload.meaning_scope ||
          list(f.holds_when).map(text).join("; ") ||
          `As used in ${[...sourceRefs.values()].map(sourceTitle).join(", ") || "this library"}`;
        payload.aliases = [
          ...new Set([
            ...(basePayload.aliases ?? []),
            ...list(f.aliases).map(text).filter(Boolean),
          ]),
        ];
        ensure(
          payload.definition,
          "VALIDATION_FAILED",
          `${where}: a concept needs a definition`,
        );
      } else if (type === "learning") {
        payload.form = text(f.form) || basePayload.form || "lesson";
        payload.knowledge_refs = refs(
          [],
          [
            ...(basePayload.knowledge_refs ?? []),
            ...uses.filter((t) => typeOf(t) === "knowledge"),
          ],
        );
        const objectives = list(f.objectives).map(text).filter(Boolean);
        payload.objectives = objectives.length
          ? objectives
          : (basePayload.objectives ?? [summary || title]);
        ensure(
          payload.knowledge_refs.length,
          "VALIDATION_FAILED",
          `${where}: a lesson lists the knowledge notes it teaches under uses`,
        );
        ensure(
          body,
          "VALIDATION_FAILED",
          `${where}: a lesson needs its teaching prose below the frontmatter`,
        );
      } else if (type === "judgment") {
        payload.issue_refs = refs(f.issues, basePayload.issue_refs);
        payload.outcome =
          text(f.outcome) || basePayload.outcome || "unresolved";
        payload.alternatives = refs(f.alternatives, basePayload.alternatives);
        payload.preferred_refs =
          f.preferred !== undefined
            ? refs(f.preferred)
            : (basePayload.preferred_refs ?? []);
        payload.rationale =
          text(f.rationale) ||
          (n.body ? firstParagraph(n.body) : "") ||
          basePayload.rationale ||
          summary;
        payload.what_would_change =
          text(f.what_would_change) ||
          basePayload.what_would_change ||
          "Evidence that separates the alternatives.";
        ensure(
          payload.issue_refs.length,
          "VALIDATION_FAILED",
          `${where}: a judgment names the accounts it assesses under issues`,
        );
        inputs.push(...payload.issue_refs);
      } else if (type === "question") {
        payload.related_refs = refs(f.related, basePayload.related_refs);
        payload.known = text(f.known) || basePayload.known || summary;
        payload.unknown = text(f.unknown) || basePayload.unknown || title;
        payload.impact =
          text(f.impact) ||
          basePayload.impact ||
          "Would change how the related accounts are applied.";
        payload.next_action =
          text(f.next_action) ||
          basePayload.next_action ||
          "Find a source that addresses this directly.";
        payload.resolution_status =
          text(f.status) || basePayload.resolution_status || "open";
        const priority = f.priority ?? {};
        payload.priority = {
          impact:
            text(priority.impact) || basePayload.priority?.impact || "medium",
          effort:
            text(priority.effort) || basePayload.priority?.effort || "unknown",
          rationale:
            text(priority.why) ||
            text(priority.rationale) ||
            basePayload.priority?.rationale ||
            "Not yet assessed.",
        };
        ensure(
          payload.related_refs.length,
          "VALIDATION_FAILED",
          `${where}: a question names related accounts under related`,
        );
        inputs.push(...payload.related_refs);
      }
      ensure(
        inputs.length || type === "concept",
        "VALIDATION_FAILED",
        `${where}: cite source units or library records; an ungrounded note cannot enter the library`,
      );
      // A level needs its one-line reason; a dimension left out stays as it was (or unassessed).
      const assessments = f.assess
        ? Object.fromEntries(
            ["fidelity", "evidence", "applicability"].map((dimension) => {
              const a = f.assess?.[dimension];
              if (!a)
                return [
                  dimension,
                  base?.assessments?.[
                    dimension as "fidelity" | "evidence" | "applicability"
                  ] ?? {
                    level: "not_assessed",
                    rationale: "No substantive assessment has been supplied.",
                    context: null,
                  },
                ];
              const level = text(a.level);
              ensure(
                ASSESSMENT_LEVELS.includes(level),
                "VALIDATION_FAILED",
                `${where}: assess.${dimension}.level must be one of ${ASSESSMENT_LEVELS.join(", ")}`,
              );
              const why = text(a.why) || text(a.rationale);
              ensure(
                level === "not_assessed" || why,
                "VALIDATION_FAILED",
                `${where}: assess.${dimension} needs a one-line why. Leave the dimension out rather than guess.`,
              );
              // An evidence level names the kind of support the source shows. High from thin
              // support needs a second independent family, so repetition can never raise it.
              const basis = text(a.basis);
              if (dimension === "evidence" && basis)
                ensure(
                  EVIDENCE_BASES.includes(basis),
                  "VALIDATION_FAILED",
                  `${where}: assess.evidence.basis must be one of ${EVIDENCE_BASES.join(", ")}`,
                );
              if (
                dimension === "evidence" &&
                ["low", "moderate", "high"].includes(level)
              ) {
                ensure(
                  basis,
                  "VALIDATION_FAILED",
                  `${where}: assess.evidence needs a basis naming the kind of support: ${EVIDENCE_BASES.join(", ")}`,
                );
                // Checked once sources from same-batch notes have been propagated.
                if (level === "high" && THIN_BASES.includes(basis))
                  thinHigh.push({ slug: n.slug, where, basis });
              }
              return [
                dimension,
                {
                  level,
                  rationale:
                    why || "No substantive assessment has been supplied.",
                  context: text(a.context) || null,
                  ...(dimension === "evidence" && basis ? { basis } : {}),
                },
              ];
            }),
          )
        : base?.assessments;
      const extensions: any = base ? structuredClone(base.extensions) : {};
      const uniqueCitations = [
        ...new Map(citations.map((c) => [JSON.stringify(c), c])).values(),
      ];
      if (uniqueCitations.length) extensions.citations = uniqueCitations;
      if (text(f.nav_summary))
        extensions.navigation = {
          interface_version: "1.0.0",
          summary: text(f.nav_summary),
        };
      // Functional facets say what an account does, in its own terms and in domain-free
      // words, so records from other fields can be matched on function rather than topic.
      if (f.facets !== undefined)
        extensions.functional_facets = facetsFrom(f.facets, where, epistemic);
      // Decision points: where a procedure branches, as an expert would say it out loud.
      if (f.decisions !== undefined) {
        const points = list(f.decisions);
        ensure(
          !points.length ||
            (type === "knowledge" && payload.form === "procedure"),
          "VALIDATION_FAILED",
          `${where}: decisions belong on procedure notes`,
        );
        ensure(
          points.length <= 12,
          "VALIDATION_FAILED",
          `${where}: keep to the 12 decisions that matter most`,
        );
        const decisionPoints = [];
        for (const [i, raw] of points.entries()) {
          const at = `${where}: decisions[${i}]`;
          const short = (value: unknown, field: string, words: number) => {
            const phrase = text(value);
            ensure(phrase, "VALIDATION_FAILED", `${at} needs ${field}`);
            ensure(
              wordCount(phrase) <= words,
              "VALIDATION_FAILED",
              `${at}: keep ${field} to ${words} words or fewer`,
            );
            return phrase;
          };
          const options = list(raw?.options);
          ensure(
            options.length >= 2 && options.length <= 5,
            "VALIDATION_FAILED",
            `${at}: a decision has two to five options, each {if, then}; "otherwise" is a fine if`,
          );
          const evidence: Target[] = [];
          if (raw?.cite !== undefined) {
            const cite = text(raw.cite);
            if (coverage.has(cite)) {
              const unit = await loadUnit(cite, at);
              const target = await passageTarget(unit);
              inputs.push(target);
              sourceRefs.set(key(unit.source_ref), unit.source_ref);
              evidence.push(target);
            } else {
              const target = resolve(cite, at);
              ensure(
                typeOf(target) === "passage",
                "VALIDATION_FAILED",
                `${at}: cite a unit or passage`,
              );
              inputs.push(target);
              evidence.push(target);
            }
          }
          decisionPoints.push({
            cue: short(raw?.at, "at (when the choice comes up)", 20),
            decision: short(
              raw?.decide,
              "decide (the question being settled)",
              25,
            ),
            options: options.map((o: any, j: number) => ({
              when: short(o?.if, `options[${j}].if`, 30),
              then: short(o?.then, `options[${j}].then`, 30),
            })),
            check:
              raw?.check === undefined ? null : short(raw.check, "check", 25),
            basis:
              raw?.stated === false
                ? "inferred"
                : raw?.stated === true || epistemic === "source_account"
                  ? "source_stated"
                  : "inferred",
            evidence_refs: evidence,
          });
        }
        if (decisionPoints.length) extensions.decision_points = decisionPoints;
        else delete extensions.decision_points;
      }
      ensure(
        type !== "knowledge" ||
          !FACET_FORMS.includes(payload.form) ||
          !!base ||
          hasCoreFacets(extensions.functional_facets),
        "VALIDATION_FAILED",
        `${where}: a ${payload.form} note says what it does: add facets with at least one purpose and one mechanism, each with text and an abstract wording (see the notes guide)`,
      );
      const uniqueInputs = [
        ...new Map(inputs.map((t) => [JSON.stringify(t), t])).values(),
      ];
      const pick = (field: unknown, inherited: string[] = []) =>
        field === undefined ? inherited : list(field).map(text).filter(Boolean);
      items.push({
        local_id: n.slug,
        record_type: type,
        title,
        maintenance_module: base?.maintenance_module ?? module,
        epistemic,
        scope: {
          domains: domains.length
            ? domains
            : (base?.scope.domains ?? defaultDomains),
          conditions: pick(f.holds_when, base?.scope.conditions),
          exclusions: pick(f.not_for, base?.scope.exclusions),
          condition_expression: base?.scope.condition_expression ?? null,
          valid_from: f.valid_from
            ? String(f.valid_from)
            : (base?.scope.valid_from ?? null),
          valid_until: f.valid_until
            ? String(f.valid_until)
            : (base?.scope.valid_until ?? null),
        },
        source_refs: [...sourceRefs.values()],
        input_refs: uniqueInputs,
        change_reason:
          text(f.change) ||
          (text(f.reaffirm)
            ? `Reaffirmed: ${text(f.reaffirm)}`
            : `Authored from ${job.job_id}`),
        body_markdown: body || null,
        payload,
        ...(existing ? { existing_ref: existing } : {}),
        ...(assessments ? { assessments } : {}),
        ...(Object.keys(extensions).length ? { extensions } : {}),
      });

      // Typed links become relationship records whose subject is this note.
      for (const link of list(f.links)) {
        const predicate = Object.keys(link ?? {}).find((k) =>
          PREDICATES.includes(k),
        );
        ensure(
          predicate,
          "VALIDATION_FAILED",
          `${where}: each link names one of ${PREDICATES.join(", ")}`,
        );
        const object = resolve(link[predicate], where);
        const why = text(link.why);
        ensure(
          why,
          "VALIDATION_FAILED",
          `${where}: each link explains why it holds (why: ...)`,
        );
        const objectName =
          "local_ref" in object
            ? object.local_ref
            : (known.get(object.id)?.title ?? object.id);
        relationships.push({
          local_id: `${n.slug}--${predicate}--${hash(JSON.stringify(object)).slice(0, 8)}`,
          record_type: "relationship",
          title: `${title} ${predicate.replace("_", " ")} ${objectName}`.slice(
            0,
            200,
          ),
          maintenance_module: module,
          epistemic:
            link.stated === true && epistemic === "source_account"
              ? "source_account"
              : "synthesis",
          scope: {
            domains: domains.length ? domains : defaultDomains,
            conditions: [],
            exclusions: [],
            condition_expression: null,
            valid_from: null,
            valid_until: null,
          },
          source_refs: [...sourceRefs.values()],
          input_refs: [{ local_ref: n.slug }, object],
          change_reason: text(f.change) || `Authored from ${job.job_id}`,
          body_markdown: null,
          payload: {
            subject: { local_ref: n.slug },
            object,
            predicate,
            rationale: why,
            materiality:
              text(link.materiality) ||
              (ESSENTIAL.has(predicate) ? "essential" : "contextual"),
          },
        });
      }
    }
    // A note that cites or uses another note in this batch inherits that note's sources,
    // whatever order the notes arrive in, so attribution and source-restricted scopes hold.
    const bySlug = new Map<string, any>(items.map((i) => [i.local_id, i]));
    for (let grew = true; grew;) {
      grew = false;
      for (const item of items) {
        const have = new Set((item.source_refs as Ref[]).map(key));
        for (const input of item.input_refs as Target[]) {
          const dependency =
            "local_ref" in input ? bySlug.get(input.local_ref) : undefined;
          for (const s of (dependency?.source_refs ?? []) as Ref[])
            if (!have.has(key(s))) {
              item.source_refs.push(s);
              have.add(key(s));
              grew = true;
            }
        }
      }
    }
    for (const relationship of relationships) {
      const subject = bySlug.get(relationship.payload.subject.local_ref);
      const have = new Set((relationship.source_refs as Ref[]).map(key));
      for (const s of (subject?.source_refs ?? []) as Ref[])
        if (!have.has(key(s))) relationship.source_refs.push(s);
    }
    for (const { slug, where, basis } of thinHigh) {
      const families = new Set(
        (bySlug.get(slug).source_refs as Ref[]).map(familyOf),
      ).size;
      ensure(
        families >= 2,
        "VALIDATION_FAILED",
        `${where}: evidence high from a ${basis.replace(/_/g, " ")} needs at least two independent source families, and this note rests on ${families}. Lower the level or cite the other evidence.`,
      );
    }
    ensure(
      !problems.length,
      "QUOTE_NOT_FOUND",
      "Some quotes do not match their cited text. Copy the wording exactly or drop the quote.",
      { problems },
    );

    const proposal = {
      schema_version: VERSION,
      proposal_id:
        input.proposal_id ??
        `notes-${hash(job.job_id + JSON.stringify(input.notes)).slice(0, 20)}`,
      job_id: job.job_id,
      base_release: job.base_release,
      scope_policy: job.scope_policy,
      items: [...passageItems, ...items, ...relationships],
    } as unknown as ProposalData;

    if (input.dry_run) {
      const compiled = await this.store.compile(proposal, staged.records);
      return {
        status: "valid",
        proposal_id: proposal.proposal_id,
        notes: items.length,
        passages_created: passageItems.length,
        relationships: relationships.length,
        records: compiled.records.map((r) => ({
          ref: key(r),
          type: r.record_type,
          title: r.title,
        })),
        note: "Nothing was staged. Call again without dry_run to stage these records.",
      };
    }
    const receipt: any = await this.jobs.propose(
      proposal,
      input.replace === true,
    );
    const localRefs: Record<string, Ref> = receipt.local_refs ?? {};
    for (const n of parsed)
      if (localRefs[n.slug]) slugs[n.slug] = localRefs[n.slug];
    await atomic(slugFile, json(slugs));
    return {
      status: "staged",
      proposal_id: proposal.proposal_id,
      notes: parsed.map((n) => ({
        slug: n.slug,
        ref: localRefs[n.slug] ? key(localRefs[n.slug]) : null,
      })),
      passages_created: passageItems.length,
      relationships: relationships.length,
      citations_verified: items.reduce(
        (sum, i) => sum + (i.extensions?.citations?.length ?? 0),
        0,
      ),
      next: "Later notes in this job can refer to these slugs. Continue with kb_job next when the stage's work is done.",
    };
  }
}

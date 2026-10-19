import * as fs from "node:fs/promises";
import path from "node:path";
import { parse as parseYaml } from "yaml";
import { Jobs } from "./jobs.js";
import type { Materialized } from "./store.js";
import {
  KBError,
  VERSION,
  atomic,
  ensure,
  hash,
  json,
  key,
  readJson,
  ref,
  safePath,
  withLock,
} from "./core.js";
import type { ProposalData, RecordData, Ref } from "./core.js";
import { closestSpan, quoteFound } from "./quote.js";

/**
 * Notes are the authoring format: Markdown with a short frontmatter block. The engine
 * fills identities, defaults, passages and relationship records, then hands the result
 * to the normal proposal compiler, so every validation still applies.
 *
 * Notes arrive inline (`notes`) or as files (`paths`: note files or folders of them).
 * Files let an agent write each note once and fix one field in place after a refusal,
 * instead of sending the whole batch again.
 */
export type NotesRequest = {
  job_id: string;
  notes?: string[];
  paths?: string[];
  proposal_id?: string;
  replace?: boolean;
  dry_run?: boolean;
};

/** Inline notes stay small enough to send in one call; files can carry a whole book. */
const MAX_INLINE_NOTES = 60;
const MAX_NOTES = 1000;

/** Keys each nested frontmatter entry may carry. Anything else is a typo or a split value. */
const ENTRY_KEYS: Record<string, string[]> = {
  assess: ["fidelity", "evidence", "applicability"],
  "assess entry": ["level", "why", "rationale", "basis", "context"],
  priority: ["impact", "effort", "why", "rationale"],
  "facets entry": ["text", "abstract", "basis"],
  decisions: ["at", "decide", "options", "check", "cite", "stated"],
  "decisions option": ["if", "then"],
  links: ["why", "materiality", "stated"],
  "cites entry": ["unit", "quote", "ref"],
  "uses entry": ["ref"],
};

/**
 * Refuses keys a frontmatter entry doesn't use. A comma inside a `{...}` flow mapping
 * splits the value, and the rest turns into a stray key that would otherwise vanish.
 */
function onlyKeys(
  value: unknown,
  kind: string,
  at: string,
  extra: string[] = [],
) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return;
  const allowed = [...ENTRY_KEYS[kind], ...extra];
  const stray = Object.keys(value).filter((k) => !allowed.includes(k));
  ensure(
    !stray.length,
    "VALIDATION_FAILED",
    `${at} has ${stray.length === 1 ? "an unknown key" : "unknown keys"} ${stray.map((k) => JSON.stringify(k)).join(", ")}. If that's the rest of a value cut at a comma, write the mapping one key per line or quote the value; otherwise use ${allowed.join(", ")}.`,
    { stray },
  );
}

type NoteSource = { source: string; file: string | null };

/** Reads note files, and every `.md` file directly inside a listed folder, in name order. */
async function noteSources(input: NotesRequest): Promise<NoteSource[]> {
  const inline = input.notes ?? [];
  ensure(
    Array.isArray(inline) && (inline.length || input.paths?.length),
    "VALIDATION_FAILED",
    "Supply notes (an array of Markdown notes) or paths (note files or folders of them)",
  );
  ensure(
    inline.length <= MAX_INLINE_NOTES,
    "VALIDATION_FAILED",
    `Send at most ${MAX_INLINE_NOTES} notes inline per call; write more as files and pass their paths`,
  );
  const sources: NoteSource[] = inline.map((source) => ({
    source,
    file: null,
  }));
  for (const given of input.paths ?? []) {
    ensure(
      typeof given === "string" && path.isAbsolute(given),
      "VALIDATION_FAILED",
      "Each path is an absolute path to a note file or a folder of note files",
      { path: given },
    );
    const stat = await fs.stat(given).catch(() => null);
    ensure(stat, "VALIDATION_FAILED", `No note file or folder at ${given}`);
    const files = stat.isDirectory()
      ? (await fs.readdir(given))
          .filter((name) => name.toLowerCase().endsWith(".md"))
          .sort()
          .map((name) => path.join(given, name))
      : [given];
    for (const file of files) {
      ensure(
        file.toLowerCase().endsWith(".md"),
        "VALIDATION_FAILED",
        `A note file ends in .md: ${file}`,
      );
      sources.push({ source: await fs.readFile(file, "utf8"), file });
    }
  }
  ensure(
    sources.length,
    "VALIDATION_FAILED",
    "The paths given hold no .md note files",
  );
  ensure(
    sources.length <= MAX_NOTES,
    "VALIDATION_FAILED",
    `Stage at most ${MAX_NOTES} notes per call`,
  );
  return sources;
}

type NoteFailure = {
  note: number;
  file: string | null;
  slug: string | null;
  code: string;
  message: string;
  details?: unknown;
};

/** One refusal that lists every failing note, so a single round of fixes clears the batch. */
function refuse(failures: NoteFailure[]): never {
  const [first] = failures;
  const quotesOnly = failures.every((f) => f.code === "QUOTE_NOT_FOUND");
  throw new KBError(
    quotesOnly ? "QUOTE_NOT_FOUND" : "VALIDATION_FAILED",
    failures.length === 1
      ? first.message
      : `${first.message} (and ${failures.length - 1} more problem(s) in this batch; every one is listed in details.errors). Nothing was staged.`,
    {
      errors: failures,
      ...(quotesOnly ? { problems: failures.map((f) => f.message) } : {}),
    },
  );
}

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
      onlyKeys(raw, "facets entry", at);
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
    // Staging reads and rewrites the job's slug map, so writers take turns. Without this,
    // two readers staging at once could each save a map missing the other's slugs.
    return input.dry_run
      ? this.compose(input)
      : withLock(this.store.root, "notes", () => this.compose(input), 120000);
  }

  private async compose(input: NotesRequest) {
    const drafts = await noteSources(input);
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
    // A replacement drops the records its proposal staged before, so it must not reuse them,
    // passages included: they leave the staged batch when the replacement lands.
    const replacing = new Set<string>();
    if (input.replace === true && input.proposal_id) {
      const previous = await readJson<any>(
        path.join(dir, "proposals", hash(input.proposal_id) + ".json"),
      ).catch(() => null);
      for (const r of previous?.records ?? []) replacing.add(r.id);
    }
    for (const [name, target] of Object.entries(slugs))
      if (replacing.has(target.id)) delete slugs[name];
    const known = new Map<string, RecordData>();
    for (const r of current.values()) known.set(r.id, r);
    for (const r of staged.records)
      if (!replacing.has(r.id)) known.set(r.id, r);

    // Every failing note is collected, so one refusal lists everything to fix.
    const failures: NoteFailure[] = [];
    const label = (index: number, slug: string | null, file: string | null) =>
      (file ? path.basename(file) : `Note ${index}`) +
      (slug ? ` (${slug})` : "");
    const fail = (
      index: number,
      file: string | null,
      slug: string | null,
      error: any,
      prefix = "",
    ) => {
      const yaml = /^YAML/.test(error?.name ?? "");
      if (!(error instanceof KBError) && !yaml) throw error;
      failures.push({
        note: index,
        file,
        slug,
        code: error.code ?? "YAML_PARSE_ERROR",
        message: prefix + error.message,
        ...(error instanceof KBError && error.details
          ? { details: error.details }
          : {}),
      });
    };
    const parsed: (ReturnType<typeof splitNote> & {
      slug: string;
      index: number;
      file: string | null;
      where: string;
    })[] = [];
    drafts.forEach(({ source, file }, i) => {
      try {
        const note = splitNote(source);
        const slug = text(note.front.id);
        ensure(
          SLUG.test(slug),
          "VALIDATION_FAILED",
          `${label(i + 1, null, file)}: id must be a short lowercase slug like "holm-step-down"`,
          { id: note.front.id },
        );
        parsed.push({
          ...note,
          slug,
          index: i + 1,
          file,
          where: label(i + 1, slug, file),
        });
      } catch (error: any) {
        const at = label(i + 1, null, file);
        fail(
          i + 1,
          file,
          null,
          error,
          String(error?.message ?? "").startsWith(at) ? "" : `${at}: `,
        );
      }
    });
    const batch = new Set<string>();
    for (const n of parsed) {
      if (batch.has(n.slug))
        failures.push({
          note: n.index,
          file: n.file,
          slug: n.slug,
          code: "VALIDATION_FAILED",
          message: `${n.where}: duplicate note id ${n.slug}`,
        });
      // Staging a slug the job already has would add a second record beside the first,
      // and both would publish. Changing a staged note is a replacement of its proposal.
      else if (slugs[n.slug])
        failures.push({
          note: n.index,
          file: n.file,
          slug: n.slug,
          code: "VALIDATION_FAILED",
          message: `${n.where}: ${n.slug} is already staged in this job. To change staged notes, stage their batch again with the same proposal_id and replace: true. To add a different note, give it a new id.`,
        });
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
        `${where}: unknown note "${raw}". Use a slug from this job, or an id from kb_recall. If it's a slug reserved in a book map, stage the notes that define it first, or in the same call.`,
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
    const thinHigh: {
      slug: string;
      where: string;
      basis: string;
      note: (typeof parsed)[number];
    }[] = [];
    for (const n of parsed) {
      const where = n.where;
      const f = n.front;
      const quoteProblem = (message: string) =>
        failures.push({
          note: n.index,
          file: n.file,
          slug: n.slug,
          code: "QUOTE_NOT_FOUND",
          message,
        });
      try {
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
        for (const [i, cite] of list(f.cites).entries()) {
          onlyKeys(cite, "cites entry", `${where}: cites[${i}]`);
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
                quoteProblem(
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
              else quoteProblem(`${where}: quote not found in ${key(target)}`);
            }
          }
        }
        const uses = list(f.uses).map((u, i) => {
          onlyKeys(u, "uses entry", `${where}: uses[${i}]`);
          return resolve(u, where);
        });
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
          onlyKeys(f.priority, "priority", `${where}: priority`);
          const priority = f.priority ?? {};
          payload.priority = {
            impact:
              text(priority.impact) || basePayload.priority?.impact || "medium",
            effort:
              text(priority.effort) ||
              basePayload.priority?.effort ||
              "unknown",
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
        onlyKeys(f.assess, "assess", `${where}: assess`);
        const assessments = f.assess
          ? Object.fromEntries(
              ["fidelity", "evidence", "applicability"].map((dimension) => {
                const a = f.assess?.[dimension];
                onlyKeys(a, "assess entry", `${where}: assess.${dimension}`);
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
                    thinHigh.push({ slug: n.slug, where, basis, note: n });
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
            onlyKeys(raw, "decisions", at);
            for (const [j, option] of list(raw?.options).entries())
              onlyKeys(option, "decisions option", `${at}.options[${j}]`);
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
          if (decisionPoints.length)
            extensions.decision_points = decisionPoints;
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
          field === undefined
            ? inherited
            : list(field).map(text).filter(Boolean);
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
        for (const [i, link] of list(f.links).entries()) {
          const named = Object.keys(link ?? {}).filter((k) =>
            PREDICATES.includes(k),
          );
          ensure(
            named.length === 1,
            "VALIDATION_FAILED",
            `${where}: links[${i}] names exactly one of ${PREDICATES.join(", ")}`,
          );
          const predicate = named[0];
          onlyKeys(link, "links", `${where}: links[${i}]`, [predicate]);
          const object = resolve(link[predicate], where);
          if (predicate === "exemplifies") {
            const local =
              "local_ref" in object
                ? parsed.find((p) => p.slug === object.local_ref)
                : undefined;
            const target = local ? undefined : known.get((object as Ref).id);
            const targetType = local
              ? text(local.front.type)
              : target?.record_type;
            const targetForm = local
              ? text(local.front.form)
              : (target?.payload as any)?.form;
            ensure(
              targetType === "concept" ||
                (targetType === "knowledge" &&
                  ["mechanism", "procedure"].includes(targetForm)),
              "VALIDATION_FAILED",
              `${where}: links[${i}] exemplifies needs a concept, mechanism or procedure as its target`,
            );
            ensure(
              type === "learning" || epistemic === "illustration",
              "VALIDATION_FAILED",
              `${where}: links[${i}] exemplifies runs from an attributable case: this note is a ${type} note, so it must be a learning note or marked epistemic: illustration. For a source's own claim, use supports or explains.`,
            );
          }
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
            title:
              `${title} ${predicate.replace("_", " ")} ${objectName}`.slice(
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
      } catch (error) {
        fail(n.index, n.file, n.slug, error);
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
    for (const { slug, where, basis, note } of thinHigh) {
      const item = bySlug.get(slug);
      if (!item) continue;
      const families = new Set((item.source_refs as Ref[]).map(familyOf)).size;
      if (families < 2)
        failures.push({
          note: note.index,
          file: note.file,
          slug,
          code: "VALIDATION_FAILED",
          message: `${where}: evidence high from a ${basis.replace(/_/g, " ")} needs at least two independent source families, and this note rests on ${families}. Lower the level or cite the other evidence.`,
        });
    }
    if (failures.length) refuse(failures.sort((a, b) => a.note - b.note));

    const items_ = [...passageItems, ...items, ...relationships];
    const proposal = {
      schema_version: VERSION,
      proposal_id:
        input.proposal_id ??
        `notes-${hash(job.job_id + JSON.stringify(drafts.map((d) => d.source))).slice(0, 20)}`,
      job_id: job.job_id,
      base_release: job.base_release,
      scope_policy: job.scope_policy,
      items: items_,
    } as unknown as ProposalData;
    // Schema errors name an item by its position; say which note (and file) it came from.
    const located = async <T>(work: () => Promise<T>) => {
      try {
        return await work();
      } catch (error: any) {
        if (!(error instanceof KBError) || !Array.isArray(error.details))
          throw error;
        const owner = (index: number) => {
          const localId = String(items_[index]?.local_id ?? "");
          const slug = localId.split("--")[0];
          const note = parsed.find((n) => n.slug === slug);
          return note ? { note: note.where, file: note.file } : {};
        };
        throw new KBError(
          error.code,
          error.message,
          error.details.map((d: any) => {
            const match = /^\/items\/(\d+)/.exec(d?.instancePath ?? "");
            return match ? { ...owner(Number(match[1])), ...d } : d;
          }),
          error.resumable,
        );
      }
    };

    if (input.dry_run) {
      const compiled = await located(() =>
        this.store.compile(proposal, staged.records),
      );
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
        note: "Nothing was staged. A normal call runs these same checks and stages nothing if any fail, so a dry run is only needed to preview the records.",
      };
    }
    const receipt: any = await located(() =>
      this.jobs.propose(proposal, input.replace === true),
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
        ...(n.file ? { file: n.file } : {}),
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

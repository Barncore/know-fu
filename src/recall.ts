import { Store } from "./store.js";
import { Projections } from "./projections.js";
import { LibraryIndex, functionText } from "./library-index.js";
import { ideaBlock } from "./ideas.js";
import { gapLine, gapSignals } from "./gaps.js";
import {
  ensure,
  key,
  ref,
  readJson,
  uid,
  atomic,
  json,
  hash,
  ENGINE_VERSION,
} from "./core.js";
import type { RecordData, Ref, Scope } from "./core.js";
import { summary } from "./navigation.js";

export type RecallPurpose =
  | "explain"
  | "teach"
  | "apply"
  | "compare"
  | "invent"
  | "synthesize"
  | "investigate";

export type RecallRequest = {
  query: string;
  purpose?: RecallPurpose;
  budget_tokens?: number;
  depth?: "brief" | "standard" | "deep";
  domains?: string[];
  scope?: Scope;
  release_id?: string;
  /** true forces semantic search, false disables it; omitted runs it only when keywords look weak. */
  semantic?: boolean;
  graph?: boolean;
  seen?: (Ref | string)[];
  context?: Record<string, { value: unknown; unit?: string | null }>;
  /** Invent only: show accounts from other topics. Off by default; with domains set and this off, invent stays inside them. */
  cross_domain?: boolean;
};

/** Default reading budgets: enough for a real answer, far below loading every connected body. */
const DEFAULT_BUDGET: Record<RecallPurpose, number> = {
  explain: 7000,
  teach: 9000,
  apply: 7000,
  compare: 8000,
  invent: 9000,
  synthesize: 12000,
  investigate: 6000,
};

/** Forms that answer each purpose most directly; a soft ranking prior, never a filter. */
const PURPOSE_FORMS: Record<RecallPurpose, string[]> = {
  explain: ["mechanism", "explanation", "synthesis", "concept"],
  teach: [
    "primer",
    "teaching_sequence",
    "worked_example",
    "near_miss",
    "lesson",
    "concept",
  ],
  apply: ["procedure", "application", "worked_example", "near_miss"],
  compare: ["synthesis", "judgment", "explanation"],
  invent: ["mechanism", "question", "synthesis"],
  synthesize: ["primer", "synthesis", "teaching_sequence", "judgment"],
  investigate: ["question", "judgment"],
};

/** A filed answer is real but second-hand: it ranks just below the accounts it cites. */
export const FILED_ANSWER_WEIGHT = 0.9;

export const estimateTokens = (text: string) => Math.ceil(text.length / 4);

type Ranked = { id: string; score: number };
type Candidate = { record: RecordData; score: number; channels: string[] };
type Packed = {
  record: RecordData;
  role: "account" | "caveat" | "prerequisite" | "evidence";
  tokens: number;
  channels: string[];
  reason: string;
};

export function form(record: RecordData) {
  return (record.payload as any).form ?? record.record_type;
}

export function isFiledAnswer(record: RecordData) {
  return record.provenance.method === "filed_answer";
}

const DIMENSIONS = ["evidence", "fidelity", "applicability"] as const;
const BASIS_WORDS: Record<string, string> = {
  review_of_studies: "a review of studies",
  controlled_comparison: "a controlled comparison",
  measured_observation: "measured observation",
  worked_case: "a worked case",
  reasoned_argument: "a reasoned argument",
  bare_assertion: "a bare assertion",
  our_inference: "our inference",
};

/** Assessments someone actually made, evidence first. Unassessed dimensions are left out. */
export function assessed(record: RecordData) {
  return DIMENSIONS.flatMap((dimension) => {
    const a = record.assessments?.[dimension];
    return a && a.level !== "not_assessed"
      ? [
          {
            dimension,
            level: a.level,
            rationale: a.rationale,
            context: a.context,
            basis: BASIS_WORDS[(a as { basis?: string }).basis ?? ""],
          },
        ]
      : [];
  });
}

/**
 * One side of a conflict in a phrase, such as "evidence moderate from a controlled comparison,
 * fidelity high; 2 independent sources". Never used for ranking.
 */
export function profile(index: LibraryIndex, record: RecordData) {
  const list = assessed(record);
  const count = supportTally(index, record).sources.length;
  const levels = list.length
    ? list
        .map(
          (a) =>
            `${a.dimension} ${a.level}${a.basis ? ` from ${a.basis}` : ""}`,
        )
        .join(", ")
    : "not assessed";
  return count
    ? `${levels}; ${count} independent source${count > 1 ? "s" : ""}`
    : levels;
}

export const SIDE_BY_SIDE_NOTE =
  "Assessment levels are recorded judgments with reasons. Weigh the reasons; a level alone never settles a conflict.";

function shortSource(record: RecordData | undefined) {
  if (!record) return "unknown source";
  return record.title.replace(
    /\.(pdf|epub|md|txt|html?|mp4|mkv|mov|webm|mp3|wav|m4a|vtt|srt)$/i,
    "",
  );
}

function pageLabel(passage: RecordData) {
  const l = (passage.payload as any).locator;
  if (!l) return passage.title;
  if (l.kind === "pages")
    return l.start === l.end ? `p.${l.start}` : `pp.${l.start}-${l.end}`;
  if (l.kind === "lines") return `lines ${l.start}-${l.end}`;
  return l.label ?? l.kind;
}

/** Collapse page labels into ranges: pp.5-8, p.12. */
function compactPages(labels: string[]) {
  const pages = [
    ...new Set(
      labels.flatMap((l) => {
        const range = /^pp?\.(\d+)(?:-(\d+))?$/.exec(l);
        if (!range) return [];
        const start = Number(range[1]),
          end = Number(range[2] ?? range[1]);
        return Array.from(
          { length: Math.min(end - start + 1, 500) },
          (_, i) => start + i,
        );
      }),
    ),
  ].sort((a, b) => a - b);
  const other = labels.filter((l) => !/^pp?\.\d+(?:-\d+)?$/.test(l));
  const ranges: string[] = [];
  for (let i = 0; i < pages.length;) {
    let j = i;
    while (j + 1 < pages.length && pages[j + 1] === pages[j] + 1) j++;
    ranges.push(
      pages[i] === pages[j] ? `p.${pages[i]}` : `pp.${pages[i]}-${pages[j]}`,
    );
    i = j + 1;
  }
  return [...new Set([...ranges, ...other])].join(", ");
}

/** The invent slate as briefing lines; headers and the first entries are always shown. */
function slateLines(
  index: LibraryIndex,
  slate: {
    ideas: RecordData[];
    bridges: string[];
    hidden: number;
    looseEnds: RecordData[];
  },
) {
  const lines: { line: string; always: boolean }[] = [];
  if (slate.ideas.length) {
    lines.push({
      line: "## Ideas on file (candidates, not evidence; failed ones say why)",
      always: true,
    });
    slate.ideas.forEach((idea, position) =>
      lines.push({ line: ideaBlock(index, idea, true), always: position < 2 }),
    );
  }
  if (slate.bridges.length) {
    lines.push({
      line: "## From other topics: possible bridges",
      always: true,
    });
    slate.bridges.forEach((line, position) =>
      lines.push({ line, always: position < 2 }),
    );
  } else if (slate.hidden)
    lines.push({
      line: `${slate.hidden} account(s) in other topics connect to these by links or by what they do. Call again with cross_domain:true to see them.`,
      always: true,
    });
  if (slate.looseEnds.length) {
    lines.push({
      line: "## Loose ends: matched but barely connected",
      always: true,
    });
    for (const r of slate.looseEnds)
      lines.push({
        line: `- ${key(r)} · ${r.title}${summary(r) ? `: ${clip(summary(r)!, 140)}` : ""}`,
        always: false,
      });
  }
  return lines;
}

/**
 * A procedure's decision points as a small tree: when each choice comes up, what is
 * decided, each branch, how to check the result, and whether the source states it.
 */
export function decisionTree(index: LibraryIndex, points: any[]) {
  const lines = ["Decision points (where this procedure branches):"];
  points.forEach((point, i) => {
    lines.push(`${i + 1}. ${point.cue} → ${point.decision}`);
    point.options.forEach((option: any, j: number) =>
      lines.push(
        `   ${j === point.options.length - 1 ? "└" : "├"} ${option.when} → ${option.then}`,
      ),
    );
    const pages = point.evidence_refs
      .map((e: Ref) => index.visible.get(e.id))
      .filter(Boolean)
      .map((passage: RecordData) => pageLabel(passage));
    const tail = [
      point.check ? `check: ${point.check}` : null,
      pages.length ? compactPages(pages) : null,
      point.basis === "inferred"
        ? "inferred: the source doesn't state this choice"
        : null,
    ].filter(Boolean);
    if (tail.length) lines.push(`   ${tail.join(" · ")}`);
  });
  return lines.join("\n");
}

export function clip(text: string, n: number) {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > n ? flat.slice(0, n - 1) + "…" : flat;
}

/**
 * Deterministic weight of evidence: the distinct sources (by evidence family) behind an
 * account, with page labels, and whether an active challenge targets it. Repeated pages
 * from one source count once; a summary or filed answer is never a second source.
 */
export function supportTally(index: LibraryIndex, r: RecordData) {
  const bySource = new Map<string, string[]>();
  for (const s of r.provenance.source_refs)
    bySource.set(s.id, bySource.get(s.id) ?? []);
  for (const input of r.provenance.input_refs) {
    const passage = index.visible.get(input.id);
    if (passage?.record_type !== "passage") continue;
    const sourceId = (passage.payload as any).source_ref.id;
    bySource.set(sourceId, [
      ...(bySource.get(sourceId) ?? []),
      pageLabel(passage),
    ]);
  }
  const families = new Map<string, string[]>();
  for (const [sourceId, pages] of bySource) {
    const source = index.visible.get(sourceId);
    const family = (source?.payload as any)?.evidence_family ?? sourceId;
    const label = `${shortSource(source)}${pages.length ? " " + compactPages(pages) : ""}`;
    families.set(family, [...(families.get(family) ?? []), label]);
  }
  const challenged = (index.incoming.get(r.id) ?? []).some(
    (l) => l.predicate === "challenges",
  );
  return {
    sources: [...families.values()].map((labels) => labels.join(" + ")),
    challenged,
  };
}

export function scopeText(r: RecordData) {
  if (!r.scope.conditions.length && !r.scope.exclusions.length) return "";
  return `Holds when: ${r.scope.conditions.join("; ") || "unstated"}${r.scope.exclusions.length ? ` · Not for: ${r.scope.exclusions.join("; ")}` : ""}`;
}

/**
 * Budgeted, fused recall. One call returns the explanations that answer the question,
 * the caveats that must travel with them, and a map of what else exists, instead of
 * every transitively connected body.
 */
export class Recall {
  constructor(
    readonly store: Store,
    readonly projections = new Projections(store),
  ) {}

  async recall(input: RecallRequest) {
    ensure(
      typeof input.query === "string" && input.query.trim(),
      "VALIDATION_FAILED",
      "A nonempty recall query is required",
    );
    const purpose = input.purpose ?? "explain";
    ensure(
      Object.hasOwn(DEFAULT_BUDGET, purpose),
      "VALIDATION_FAILED",
      "Unknown recall purpose",
    );
    ensure(
      input.budget_tokens === undefined ||
        (Number.isInteger(input.budget_tokens) &&
          input.budget_tokens >= 500 &&
          input.budget_tokens <= 60000),
      "VALIDATION_FAILED",
      "budget_tokens must be an integer from 500 to 60000",
    );
    ensure(
      input.depth === undefined ||
        ["brief", "standard", "deep"].includes(input.depth),
      "VALIDATION_FAILED",
      "depth must be brief, standard or deep",
    );
    return this.store.withReadSession(() => this.run({ ...input, purpose }));
  }

  /** Ranked candidates from every channel, fused by reciprocal rank. */
  async rank(
    index: LibraryIndex,
    input: RecallRequest & { purpose: RecallPurpose },
  ) {
    const depth = input.depth ?? "standard";
    const warnings: string[] = [];
    const channels: Record<string, string> = {};
    const searchable = (id: string) => {
      const r = index.visible.get(id);
      return (
        !!r &&
        index.usableIds.has(id) &&
        (index.isAccount(r) || r.record_type === "passage")
      );
    };
    const lists = new Map<string, Ranked[]>();

    // Lexical BM25 over titles, summaries, bodies and passage text.
    const lexical = index.lexical.search(input.query, 60, searchable);
    lists.set("lexical", lexical);
    channels.lexical = `ok (${lexical.length})`;

    // Semantic search through the QMD projection: forced, disabled, or automatic when keywords look weak.
    const coverage = index.lexical.coverage(input.query);
    const lexicalAccounts = lexical.filter((h) =>
      index.isAccount(index.visible.get(h.id)!),
    ).length;
    const weak = coverage < 0.7 || lexicalAccounts < 5;
    if (input.semantic === false) channels.semantic = "off (requested)";
    else if (input.semantic !== true && !weak)
      channels.semantic = `skipped (keywords matched ${Math.round(coverage * 100)}% of query terms)`;
    else {
      const receipt = await this.projections.receipt();
      const semantic = receipt?.search?.semantic === true;
      if (!(await this.projections.fresh(index.release, "search"))) {
        channels.semantic =
          "unavailable (search projection not ready for this release)";
        if (weak)
          warnings.push(
            "Keyword match is weak and semantic search is unavailable; reword the query or reindex.",
          );
      } else
        try {
          const hits = await this.projections.search(
            input.query,
            index.scope.read_modules,
            semantic,
            60,
            false,
          );
          const mapping = await readJson<Record<string, any>>(
            this.store.p(`views/${index.release}/search-map.json`),
          );
          const seen = new Set<string>();
          const list: Ranked[] = [];
          for (const hit of hits.items) {
            const file = String(hit.file ?? "")
              .replace(/^qmd:\/\//, "")
              .split(/[?#]/, 1)[0];
            const entry = mapping[file];
            const r = entry && index.visible.get(entry.record_ref.id);
            if (
              !r ||
              key(r) !== key(entry.record_ref) ||
              !searchable(r.id) ||
              seen.has(r.id)
            )
              continue;
            seen.add(r.id);
            list.push({ id: r.id, score: Number(hit.score ?? 0) });
          }
          lists.set("semantic", list);
          channels.semantic = `${semantic ? "ok" : "keyword index only"} (${list.length})`;
        } catch (error: any) {
          channels.semantic = "failed: " + error.message;
        }
    }

    const fuse = (weights: Record<string, number>) => {
      const fused = new Map<string, { score: number; channels: Set<string> }>();
      for (const [channel, list] of lists)
        list.forEach((hit, rank) => {
          const entry = fused.get(hit.id) ?? {
            score: 0,
            channels: new Set<string>(),
          };
          entry.score += (weights[channel] ?? 1) / (60 + rank + 1);
          entry.channels.add(channel);
          fused.set(hit.id, entry);
        });
      return fused;
    };
    const weights = { lexical: 1, semantic: 1, graph: 0.8 };
    let fused = fuse(weights);

    // Spreading activation from the strongest text matches over typed links.
    if (input.graph === false) channels.graph = "off (requested)";
    else if (!index.adjacency.size) channels.graph = "no links in scope";
    else {
      const seeds = new Map(
        [...fused]
          .sort((a, b) => b[1].score - a[1].score)
          .slice(0, 12)
          .map(([id, v]) => [id, v.score]),
      );
      const activation = index.spread(seeds);
      const graph = [...activation]
        .filter(([id]) => searchable(id))
        .sort((a, b) => b[1] - a[1])
        .slice(0, 60)
        .map(([id, score]) => ({ id, score }));
      lists.set("graph", graph);
      channels.graph = `ok (${graph.length})`;
      fused = fuse(weights);
    }

    // Priors: prefer explanations to raw evidence, and forms that serve the purpose.
    const domainBoost = new Set(input.domains ?? []);
    // Inventing inside named topics keeps other fields out unless cross_domain asks for them.
    const restrict =
      input.purpose === "invent" &&
      domainBoost.size > 0 &&
      input.cross_domain !== true;
    const candidates: Candidate[] = [];
    for (const [id, entry] of fused) {
      const r = index.visible.get(id)!;
      if (restrict && !r.scope.domains.some((d) => domainBoost.has(d)))
        continue;
      let score = entry.score;
      if (r.record_type === "passage") score *= depth === "deep" ? 0.8 : 0.45;
      if (PURPOSE_FORMS[input.purpose].includes(form(r))) score *= 1.25;
      if (domainBoost.size && r.scope.domains.some((d) => domainBoost.has(d)))
        score *= 1.15;
      if (index.pending.has(r.id)) score *= 0.9;
      if (isFiledAnswer(r)) score *= FILED_ANSWER_WEIGHT;
      candidates.push({ record: r, score, channels: [...entry.channels] });
    }
    candidates.sort(
      (a, b) => b.score - a.score || key(a.record).localeCompare(key(b.record)),
    );
    return { candidates, channels, warnings };
  }

  private async run(input: RecallRequest & { purpose: RecallPurpose }) {
    const started = performance.now();
    const index = await LibraryIndex.open(this.store, input);
    const purpose = input.purpose;
    const depth = input.depth ?? "standard";
    const budget =
      input.budget_tokens ??
      Math.round(
        DEFAULT_BUDGET[purpose] *
          (depth === "brief" ? 0.5 : depth === "deep" ? 2 : 1),
      );
    const { candidates, channels, warnings } = await this.rank(index, input);
    if (index.visible.size < index.records.size)
      warnings.push(
        "Some library material is outside this scope and was not considered.",
      );

    // Pack in rank order. Caveats travel with what they qualify; whatever does not fit is skipped, not cut.
    // A held id@revision suppresses only that revision, so a newer one is still sent; a bare id suppresses any.
    const heldIds = new Set<string>(),
      heldKeys = new Set<string>();
    for (const s of input.seen ?? []) {
      if (typeof s !== "string") heldKeys.add(key(s));
      else if (s.includes("@")) heldKeys.add(s.trim());
      else heldIds.add(s.trim());
    }
    const seen = {
      has: (id: string) => {
        const r = index.visible.get(id);
        return heldIds.has(id) || (!!r && heldKeys.has(key(r)));
      },
      size: heldIds.size + heldKeys.size,
    };
    const packed = new Map<string, Packed>();
    let used = 0;
    const reserve = Math.max(Math.round(budget * 0.05), 60);
    // Invent makes room for its slate (ideas on file, bridges, loose ends) up to a fifth of the budget.
    let slate = 0;
    // Caveats may use the budget beyond the reserve, but leave room for the header and the mandatory lines.
    const caveatLimit = budget - Math.min(150, Math.round(budget * 0.3));
    // Cost an account by the block it will actually render as: prose, sources, links and flags.
    const cost = (r: RecordData, role: Packed["role"]) =>
      estimateTokens(
        this.block(
          index,
          { record: r, role, tokens: 0, channels: [], reason: "" },
          packed,
          new Map(),
          input.context,
          undefined,
          purpose,
        ),
      ) + 2;
    const tryPack = (
      r: RecordData,
      role: Packed["role"],
      reason: string,
      via: string[],
      limit: number,
    ) => {
      if (packed.has(r.id) || seen.has(r.id)) return true;
      const tokens = cost(r, role);
      if (used + tokens > limit) return false;
      packed.set(r.id, { record: r, role, tokens, channels: via, reason });
      used += tokens;
      return true;
    };
    const caveatsOf = (r: RecordData) => ({
      links: (index.incoming.get(r.id) ?? []).filter((l) =>
        ["qualifies", "challenges"].includes(l.predicate),
      ),
      judgments: (index.judgmentsByIssue.get(r.id) ?? []).filter(
        (j) => index.live.get(j.id)?.revision === j.revision,
      ),
    });
    const accounts = candidates.filter(
      (c) => c.record.record_type !== "passage",
    );
    const evidence = candidates.filter(
      (c) => c.record.record_type === "passage",
    );
    const primary = accounts.length ? accounts : evidence;
    const packMatches = () =>
      primary.forEach((c, position) => {
        if (used >= budget - reserve - slate) return;
        // The best match is always delivered whole, even when it alone exceeds the budget.
        const limit =
          position === 0 ? Number.MAX_SAFE_INTEGER : budget - reserve - slate;
        const role =
          c.record.record_type === "passage" ? "evidence" : "account";
        if (!tryPack(c.record, role, "match", c.channels, limit)) return;
        const { links, judgments } = caveatsOf(c.record);
        for (const link of links) {
          const subject = index.visible.get(link.subject);
          // A qualifying passage is the qualification itself; carry it like an account.
          if (
            subject &&
            (index.isAccount(subject) || subject.record_type === "passage")
          )
            tryPack(
              subject,
              "caveat",
              `${link.predicate} ${c.record.title}`,
              ["context"],
              caveatLimit,
            );
        }
        for (const judgment of judgments)
          tryPack(
            judgment,
            "caveat",
            `judgment on ${c.record.title}`,
            ["context"],
            caveatLimit,
          );
        if (purpose === "teach" || purpose === "explain")
          for (const link of index.outgoing.get(c.record.id) ?? [])
            if (link.predicate === "depends_on") {
              const prerequisite = index.visible.get(link.object);
              if (prerequisite && index.isAccount(prerequisite))
                tryPack(
                  prerequisite,
                  "prerequisite",
                  `prerequisite of ${c.record.title}`,
                  ["context"],
                  budget - reserve,
                );
            }
      });
    packMatches();
    // The slate depends on what was packed, so measure it, then repack once leaving it room.
    if (purpose === "invent") {
      const draft = slateLines(
        index,
        this.inventSlate(index, input, packed, candidates, seen),
      );
      const need = Math.min(
        Math.round(budget * 0.2),
        draft.reduce((sum, l) => sum + estimateTokens(l.line) + 1, 0),
      );
      if (need && used > budget - reserve - need) {
        packed.clear();
        used = 0;
        slate = need;
        packMatches();
      }
    }
    if (depth === "deep" && accounts.length)
      for (const c of evidence) {
        if (used >= budget - reserve) break;
        if ((index.citedBy.get(c.record.id) ?? []).some((id) => packed.has(id)))
          tryPack(
            c.record,
            "evidence",
            "cited by a loaded account",
            c.channels,
            budget - reserve,
          );
      }

    // Guards come from the resolver progressive reading uses: the exact premises of what was
    // loaded, their boundaries, qualifications and current judgments, including ones published
    // after a pinned release. They are independent of rank, graph expansion and budget: each is
    // packed when it fits and named under "Caveats not loaded" when it does not.
    const seeds = [...packed.values()]
      .filter((p) => p.reason === "match")
      .map((p) => p.record);
    const guardLines = new Map<string, string>();
    if (seeds.length) {
      const view = await index.guards();
      const context = await view.materialContext(seeds);
      // A premise matters here when it adds a boundary the loaded accounts don't already
      // show: a structured condition, a validity limit, pending reassessment, or a
      // condition or exclusion none of them states.
      const shown = new Set(
        [...packed.values()].flatMap((p) => [
          ...p.record.scope.conditions,
          ...p.record.scope.exclusions,
        ]),
      );
      const addsBoundary = (r: RecordData) =>
        !!r.scope.condition_expression ||
        !!r.scope.valid_from ||
        !!r.scope.valid_until ||
        index.pending.has(r.id) ||
        [...r.scope.conditions, ...r.scope.exclusions].some(
          (b) => !shown.has(b),
        );
      for (const w of context.warnings)
        if (
          !w.startsWith("Some material is inaccessible") &&
          !warnings.includes(w)
        )
          warnings.push(w);
      const boundaryOf = (record: RecordData) =>
        [
          scopeText(record),
          record.scope.condition_expression &&
          index.applicability(record, input.context) !== "true"
            ? `applicability ${index.applicability(record, input.context)} here`
            : null,
          index.pending.has(record.id) ? "pending reassessment" : null,
        ]
          .filter(Boolean)
          .join("; ");
      // Substantive guards first: qualifications, challenges, judgments, prerequisites, and
      // premises with a structured condition, validity limit or pending reassessment. These
      // are packed when they fit. A premise that only adds a plain boundary costs one line.
      const plainBoundaries = new Map<string, RecordData[]>();
      const substantive = context.required.filter(({ record, reason }) => {
        if (seen.has(record.id) || packed.has(record.id)) return false;
        if (record.record_type === "source") return false;
        if (!reason.startsWith("Supporting premise")) return true;
        if (!addsBoundary(record)) return false;
        if (
          record.scope.condition_expression ||
          record.scope.valid_from ||
          record.scope.valid_until ||
          index.pending.has(record.id)
        )
          return true;
        const boundary = boundaryOf(record);
        plainBoundaries.set(boundary, [
          ...(plainBoundaries.get(boundary) ?? []),
          record,
        ]);
        return false;
      });
      for (const { record, reason } of substantive) {
        const premise = reason.startsWith("Supporting premise");
        const pinned = index.visible.get(record.id);
        const packable =
          index.usableIds.has(record.id) &&
          pinned?.revision === record.revision;
        if (
          packable &&
          tryPack(
            record,
            "caveat",
            premise ? "premise with its own boundary" : clip(reason, 140),
            ["guard"],
            caveatLimit,
          )
        )
          continue;
        const later = !pinned
          ? ` (published after release ${index.release})`
          : "";
        guardLines.set(
          record.id,
          premise
            ? `${record.title} (${key(record)})${later} is a premise of what was loaded, with its own boundary: ${boundaryOf(record) || "inspect it before relying on the account"}`
            : `${record.title} (${key(record)})${later}: ${clip(reason, 220)}`,
        );
      }
      // Recheck against everything now loaded: a packed guard may already show the boundary.
      for (const p of packed.values())
        for (const b of [
          ...p.record.scope.conditions,
          ...p.record.scope.exclusions,
        ])
          shown.add(b);
      for (const [boundary, records] of plainBoundaries) {
        const names = records
          .filter((r) => !packed.has(r.id) && addsBoundary(r))
          .map((r) => `${r.title} (${key(r)})`);
        if (names.length)
          guardLines.set(
            records[0].id,
            `${names.join(", ")} ${names.length > 1 ? "are premises" : "is a premise"} of what was loaded, with a boundary the loaded accounts don't show: ${boundary}`,
          );
      }
    }

    // Render: shared scope lines printed once, then each account, then what was left out.
    const loaded = [...packed.values()];
    const scopeCounts = new Map<string, number>();
    for (const p of loaded) {
      const text = scopeText(p.record);
      if (text) scopeCounts.set(text, (scopeCounts.get(text) ?? 0) + 1);
    }
    const sharedScopes = new Map<string, string>();
    for (const [text, count] of scopeCounts)
      if (count > 1) sharedScopes.set(text, `S${sharedScopes.size + 1}`);
    const marks = { sideBySide: false };
    const blocks = loaded.map((p) =>
      this.block(index, p, packed, sharedScopes, input.context, marks, purpose),
    );

    const notLoaded = accounts
      .filter((c) => !packed.has(c.record.id) && !seen.has(c.record.id))
      .slice(0, 10);
    const questions = new Map<string, RecordData>();
    for (const p of loaded)
      for (const id of (
        index.adjacency.get(p.record.id) ?? new Map<string, number>()
      ).keys()) {
        const r = index.visible.get(id);
        if (
          r?.record_type === "question" &&
          !packed.has(id) &&
          (r.payload as any).resolution_status !== "answered"
        )
          questions.set(id, r);
      }
    const unresolvedCaveats: string[] = [];
    for (const p of loaded) {
      const { links, judgments } = caveatsOf(p.record);
      for (const link of links)
        if (!packed.has(link.subject))
          unresolvedCaveats.push(
            `${p.record.title} (${key(p.record)}) is ${link.predicate === "challenges" ? "challenged" : "qualified"} by ${index.visible.get(link.subject)?.title} (${link.subject}): ${link.rationale}`,
          );
      for (const j of judgments)
        if (!packed.has(j.id))
          unresolvedCaveats.push(
            `${p.record.title} (${key(p.record)}) has a ${(j.payload as any).outcome} judgment: ${j.title} (${key(j)})`,
          );
    }
    for (const [id, line] of guardLines)
      if (
        !packed.has(id) &&
        !unresolvedCaveats.some((c) => c.includes(`(${id}`))
      )
        unresolvedCaveats.push(line);
    if (marks.sideBySide) warnings.push(SIDE_BY_SIDE_NOTE);
    const inventing =
      purpose === "invent"
        ? this.inventSlate(index, input, packed, candidates, seen)
        : null;
    const gaps =
      purpose === "investigate"
        ? gapSignals(
            index,
            loaded.map((p) => p.record),
          ).slice(0, 3)
        : [];
    const pending = loaded.filter((p) => index.pending.has(p.record.id)).length;
    if (pending)
      warnings.push(
        `${pending} loaded account(s) await reassessment after newer evidence; treat them as provisional.`,
      );
    if (!loaded.length)
      warnings.push(
        "Nothing in the permitted library matches. Say so instead of presenting memory as library evidence.",
      );
    else if (!accounts.length)
      warnings.push(
        "Only raw source passages matched; no authored explanation covers this yet.",
      );

    const header = [
      `# Recall: ${input.query}`,
      `Purpose ${purpose} · release ${index.release}${index.release !== index.current ? ` (current is ${index.current})` : ""} · loaded ${loaded.length} (${candidates.length} matched) · ~TOKENS of ${budget} tokens`,
      `Channels: ${Object.entries(channels)
        .map(([name, status]) => `${name} ${status}`)
        .join(" · ")}`,
    ];
    if (purpose === "invent")
      header.push(
        `Invent: the matches, then ideas on file, ${input.cross_domain === true ? "bridges into other topics" : "no other topics (cross_domain off)"} and loose ends. Nothing here judges a new idea; its kill test does.`,
      );
    if (purpose === "teach" || purpose === "explain") {
      const top = loaded.find((p) => p.role === "account");
      if (top) {
        const path = index
          .foundations(top.record.id)
          .filter((id) => id !== top.record.id);
        if (path.length)
          header.push(
            `Foundations first: ${path.map((id) => index.visible.get(id)!.title).join(" → ")} → ${top.record.title}`,
          );
      }
    }
    if (sharedScopes.size)
      header.push(
        ...[...sharedScopes].map(
          ([text, label]) =>
            `Scope ${label}: ${text.replace(/^Holds when: /, "holds when ")}`,
        ),
      );
    // Caveats are mandatory; the related-account and question lists are optional and are
    // trimmed to what the budget has left. The reported size is the whole briefing.
    const caveatSection = unresolvedCaveats.length
      ? [
          "## Caveats not loaded (open these before relying on the account)",
          ...unresolvedCaveats.slice(0, 12).map((c) => `- ${c}`),
          ...(unresolvedCaveats.length > 12
            ? [`- …and ${unresolvedCaveats.length - 12} more`]
            : []),
        ]
      : [];
    const closing = [
      ...(seen.size
        ? [`${seen.size} account(s) you already hold were not sent again.`]
        : []),
      'Open more with kb_read {kind:"accounts", record_refs:[{id,revision}]}, or call kb_recall again with seen=[ids you hold] and a narrower query. Cited pages open as passages.',
    ];
    const assemble = (optional: string[], tokens: number) =>
      [
        header.join("\n").replace("~TOKENS", `~${tokens}`),
        ...(warnings.length ? ["> " + warnings.join("\n> ")] : []),
        ...blocks,
        [...caveatSection, ...optional, ...closing].join("\n"),
      ].join("\n\n");
    let room = budget - estimateTokens(assemble([], budget));
    const optional: string[] = [];
    const offer = (line: string, always = false) => {
      const tokens = estimateTokens(line) + 1;
      if (!always && tokens > room) return false;
      optional.push(line);
      room -= tokens;
      return true;
    };
    if (inventing)
      for (const { line, always } of slateLines(index, inventing))
        offer(line, always);
    if (notLoaded.length) {
      offer("## Also relevant, not loaded", true);
      notLoaded.forEach((c, position) => {
        const short = `- ${key(c.record)} · ${c.record.title}`;
        const text = summary(c.record);
        if (!(text && offer(`${short}: ${clip(text, 150)}`)))
          offer(short, position < 3);
      });
    }
    const openQuestions = [...questions.values()].slice(0, 5);
    if (openQuestions.length && room > 20) {
      offer("## Open questions nearby", true);
      for (const q of openQuestions) offer(`- ${key(q)} · ${q.title}`);
    }
    if (gaps.length) {
      offer(
        "## Gaps around these accounts, not yet recorded as questions",
        true,
      );
      gaps.forEach((g, position) => offer(gapLine(g), position === 0));
    }
    let briefing = assemble(optional, budget);
    let delivered = estimateTokens(briefing);
    if (delivered > budget) {
      warnings.push(
        `This briefing is over the ${budget}-token budget: the best match is always delivered whole, and caveats that didn't fit are still listed.`,
      );
      briefing = assemble(optional, budget);
      delivered = estimateTokens(briefing);
    }
    briefing = assemble(optional, delivered);

    const result = {
      interface_version: "recall-1",
      request_id: uid("recall-"),
      release_id: index.release,
      current_release: index.current,
      purpose,
      query: input.query,
      channels,
      budget: {
        requested: budget,
        used: delivered,
        packed: used,
        estimated: true,
      },
      items: loaded.map((p) => ({
        record_ref: ref(p.record),
        role: p.role,
        title: p.record.title,
        tokens: p.tokens,
        channels: p.channels,
        reason: p.reason,
      })),
      not_loaded: notLoaded.map((c) => ({
        record_ref: ref(c.record),
        title: c.record.title,
      })),
      unresolved_caveats: unresolvedCaveats,
      ...(inventing
        ? {
            slate: {
              ideas: inventing.ideas.map(ref),
              bridges: inventing.bridgeRefs,
              loose_ends: inventing.looseEnds.map(ref),
            },
          }
        : {}),
      ...(gaps.length ? { gaps } : {}),
      warnings,
      briefing,
      timings_ms: { total: Math.round(performance.now() - started) },
      engine: ENGINE_VERSION,
    };
    await atomic(
      this.store.p(`retrieval-receipts/${result.request_id}.json`),
      json({
        interface_version: result.interface_version,
        request_id: result.request_id,
        release_id: result.release_id,
        query_hash: hash(input.query),
        record_refs: result.items.map((i) => i.record_ref),
        budget: result.budget,
        channels,
        timings_ms: result.timings_ms,
      }),
    );
    return result;
  }

  /**
   * What invent adds around the matches: ideas already on file (failures included, so
   * they aren't proposed again), accounts in other topics reached by links or matched by
   * what they do, and matched accounts the library has barely connected yet.
   */
  private inventSlate(
    index: LibraryIndex,
    input: RecallRequest,
    packed: Map<string, Packed>,
    candidates: Candidate[],
    held: { has: (id: string) => boolean },
  ) {
    const matches = [...packed.values()]
      .filter((p) => p.reason === "match" && p.record.record_type !== "passage")
      .map((p) => p.record);
    const topic = new Set(
      input.domains?.length
        ? input.domains
        : matches.flatMap((r) => r.scope.domains),
    );
    const inTopic = (r: RecordData) =>
      !topic.size || r.scope.domains.some((d) => topic.has(d));
    const restrict = !!input.domains?.length && input.cross_domain !== true;

    // Ideas: words in common with the question, plus premises among the matches.
    const ideaScore = new Map<string, number>();
    index.ideaLexical
      .search(input.query, 20)
      .forEach((hit, rank) => ideaScore.set(hit.id, 1 / (1 + rank)));
    for (const idea of index.ideas.values()) {
      const shared = idea.provenance.input_refs.filter((x) =>
        packed.has(x.id),
      ).length;
      if (shared)
        ideaScore.set(idea.id, (ideaScore.get(idea.id) ?? 0) + 0.5 * shared);
    }
    const ideas = [...ideaScore]
      .map(([id, score]) => ({ idea: index.ideas.get(id)!, score }))
      .filter((x) => x.idea && (!restrict || inTopic(x.idea)))
      .sort((a, b) => b.score - a.score || a.idea.id.localeCompare(b.idea.id))
      .slice(0, 6)
      .map((x) => x.idea);

    // Bridges: accounts in other topics within four links of the matches, strongest first.
    const prev = new Map<string, { from: string; label: string }>();
    const depth = new Map(matches.map((r) => [r.id, 0]));
    const queue = matches.map((r) => r.id);
    while (queue.length) {
      const id = queue.shift()!;
      if (depth.get(id)! >= 4) continue;
      for (const [next, edge] of index.edges.get(id) ?? new Map()) {
        if (depth.has(next)) continue;
        const record = index.visible.get(next);
        if (!record || record.record_type === "source") continue;
        depth.set(next, depth.get(id)! + 1);
        prev.set(next, { from: id, label: edge.label });
        queue.push(next);
      }
    }
    const activation = index.spread(new Map(matches.map((r) => [r.id, 1])));
    const chain = (id: string) => {
      const steps: string[] = [index.visible.get(id)!.title];
      for (let at = id; prev.has(at); at = prev.get(at)!.from)
        steps.unshift(
          index.visible.get(prev.get(at)!.from)!.title,
          prev.get(at)!.label,
        );
      return steps.join(" → ");
    };
    const outside = (r: RecordData) =>
      index.isAccount(r) && !packed.has(r.id) && !held.has(r.id) && !inTopic(r);
    const linked = [...depth.keys()]
      .map((id) => index.visible.get(id)!)
      .filter(outside)
      .sort(
        (a, b) =>
          (activation.get(b.id) ?? 0) - (activation.get(a.id) ?? 0) ||
          a.id.localeCompare(b.id),
      )
      .slice(0, 4);
    // Function matches: other fields' accounts whose abstract wording matches what the matches do.
    const doing = [input.query, ...matches.map(functionText)].join(" ");
    const byFunction = index.functional
      .search(doing, 12, (id) => {
        const r = index.visible.get(id);
        return !!r && outside(r) && !linked.some((l) => l.id === id);
      })
      .slice(0, 3)
      .map((hit) => index.visible.get(hit.id)!);
    const bridges = [
      ...linked.map(
        (r) =>
          `- ${key(r)} · ${r.title}${functionText(r) ? `: does ${clip(functionText(r), 120)}` : ""}\n  linked: ${clip(chain(r.id), 260)}`,
      ),
      ...byFunction.map(
        (r) =>
          `- ${key(r)} · ${r.title}\n  matched by what it does: ${clip(functionText(r), 160)}`,
      ),
    ];

    // Loose ends: matched accounts in the topic with at most one link, not yet combined with anything.
    const looseEnds = candidates
      .map((c) => c.record)
      .filter(
        (r) =>
          index.isAccount(r) &&
          r.record_type !== "question" &&
          !packed.has(r.id) &&
          !held.has(r.id) &&
          inTopic(r) &&
          (index.adjacency.get(r.id)?.size ?? 0) <= 1,
      )
      .slice(0, 4);
    return {
      ideas,
      bridges: input.cross_domain === true ? bridges : [],
      hidden: input.cross_domain === true ? 0 : bridges.length,
      bridgeRefs:
        input.cross_domain === true ? [...linked, ...byFunction].map(ref) : [],
      looseEnds,
    };
  }

  /** One account as compact Markdown: identity line, scope, prose, sources and the links that change its use. */
  block(
    index: LibraryIndex,
    p: Packed,
    packed: Map<string, Packed>,
    sharedScopes: Map<string, string>,
    context?: RecallRequest["context"],
    marks = { sideBySide: false },
    purpose: RecallPurpose = "explain",
  ) {
    const r = p.record;
    const payload = r.payload as any;
    const lines: string[] = [];
    const flags: string[] = [];
    if (!["source_account", form(r)].includes(r.epistemic))
      flags.push(r.epistemic);
    if (isFiledAnswer(r)) flags.push("filed answer");
    const support = supportTally(index, r);
    if (support.sources.length > 1)
      flags.push(`${support.sources.length} independent sources`);
    const assessments = assessed(r);
    for (const a of assessments) flags.push(`${a.dimension} ${a.level}`);
    if (support.challenged) flags.push("contested");
    if (index.pending.has(r.id)) flags.push("pending reassessment");
    if (r.scope.condition_expression) {
      const applicability = index.applicability(r, context);
      if (applicability !== "true")
        flags.push(`applicability ${applicability}`);
    }
    const today = new Date().toISOString().slice(0, 10);
    if (
      (r.scope.valid_from && today < r.scope.valid_from) ||
      (r.scope.valid_until && today > r.scope.valid_until)
    )
      flags.push(
        `outside validity ${r.scope.valid_from ?? "…"} to ${r.scope.valid_until ?? "…"}`,
      );
    const scope = scopeText(r);
    if (scope && sharedScopes.has(scope))
      flags.push(`scope ${sharedScopes.get(scope)}`);
    lines.push(`### ${r.title}${p.role !== "account" ? ` (${p.role})` : ""}`);
    lines.push(
      `${key(r)} · ${form(r)}${flags.length ? " · " + flags.join(" · ") : ""}`,
    );
    if (scope && !sharedScopes.has(scope)) lines.push(scope);
    if (assessments.length)
      lines.push(
        `Assessed: ${assessments.map((a) => `${a.dimension}${a.basis ? ` (${a.basis})` : ""}, ${a.rationale}${a.context ? ` (context: ${a.context})` : ""}`).join("; ")}`,
      );
    // Conflicts show both sides' levels next to each other, in their recorded order, never ranked.
    const sideBySide = (others: RecordData[]) => {
      if (![r, ...others].some((x) => assessed(x).length)) return "";
      marks.sideBySide = true;
      return `\n  Side by side: ${[r, ...others].map((x) => `${x === r ? "this account" : x.title} (${profile(index, x)})`).join(" | ")}`;
    };
    if (r.record_type === "judgment") {
      lines.push(
        `Outcome: ${payload.outcome}. What would change it: ${payload.what_would_change}`,
      );
      const sides = [
        ...new Map(
          [...payload.issue_refs, ...payload.alternatives].map((s: Ref) => [
            s.id,
            index.visible.get(s.id),
          ]),
        ).values(),
      ].filter((s): s is RecordData => !!s);
      if (sides.some((s) => assessed(s).length)) {
        marks.sideBySide = true;
        lines.push(
          `Weighs, side by side: ${sides.map((s) => `${s.title} (${profile(index, s)})`).join(" | ")}`,
        );
      }
    }
    lines.push(index.text(r).trim());
    // Inventing works from what an account does, in words other fields can match. Only the
    // first two domain-free wordings per slot: preconditions and failure modes are in the prose.
    const facets = (r.extensions as any)?.functional_facets;
    if (purpose === "invent" && facets) {
      const abstract = (slot: string) =>
        (facets[slot] ?? [])
          .slice(0, 2)
          .map((e: any) => e.abstract ?? e.text)
          .filter(Boolean)
          .join("; ");
      const parts = [
        abstract("purpose") && `Does: ${abstract("purpose")}`,
        abstract("mechanism") && `By: ${abstract("mechanism")}`,
      ].filter(Boolean);
      if (parts.length) lines.push(parts.join(" · "));
    }
    // Teaching and applying a procedure need its branches, not just its steps.
    const decisions = (r.extensions as any)?.decision_points ?? [];
    if (decisions.length && (purpose === "teach" || purpose === "apply"))
      lines.push(decisionTree(index, decisions));
    if (support.sources.length)
      lines.push(`Sources: ${support.sources.join("; ")}`);
    for (const citation of ((r.extensions as any)?.citations ?? []).slice(
      0,
      3,
    )) {
      const passage = index.visible.get(citation.ref.id);
      lines.push(
        `> "${clip(citation.quote, 280)}" (${passage ? pageLabel(passage) : citation.ref.id}, verified)`,
      );
    }
    const builds = (index.outgoing.get(r.id) ?? []).filter(
      (l) => l.predicate === "depends_on",
    );
    if (builds.length)
      lines.push(
        `Builds on: ${builds.map((l) => `${index.visible.get(l.object)?.title} (${l.object}${packed.has(l.object) ? ", loaded" : ""})`).join("; ")}`,
      );
    for (const link of index.incoming.get(r.id) ?? [])
      if (["qualifies", "challenges"].includes(link.predicate)) {
        const subject = index.visible.get(link.subject);
        lines.push(
          `⚠ ${link.predicate === "challenges" ? "Challenged" : "Qualified"} by ${subject?.title} (${link.subject}${packed.has(link.subject) ? ", loaded" : ""}): ${link.rationale}${link.predicate === "challenges" && subject ? sideBySide([subject]) : ""}`,
        );
      }
    for (const link of index.outgoing.get(r.id) ?? [])
      if (
        [
          "qualifies",
          "challenges",
          "explains",
          "exemplifies",
          "applies_to",
        ].includes(link.predicate)
      ) {
        const object = index.visible.get(link.object);
        lines.push(
          // A loaded target already shows this pair on its own challenge line.
          `→ ${link.predicate.replace("_", " ")} ${object?.title} (${link.object})${link.predicate === "challenges" && object && !packed.has(object.id) ? sideBySide([object]) : ""}`,
        );
      }
    return lines.join("\n");
  }
}

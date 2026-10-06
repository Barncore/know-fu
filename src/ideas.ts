import * as fs from "node:fs/promises";
import { Store } from "./store.js";
import { LibraryIndex } from "./library-index.js";
import {
  VERSION,
  atomic,
  ensure,
  json,
  key,
  now,
  ref,
  uid,
  uniqueRefs,
} from "./core.js";
import type { ProposalData, RecordData, Ref, Scope } from "./core.js";
import { parseRef } from "./filing.js";
import { summary } from "./navigation.js";
import {
  decisiveResult,
  ideaStatus,
  isTested,
  totalTrials,
} from "./idea-rules.js";
import type {
  IdeaPayload,
  IdeaResult,
  IdeaStatus,
  Rating,
} from "./idea-rules.js";

type RefInput = Ref | string;
type RatingInput = { level?: string; why?: string; reason?: string };

export type IdeaDraft = {
  title?: string;
  statement: string;
  kill_test: string;
  premises?: RefInput[];
  parents?: RefInput[];
  pass_rule?: string;
  origin?: string;
  originality?: RatingInput;
  feasibility?: RatingInput;
  detail?: string;
  domains?: string[];
  module?: string;
};

export type IdeaRequest = Partial<IdeaDraft> & {
  action?:
    | "propose"
    | "plan"
    | "result"
    | "park"
    | "unpark"
    | "revise"
    | "list"
    | "show"
    | "export";
  ideas?: IdeaDraft[];
  idea?: RefInput;
  reason?: string;
  authorization?: string;
  dry_run?: boolean;
  // Results reported by the owner's own tools.
  tool?: string;
  version?: string;
  outcome?: string;
  trials?: number;
  data_window?: string;
  metrics?: Record<string, number | string>;
  note?: string;
  failure?: { kind?: string; reason?: string };
  // Listing and export.
  status?: string | string[];
  query?: string;
  min_feasibility?: string;
  limit?: number;
  scope?: Scope;
  release_id?: string;
};

const STATUS_ORDER: IdeaStatus[] = [
  "under_test",
  "proposed",
  "supported",
  "refuted",
  "dormant",
];
const LEVELS = ["low", "medium", "high"];
const text = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";
const clip = (value: string, n: number) => {
  const flat = value.replace(/\s+/g, " ").trim();
  return flat.length > n ? flat.slice(0, n - 1) + "…" : flat;
};

/** How a status reads in a briefing. */
export const statusWords = (status: string) => status.replace("_", " ");

/** One result in a line: outcome, tool, data and trials, and the failure reason. */
export function resultLine(r: IdeaResult) {
  const blame =
    r.failure?.kind === "execution" ? " (the test or build, not the idea)" : "";
  return `${r.outcome}${blame} on ${r.recorded_at.slice(0, 10)} via ${r.tool} ${r.version}${r.data_window ? ` on ${r.data_window}` : ""}, ${r.trials} trial${r.trials > 1 ? "s" : ""}${r.failure ? `: ${r.failure.reason}` : r.note ? `: ${r.note}` : ""}`;
}

/** An idea as a compact block for lists and the invent briefing. */
export function ideaBlock(index: LibraryIndex, idea: RecordData, lean = false) {
  const p = idea.payload as IdeaPayload;
  // A default title is the statement's opening, so it isn't printed twice.
  const titled = !p.statement.startsWith(idea.title.replace(/…$/, ""));
  const lines = [
    `- ${key(idea)} · ${statusWords(p.status)}${titled ? ` · ${idea.title}` : ""}`,
    `  Idea: ${clip(p.statement, lean ? 220 : 400)}`,
  ];
  const settled = decisiveResult(p);
  const last = p.results.at(-1);
  if (p.status === "refuted" && settled?.failure)
    lines.push(`  Failed because: ${clip(settled.failure.reason, 240)}`);
  else if (last) lines.push(`  Last result: ${clip(resultLine(last), 240)}`);
  if (!lean || !p.results.length)
    lines.push(
      `  Kill test: ${clip(p.kill_test, 200)}${p.pass_rule ? ` · Pass rule: ${clip(p.pass_rule, 160)}` : ""}`,
    );
  const ratings = ratingText(p);
  if (ratings && !lean) lines.push(`  ${ratings}`);
  for (const flag of index.ideaFlags(idea)) lines.push(`  ⚠ ${flag}`);
  return lines.join("\n");
}

function ratingText(p: IdeaPayload) {
  const parts = (["originality", "feasibility"] as const)
    .filter((k) => p.ratings?.[k])
    .map((k) => `${k} ${p.ratings![k]!.level} (${p.ratings![k]!.reason})`);
  return parts.length ? `Rated separately: ${parts.join(" · ")}` : "";
}

function rating(value: RatingInput | undefined, name: string) {
  if (value === undefined) return undefined;
  const level = text(value?.level);
  const reason = text(value?.why) || text(value?.reason);
  ensure(
    LEVELS.includes(level) && reason,
    "VALIDATION_FAILED",
    `${name} takes {level: low|medium|high, why: one line}`,
  );
  return { level, reason } as Rating;
}

/**
 * Ideas: candidate inventions kept in their own lane. They rest on library accounts,
 * never become evidence for them, and change status only when a result from the owner's
 * own tools is recorded against a pass rule declared before the run.
 */
export class Ideas {
  constructor(readonly store: Store) {}

  async call(input: IdeaRequest) {
    const action = input.action ?? (input.idea ? "show" : "list");
    switch (action) {
      case "list":
        return this.store.withReadSession(() => this.list(input));
      case "export":
        return this.store.withReadSession(() => this.export(input));
      case "show":
        return this.store.withReadSession(() => this.show(input));
      case "propose":
        return this.propose(input);
      case "plan":
      case "result":
      case "park":
      case "unpark":
      case "revise":
        return this.change(action, input);
    }
    throw Object.assign(new Error("Unknown kb_idea action"), {
      code: "VALIDATION_FAILED",
    });
  }

  private authorize(input: IdeaRequest) {
    ensure(
      text(input.authorization).length >= 3,
      "AUTHORIZATION_REQUIRED",
      "Quote or summarize the owner's request that this records",
    );
    return text(input.authorization).slice(0, 300);
  }

  /** Premises resolve to current, usable accounts or passages; a bare id means its current revision. */
  private premise(index: LibraryIndex, value: RefInput, where: string) {
    const raw = typeof value === "string" ? value.trim() : null;
    const reference =
      raw && !raw.includes("@")
        ? { id: raw, revision: index.visible.get(raw)?.revision ?? 0 }
        : parseRef(value);
    const record = index.visible.get(reference.id);
    ensure(
      !record || record.record_type !== "idea",
      "VALIDATION_FAILED",
      `${where}: ${reference.id} is an idea. An earlier idea enters as a parent, and only once it's tested.`,
    );
    ensure(
      record &&
        key(record) === key(reference) &&
        index.usableIds.has(record.id) &&
        !["source", "relationship"].includes(record.record_type),
      "VALIDATION_FAILED",
      `${where}: ${key(reference)} is not a current, usable account or passage in your scope`,
    );
    return record;
  }

  private parent(index: LibraryIndex, value: RefInput, where: string) {
    const raw = typeof value === "string" ? value.trim() : null;
    const reference =
      raw && !raw.includes("@")
        ? { id: raw, revision: index.live.get(raw)?.revision ?? 0 }
        : parseRef(value);
    const record = index.ideas.get(reference.id);
    ensure(
      record && key(record) === key(reference),
      "VALIDATION_FAILED",
      `${where}: ${key(reference)} is not a current idea in your scope`,
    );
    ensure(
      isTested(record),
      "VALIDATION_FAILED",
      `${where}: ${record.title} hasn't been tested. Only a supported or refuted idea can parent a new one.`,
    );
    return record;
  }

  private sources(records: RecordData[]) {
    const out: Ref[] = [];
    for (const r of records) {
      out.push(...r.provenance.source_refs);
      if (r.record_type === "passage") out.push((r.payload as any).source_ref);
    }
    return uniqueRefs(out);
  }

  private async propose(input: IdeaRequest) {
    const drafts = input.ideas?.length ? input.ideas : [input as IdeaDraft];
    ensure(
      drafts.length <= 20,
      "VALIDATION_FAILED",
      "Propose at most 20 ideas per call",
    );
    const authorization = this.authorize(input);
    const plan = await this.store.withReadSession(async () => {
      const index = await LibraryIndex.open(this.store, {});
      const scope = await this.store.scope();
      const items = drafts.map((draft, i) => {
        const where = drafts.length > 1 ? `Idea ${i + 1}` : "Idea";
        const statement = text(draft.statement);
        const killTest = text(draft.kill_test);
        ensure(
          statement.length >= 20,
          "VALIDATION_FAILED",
          `${where}: statement says the idea in a sentence or two`,
        );
        ensure(
          killTest.length >= 10,
          "VALIDATION_FAILED",
          `${where}: kill_test names the result that would show it's wrong`,
        );
        const premises = (draft.premises ?? []).map((p) =>
          this.premise(index, p, where),
        );
        const parents = (draft.parents ?? []).map((p) =>
          this.parent(index, p, where),
        );
        ensure(
          premises.length + parents.length,
          "VALIDATION_FAILED",
          `${where}: name the library premises it rests on, or a tested parent idea`,
        );
        const modules = [
          ...new Set(
            [...premises, ...parents].map((r) => r.maintenance_module),
          ),
        ];
        const module =
          draft.module ??
          input.module ??
          (modules.length === 1 ? modules[0] : undefined);
        ensure(
          module,
          "VALIDATION_FAILED",
          `${where}: its premises span several modules; name the module it belongs to`,
        );
        ensure(
          scope.write_modules.includes(module),
          "SCOPE_DENIED",
          "This project cannot write to that module",
        );
        const domains = draft.domains?.length
          ? draft.domains
          : input.domains?.length
            ? input.domains
            : [
                ...new Set(
                  [...premises, ...parents].flatMap((r) => r.scope.domains),
                ),
              ];
        const payload: IdeaPayload = {
          statement,
          kill_test: killTest,
          pass_rule: text(draft.pass_rule) || null,
          status: "proposed",
          parent_refs: parents.map(ref),
          origin: text(draft.origin) || null,
          results: [],
        };
        const ratings = {
          originality: rating(draft.originality, `${where}: originality`),
          feasibility: rating(draft.feasibility, `${where}: feasibility`),
        };
        if (ratings.originality || ratings.feasibility)
          payload.ratings = Object.fromEntries(
            Object.entries(ratings).filter(([, v]) => v),
          );
        payload.status = ideaStatus(payload);
        return {
          local_id: `idea-${i + 1}`,
          record_type: "idea",
          title: text(draft.title) || clip(statement, 80),
          maintenance_module: module,
          epistemic: "hypothesis",
          scope: {
            domains,
            conditions: [],
            exclusions: [],
            condition_expression: null,
            valid_from: null,
            valid_until: null,
          },
          source_refs: this.sources([...premises, ...parents]),
          input_refs: uniqueRefs([...premises, ...parents].map(ref)),
          change_reason: `Idea proposed. Request: ${authorization}`,
          body_markdown: text(draft.detail) ? text(draft.detail) + "\n" : null,
          payload,
        };
      });
      return { index, scope, items, base: index.current };
    });
    const modules = [...new Set(plan.items.map((i) => i.maintenance_module))];
    const proposal = {
      schema_version: VERSION,
      proposal_id: uid("idea-"),
      job_id: "idea",
      base_release: plan.base,
      scope_policy: {
        read_modules: plan.scope.read_modules,
        write_modules: modules,
        source_refs: plan.scope.source_refs,
      },
      items: plan.items,
    } as unknown as ProposalData;
    const compiled = await this.store.compile(proposal);
    for (const r of compiled.records) r.provenance.method = "idea";
    if (input.dry_run)
      return {
        status: "preview",
        records: compiled.records,
        note: "Nothing was published. Call again without dry_run to record these ideas.",
      };
    const published = await this.store.publish(
      compiled.records,
      compiled.bodies,
      plan.base,
      `Ideas proposed: ${compiled.records
        .map((r) => r.title)
        .join("; ")
        .slice(0, 300)}`,
      proposal.scope_policy,
    );
    const briefing = [
      `Recorded ${compiled.records.length} idea${compiled.records.length > 1 ? "s" : ""} in release ${published.release_id}. They stay out of recall except purpose invent.`,
      ...compiled.records.map((r) => {
        const p = r.payload as IdeaPayload;
        return `- ${key(r)} · ${statusWords(p.status)} · ${r.title}`;
      }),
      compiled.records.some((r) => !(r.payload as IdeaPayload).pass_rule)
        ? 'Before running a test, declare its pass rule: kb_idea {action:"plan", idea, pass_rule}. A result is judged by the rule published before it.'
        : 'Report results with kb_idea {action:"result", idea, tool, version, outcome, trials}.',
    ].join("\n");
    return {
      status: "published",
      release_id: published.release_id,
      ideas: compiled.records.map(ref),
      briefing,
    };
  }

  /** Every change to an existing idea is a new revision checked by the same publish rules. */
  private async change(
    action: "plan" | "result" | "park" | "unpark" | "revise",
    input: IdeaRequest,
  ) {
    ensure(input.idea, "VALIDATION_FAILED", "Name the idea: id or id@revision");
    const authorization = this.authorize(input);
    const plan = await this.store.withReadSession(async () => {
      const index = await LibraryIndex.open(this.store, {});
      const scope = await this.store.scope();
      const raw = typeof input.idea === "string" ? input.idea.trim() : null;
      const reference =
        raw && !raw.includes("@")
          ? { id: raw, revision: index.live.get(raw)?.revision ?? 0 }
          : parseRef(input.idea!);
      const idea = index.ideas.get(reference.id);
      ensure(
        idea && key(idea) === key(reference),
        "VALIDATION_FAILED",
        `${key(reference)} is not the current revision of an idea in your scope`,
      );
      ensure(
        scope.write_modules.includes(idea.maintenance_module),
        "SCOPE_DENIED",
        "This project cannot write to that idea's module",
      );
      const old = idea.payload as IdeaPayload;
      const p: IdeaPayload = structuredClone(old);
      // Any new revision counts as looking at the idea again, so premises move to their
      // current revisions and the response names each one that moved. A premise that was
      // withdrawn stays pinned, and the idea keeps showing it as lost.
      const parentIds = new Set(p.parent_refs.map((x) => x.id));
      const moved: string[] = [];
      let inputs = idea.provenance.input_refs.map((x) => {
        const current = parentIds.has(x.id)
          ? index.ideas.get(x.id)
          : index.visible.get(x.id);
        const usable =
          !!current &&
          (parentIds.has(x.id)
            ? isTested(current)
            : index.usableIds.has(current.id));
        if (!usable || current!.revision === x.revision) return x;
        moved.push(`${current!.title} (${key(x)} → ${key(current!)})`);
        return ref(current!);
      });
      const recordOf = (x: Ref) =>
        x.revision === index.visible.get(x.id)?.revision
          ? index.visible.get(x.id)!
          : null;
      let reason = text(input.reason);
      if (action === "plan") {
        const rule = text(input.pass_rule);
        ensure(
          rule.length >= 10,
          "VALIDATION_FAILED",
          "pass_rule states exactly what result counts as a pass, before the run",
        );
        ensure(
          !p.results.length,
          "VALIDATION_FAILED",
          "This idea already has results, so its pass rule is fixed. Propose a new idea with this one as its parent to test it another way.",
        );
        p.pass_rule = rule;
        reason ||= old.pass_rule
          ? "Pass rule changed before any result"
          : "Pass rule declared";
      } else if (action === "result") {
        ensure(
          p.pass_rule,
          "VALIDATION_FAILED",
          'Declare the pass rule first with kb_idea {action:"plan"}. A result recorded without one could be judged by hindsight.',
        );
        const outcome = text(input.outcome);
        ensure(
          ["pass", "fail", "inconclusive"].includes(outcome),
          "VALIDATION_FAILED",
          "outcome is pass, fail or inconclusive, judged by the declared pass rule",
        );
        ensure(
          Number.isInteger(input.trials) && input.trials! >= 1,
          "VALIDATION_FAILED",
          "trials counts every variant or setting tried in this run, including the ones thrown away",
        );
        ensure(
          text(input.tool) && text(input.version),
          "VALIDATION_FAILED",
          "Name the tool that ran the test and its version",
        );
        const metrics = input.metrics ?? {};
        ensure(
          metrics &&
            typeof metrics === "object" &&
            !Array.isArray(metrics) &&
            Object.values(metrics).every((v) =>
              ["number", "string"].includes(typeof v),
            ),
          "VALIDATION_FAILED",
          "metrics is a flat map of names to numbers or short strings",
        );
        let failure: IdeaResult["failure"] = null;
        if (outcome === "fail") {
          const kind = text(input.failure?.kind);
          const why = text(input.failure?.reason);
          ensure(
            ["idea", "execution"].includes(kind) && why,
            "VALIDATION_FAILED",
            'A failed result says why and whose fault it was: failure {kind: "idea" when the idea itself was wrong, "execution" when the build or test was, reason}',
          );
          failure = { kind: kind as "idea" | "execution", reason: why };
        }
        p.results.push({
          recorded_at: now(),
          tool: text(input.tool),
          version: text(input.version),
          data_window: text(input.data_window) || null,
          pass_rule: p.pass_rule!,
          outcome: outcome as IdeaResult["outcome"],
          trials: input.trials!,
          metrics,
          note: text(input.note) || null,
          failure,
        });
        reason ||= `Result recorded: ${outcome}`;
      } else if (action === "park") {
        ensure(reason, "VALIDATION_FAILED", "Say why the idea is parked");
      } else if (action === "unpark") {
        ensure(old.status === "dormant", "VALIDATION_FAILED", "Not parked");
        reason ||= "Taken off the shelf";
      } else {
        // revise: wording, premises and ratings before any result; ratings and origin at any time.
        const tested = p.results.length > 0;
        const fixed = ["statement", "kill_test", "premises"] as const;
        ensure(
          !tested || fixed.every((f) => input[f] === undefined),
          "VALIDATION_FAILED",
          "A tested idea keeps its statement, kill test and premises. Propose a new idea with this one as its parent instead.",
        );
        if (input.statement !== undefined) p.statement = text(input.statement);
        if (input.kill_test !== undefined) p.kill_test = text(input.kill_test);
        if (input.origin !== undefined) p.origin = text(input.origin) || null;
        const originality = rating(input.originality, "originality");
        const feasibility = rating(input.feasibility, "feasibility");
        if (originality || feasibility)
          p.ratings = {
            ...p.ratings,
            ...(originality ? { originality } : {}),
            ...(feasibility ? { feasibility } : {}),
          };
        if (input.premises !== undefined) {
          const chosen = input.premises.map((x) =>
            this.premise(index, x, "Premise"),
          );
          inputs = uniqueRefs([
            ...chosen.map(ref),
            ...inputs.filter((x) => parentIds.has(x.id)),
          ]);
          ensure(
            inputs.length,
            "VALIDATION_FAILED",
            "An idea keeps at least one premise or tested parent",
          );
        }
        ensure(
          reason,
          "VALIDATION_FAILED",
          "Say what changed or why the idea still stands",
        );
      }
      p.parent_refs = inputs.filter((x) => parentIds.has(x.id));
      p.status =
        action === "park" || (action === "revise" && old.status === "dormant")
          ? "dormant"
          : ideaStatus(p);
      const premiseRecords = inputs
        .map(recordOf)
        .filter((r): r is RecordData => !!r);
      const sources =
        input.premises !== undefined && action === "revise"
          ? this.sources(premiseRecords)
          : uniqueRefs([
              ...idea.provenance.source_refs,
              ...this.sources(premiseRecords),
            ]);
      return { index, idea, payload: p, inputs, sources, moved, reason };
    });
    const idea = plan.idea;
    const proposal = {
      schema_version: VERSION,
      proposal_id: uid("idea-"),
      job_id: "idea",
      base_release: plan.index.current,
      scope_policy: {
        read_modules: plan.index.scope.read_modules,
        write_modules: [idea.maintenance_module],
        source_refs: plan.index.scope.source_refs,
      },
      items: [
        {
          local_id: "idea",
          existing_ref: ref(idea),
          record_type: "idea",
          title: text(input.title) || idea.title,
          maintenance_module: idea.maintenance_module,
          epistemic: "hypothesis",
          scope: idea.scope,
          source_refs: plan.sources,
          input_refs: plan.inputs,
          change_reason: `${plan.reason}. Request: ${authorization}`,
          body_markdown: (await this.store.body(idea)) || null,
          payload: plan.payload,
        },
      ],
    } as unknown as ProposalData;
    const compiled = await this.store.compile(proposal);
    const record = compiled.records[0];
    record.provenance.method = "idea";
    if (input.dry_run)
      return {
        status: "preview",
        record,
        note: "Nothing was published. Call again without dry_run to record it.",
      };
    const published = await this.store.publish(
      compiled.records,
      compiled.bodies,
      plan.index.current,
      `Idea ${action}: ${record.title}`.slice(0, 300),
      proposal.scope_policy,
    );
    const p = record.payload as IdeaPayload;
    return {
      status: "published",
      release_id: published.release_id,
      idea: ref(record),
      idea_status: p.status,
      briefing: [
        `${key(record)} · ${statusWords(p.status)} · ${record.title}`,
        ...(action === "result"
          ? [
              `Recorded: ${resultLine(p.results.at(-1)!)}`,
              `Trials across all results: ${totalTrials(p)}`,
            ]
          : []),
        ...(plan.moved.length
          ? [
              `Premises moved to their current revisions; check the idea still follows from them: ${plan.moved.join("; ")}`,
            ]
          : []),
      ].join("\n"),
    };
  }

  /** Ideas in scope, filtered by status, words and a feasibility floor. */
  private select(index: LibraryIndex, input: IdeaRequest) {
    const statuses = input.status
      ? (Array.isArray(input.status) ? input.status : [input.status]).map(text)
      : [];
    for (const s of statuses)
      ensure(
        STATUS_ORDER.includes(s as IdeaStatus),
        "VALIDATION_FAILED",
        `status is one of ${STATUS_ORDER.join(", ")}`,
      );
    const floor = input.min_feasibility
      ? LEVELS.indexOf(text(input.min_feasibility))
      : -1;
    ensure(
      !input.min_feasibility || floor >= 0,
      "VALIDATION_FAILED",
      "min_feasibility is low, medium or high",
    );
    let ideas = [...index.ideas.values()];
    if (text(input.query)) {
      const hits = index.ideaLexical.search(text(input.query), 200);
      const order = new Map(hits.map((h, i) => [h.id, i]));
      ideas = ideas
        .filter((r) => order.has(r.id))
        .sort((a, b) => order.get(a.id)! - order.get(b.id)!);
    }
    if (input.domains?.length)
      ideas = ideas.filter((r) =>
        r.scope.domains.some((d) => input.domains!.includes(d)),
      );
    if (statuses.length)
      ideas = ideas.filter((r) =>
        statuses.includes((r.payload as IdeaPayload).status),
      );
    // A feasibility floor, then originality first: the two ratings are never combined.
    if (floor >= 0)
      ideas = ideas
        .filter(
          (r) =>
            LEVELS.indexOf(
              (r.payload as IdeaPayload).ratings?.feasibility?.level ?? "",
            ) >= floor,
        )
        .sort(
          (a, b) =>
            LEVELS.indexOf(
              (b.payload as IdeaPayload).ratings?.originality?.level ?? "",
            ) -
            LEVELS.indexOf(
              (a.payload as IdeaPayload).ratings?.originality?.level ?? "",
            ),
        );
    return ideas;
  }

  private async list(input: IdeaRequest) {
    const index = await LibraryIndex.open(this.store, input);
    const ideas = this.select(index, input).slice(0, input.limit ?? 40);
    const counts = new Map<string, number>();
    for (const r of index.ideas.values()) {
      const s = (r.payload as IdeaPayload).status;
      counts.set(s, (counts.get(s) ?? 0) + 1);
    }
    const flagged = [...index.ideas.values()].filter(
      (r) => index.ideaFlags(r).length,
    ).length;
    const lines = [
      `# Ideas${text(input.query) ? `: ${text(input.query)}` : ""}`,
      `${index.ideas.size} on file · ${STATUS_ORDER.filter((s) => counts.get(s))
        .map((s) => `${counts.get(s)} ${statusWords(s)}`)
        .join(
          " · ",
        )}${flagged ? ` · ${flagged} with a changed premise` : ""} · release ${index.release}`,
      "Ideas aren't evidence. Originality and feasibility are rated separately and never added together.",
    ];
    const grouped = input.min_feasibility
      ? [["Above the feasibility floor, most original first", ideas] as const]
      : STATUS_ORDER.map(
          (s) =>
            [
              statusWords(s).replace(/^./, (c) => c.toUpperCase()),
              ideas.filter((r) => (r.payload as IdeaPayload).status === s),
            ] as const,
        );
    for (const [title, members] of grouped)
      if (members.length)
        lines.push(`\n## ${title}`, ...members.map((r) => ideaBlock(index, r)));
    if (!ideas.length) lines.push("\nNo ideas match.");
    return {
      interface_version: "ideas-1",
      release_id: index.release,
      ideas: ideas.map((r) => ({
        idea: ref(r),
        title: r.title,
        status: (r.payload as IdeaPayload).status,
      })),
      briefing: lines.join("\n"),
    };
  }

  private async show(input: IdeaRequest) {
    const index = await LibraryIndex.open(this.store, input);
    const raw = typeof input.idea === "string" ? input.idea.trim() : null;
    const id = raw ? raw.split("@")[0] : (input.idea as Ref).id;
    const idea = index.ideas.get(id);
    ensure(idea, "VALIDATION_FAILED", `${id} is not an idea in your scope`);
    const exported = this.describe(index, idea);
    const p = idea.payload as IdeaPayload;
    const lines = [
      `# Idea: ${idea.title}`,
      `${key(idea)} · ${statusWords(p.status)} · ${idea.scope.domains.join(", ")} · revision ${idea.revision}`,
      ...index.ideaFlags(idea).map((f) => `⚠ ${f}`),
      `Idea: ${p.statement}`,
      `Kill test: ${p.kill_test}`,
      `Pass rule: ${p.pass_rule ?? "not declared yet"}`,
      ...(p.origin ? [`Origin: ${p.origin}`] : []),
      ...(ratingText(p) ? [ratingText(p)] : []),
      ...((await this.store.body(idea))
        ? ["", await this.store.body(idea)]
        : []),
      "",
      "## Premises",
      ...exported.premises.map(
        (x) =>
          `- ${x.ref} · ${x.title}${x.current ? "" : ` (now ${x.current_ref ?? "withdrawn or out of scope"})`}${x.summary ? `: ${clip(x.summary, 160)}` : ""}`,
      ),
      ...(exported.parents.length
        ? [
            "",
            "## Parents",
            ...exported.parents.map(
              (x) => `- ${x.ref} · ${x.status} · ${x.title}`,
            ),
          ]
        : []),
      ...(exported.children.length
        ? [
            "",
            "## Ideas built on this one",
            ...exported.children.map(
              (x) => `- ${x.ref} · ${x.status} · ${x.title}`,
            ),
          ]
        : []),
      "",
      `## Results (${p.results.length}, ${totalTrials(p)} trials in all)`,
      ...(p.results.length
        ? p.results.map(
            (r) =>
              `- ${resultLine(r)}${
                Object.keys(r.metrics).length
                  ? `\n  metrics: ${Object.entries(r.metrics)
                      .map(([k, v]) => `${k} ${v}`)
                      .join(", ")}`
                  : ""
              }`,
          )
        : ["None yet."]),
    ];
    return {
      interface_version: "ideas-1",
      release_id: index.release,
      idea: exported,
      briefing: lines.join("\n"),
    };
  }

  /** One idea with everything an outside tool needs to pick up the project. */
  private describe(index: LibraryIndex, idea: RecordData) {
    const p = idea.payload as IdeaPayload;
    const parentIds = new Set(p.parent_refs.map((x) => x.id));
    return {
      ref: key(idea),
      title: idea.title,
      status: p.status,
      statement: p.statement,
      kill_test: p.kill_test,
      pass_rule: p.pass_rule,
      origin: p.origin ?? null,
      ratings: p.ratings ?? {},
      domains: idea.scope.domains,
      created_at: idea.created_at,
      flags: index.ideaFlags(idea),
      premises: idea.provenance.input_refs
        .filter((x) => !parentIds.has(x.id))
        .map((x) => {
          const live = index.visible.get(x.id);
          const usable = !!live && index.usableIds.has(x.id);
          return {
            ref: key(x),
            title: live?.title ?? x.id,
            type: live?.record_type ?? null,
            form: (live?.payload as any)?.form ?? null,
            summary: live ? summary(live) : null,
            current: usable && live!.revision === x.revision,
            current_ref: usable ? key(live!) : null,
            sources: (live?.provenance.source_refs ?? []).map(
              (s) => index.visible.get(s.id)?.title ?? s.id,
            ),
          };
        }),
      parents: p.parent_refs.map((x) => {
        const parent = index.ideas.get(x.id);
        return {
          ref: key(x),
          title: parent?.title ?? x.id,
          status: (parent?.payload as IdeaPayload | undefined)?.status ?? null,
        };
      }),
      children: [...index.ideas.values()]
        .filter((r) =>
          (r.payload as IdeaPayload).parent_refs.some((x) => x.id === idea.id),
        )
        .map((r) => ({
          ref: key(r),
          title: r.title,
          status: (r.payload as IdeaPayload).status,
        })),
      results: p.results,
      trials_total: totalTrials(p),
    };
  }

  /** Writes the selected ideas as JSON into the library's exports folder, for the owner's own tools. */
  private async export(input: IdeaRequest) {
    const index = await LibraryIndex.open(this.store, input);
    const ideas = this.select(index, input);
    const stamp = now().replace(/[:.]/g, "-");
    const relative = `exports/ideas/ideas-${stamp}.json`;
    const body = {
      format: "know-fu-ideas-1",
      exported_at: now(),
      release_id: index.release,
      note: "Ideas are candidates, not knowledge. Results were reported by outside tools against a pass rule declared before each run.",
      ideas: ideas.map((r) => this.describe(index, r)),
    };
    await fs.mkdir(this.store.p("exports/ideas"), { recursive: true });
    await atomic(this.store.p(relative), json(body));
    return {
      interface_version: "ideas-1",
      release_id: index.release,
      path: this.store.p(relative),
      count: ideas.length,
      briefing: `Exported ${ideas.length} idea${ideas.length === 1 ? "" : "s"} to ${this.store.p(relative)} (format know-fu-ideas-1: statement, premises with sources, kill test, pass rule, ratings, lineage and every result).`,
    };
  }
}

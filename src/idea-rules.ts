import { ensure, key } from "./core.js";
import type { RecordData, Ref } from "./core.js";

export type IdeaStatus =
  "proposed" | "under_test" | "supported" | "refuted" | "dormant";

export type IdeaResult = {
  recorded_at: string;
  tool: string;
  version: string;
  data_window: string | null;
  pass_rule: string;
  outcome: "pass" | "fail" | "inconclusive";
  trials: number;
  metrics: Record<string, number | string>;
  note: string | null;
  failure: { kind: "idea" | "execution"; reason: string } | null;
};

export type Rating = { level: "low" | "medium" | "high"; reason: string };

export type IdeaPayload = {
  statement: string;
  kill_test: string;
  pass_rule: string | null;
  status: IdeaStatus;
  parent_refs: Ref[];
  origin?: string | null;
  ratings?: { originality?: Rating; feasibility?: Rating };
  results: IdeaResult[];
};

/**
 * The result that settles an idea: the latest pass, or the latest failure blamed on the
 * idea itself. An inconclusive run, or a failure blamed on the implementation or the
 * test, leaves the idea where it was.
 */
export function decisiveResult(p: IdeaPayload) {
  return [...p.results]
    .reverse()
    .find(
      (r) =>
        r.outcome === "pass" ||
        (r.outcome === "fail" && r.failure?.kind === "idea"),
    );
}

/** The status an idea's own record supports. Parking (dormant) is the only free choice. */
export function ideaStatus(p: IdeaPayload): Exclude<IdeaStatus, "dormant"> {
  const settled = decisiveResult(p);
  if (settled) return settled.outcome === "pass" ? "supported" : "refuted";
  return p.pass_rule ? "under_test" : "proposed";
}

export function isTested(record: RecordData) {
  return (
    record.record_type === "idea" &&
    !!decisiveResult(record.payload as IdeaPayload)
  );
}

export function totalTrials(p: IdeaPayload) {
  return p.results.reduce((sum, r) => sum + r.trials, 0);
}

const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);

/**
 * Publish-time rules for an idea revision. `old` is the current revision, if any.
 * - Premises are library accounts or passages; an idea among the inputs must be a
 *   listed parent, and only an idea with a decisive result can parent another.
 * - Status follows the results. A result is appended, one per revision, and is judged
 *   by the pass rule the previous revision declared, so the rule exists before the run.
 * - Once any result exists, the statement, kill test, pass rule and premise ids are
 *   fixed; a changed idea is a new idea with this one as its parent.
 */
export async function checkIdea(
  r: RecordData,
  old: RecordData | undefined,
  resolve: (target: Ref) => Promise<RecordData>,
) {
  const p = r.payload as IdeaPayload;
  ensure(
    r.epistemic === "hypothesis",
    "VALIDATION_FAILED",
    "An idea is a hypothesis",
  );
  const parents = new Set(p.parent_refs.map(key));
  for (const input of r.provenance.input_refs) {
    const target = await resolve(input);
    if (target.record_type === "idea") {
      ensure(
        parents.has(key(input)),
        "VALIDATION_FAILED",
        "An earlier idea enters only as a parent, never as a premise",
        { input },
      );
      continue;
    }
    ensure(
      !["source", "relationship"].includes(target.record_type),
      "VALIDATION_FAILED",
      "Premises are library accounts or passages, not sources or links",
      { input },
    );
  }
  for (const parent of p.parent_refs) {
    ensure(
      r.provenance.input_refs.some((x) => key(x) === key(parent)),
      "VALIDATION_FAILED",
      "A parent idea is also one of the idea's inputs",
      { parent },
    );
    const target = await resolve(parent);
    ensure(
      target.record_type === "idea" && isTested(target),
      "VALIDATION_FAILED",
      "Only a tested idea (supported or refuted) can parent a new one. Untested ideas don't stack on each other.",
      { parent },
    );
  }
  const before = old ? (old.payload as IdeaPayload).results : [];
  ensure(
    p.results.length >= before.length &&
      p.results.length <= before.length + 1 &&
      before.every((result, i) => same(result, p.results[i])),
    "VALIDATION_FAILED",
    "Results are kept as recorded: add at most one new result per revision and never change an earlier one",
  );
  const added = p.results.length > before.length ? p.results.at(-1)! : null;
  if (added) {
    const declared = old ? (old.payload as IdeaPayload).pass_rule : null;
    ensure(
      declared,
      "VALIDATION_FAILED",
      "Declare the pass rule before the run: a result needs a pass rule published in an earlier revision",
    );
    ensure(
      added.pass_rule === declared && p.pass_rule === declared,
      "VALIDATION_FAILED",
      "A result is judged by the pass rule declared before it",
    );
    ensure(
      added.outcome === "fail" ? !!added.failure : added.failure === null,
      "VALIDATION_FAILED",
      "A failed result says why and whether the idea or the test was at fault; other outcomes carry no failure",
    );
  }
  if (before.length) {
    const prior = old!.payload as IdeaPayload;
    const premiseIds = (x: RecordData) =>
      [...new Set(x.provenance.input_refs.map((i) => i.id))].sort();
    ensure(
      p.statement === prior.statement &&
        p.kill_test === prior.kill_test &&
        p.pass_rule === prior.pass_rule &&
        same(premiseIds(r), premiseIds(old!)) &&
        same(
          p.parent_refs.map((x) => x.id).sort(),
          prior.parent_refs.map((x) => x.id).sort(),
        ),
      "VALIDATION_FAILED",
      "A tested idea keeps its statement, kill test, pass rule and premises. Propose a new idea with this one as its parent instead.",
    );
  }
  const expected = ideaStatus(p);
  ensure(
    p.status === "dormant" || p.status === expected,
    "VALIDATION_FAILED",
    `An idea's status follows its results: this one is ${expected.replace("_", " ")}`,
    { status: p.status, expected },
  );
}

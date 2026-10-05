// Regressions for the twelve findings of the 5 October 2026 implementation audit.
// Each test starts from the audit's reproduction and asserts the corrected behavior.
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import * as fs from "node:fs/promises";
import { published, fixture, FIX } from "./helpers.js";
import { Recall, estimateTokens } from "../src/recall.js";
import { Reading } from "../src/reading.js";
import { Filing } from "../src/filing.js";
import { Brief } from "../src/brief.js";
import { LibraryIndex } from "../src/library-index.js";
import { Lifecycle } from "../src/lifecycle.js";
import { Maintenance } from "../src/maintenance.js";
import { Projections } from "../src/projections.js";
import { Jobs } from "../src/jobs.js";
import { Notes } from "../src/notes.js";
import { Evaluation } from "../src/evaluation.js";
import { Retrieval } from "../src/retrieval.js";
import {
  hash,
  json,
  key,
  objectPath,
  readJson,
  ref,
  uid,
} from "../src/core.js";
import type { RecordData } from "../src/core.js";

const noIndex = { fresh: async () => false, receipt: async () => null } as any;
const ids = (result: any) => result.items.map((i: any) => i.record_ref.id);

test("F01: purging a source also deletes earlier revisions derived from it, and keeps the independent current one", async () => {
  const f = await published("audit-historical-purge");
  const old = f.records.find((r) => r.id === "knowledge:handling")!;
  const independent = structuredClone(old);
  independent.revision++;
  independent.title = "An independently revised account";
  independent.epistemic = "synthesis";
  independent.provenance.source_refs = [];
  independent.provenance.input_refs = [];
  independent.depends_on = [];
  (independent.payload as any).concept_refs = [];
  const body = "Independent new explanation without the former source.";
  independent.body = {
    path: objectPath(independent) + "/body.md",
    sha256: hash(body),
  };
  await f.store.publish(
    [independent],
    { [key(independent)]: body },
    await f.store.current(),
    "Replace with independent material",
    f.scope,
  );
  const life = new Lifecycle(f.store, {
    graph: async () => ({
      graph: { query: async () => ({}) },
      db: { close: async () => {} },
    }),
    indexName: async () => "audit-historical-purge",
  } as any);
  const plan = await life.plan(
    "purge",
    [{ id: "source:handbook", revision: 1 }],
    "Delete the fictional source",
  );
  assert(
    (plan.affected_history ?? []).some((r) => key(r) === key(old)),
    "the earlier source-derived revision is in the plan",
  );
  assert(!plan.affected_refs.some((r) => r.id === old.id));
  const result = await life.execute(plan.plan_id, {
    action: "purge",
    targets: plan.targets,
    user_instruction: "Delete the exact fictional source and its copies",
  });
  assert.equal(result.plan.state, "complete");
  await assert.rejects(fs.readFile(f.store.p(old.body!.path)));
  const bundle = await new Maintenance(f.store).exportBundle();
  assert(!bundle.manifest.files[old.body!.path]);
  await assert.rejects(f.store.exact(ref(old)), { code: "CONTENT_PURGED" });
  assert.equal((await f.store.read(ref(independent))).body, body);
});

test("F02: a dependency cycle created by a later revision still blocks reliance on withdrawn support", async () => {
  const c = await published("audit-live-cycle");
  const template = c.records.find((x) => x.id === "concept:ready-handbook")!;
  const make = (id: string, revision: number, inputs: any[]) =>
    ({
      ...structuredClone(template),
      id,
      revision,
      title: id,
      change_reason: "Cycle fixture",
      provenance: {
        ...structuredClone(template.provenance),
        input_refs: inputs,
      },
      depends_on: [...template.provenance.source_refs, ...inputs],
      payload: {
        ...structuredClone(template.payload),
        definition: "A synthetic cycle fixture.",
      },
    }) as RecordData;
  const publish = (r: RecordData, reason: string) =>
    c.store
      .current()
      .then((base) => c.store.publish([r], {}, base, reason, c.scope));
  const a1 = make("concept:aaa", 1, [
    { id: "passage:handling-limits", revision: 1 },
  ]);
  await publish(a1, "A1");
  const b1 = make("concept:bbb", 1, [ref(a1)]);
  await publish(b1, "B1");
  await publish(
    make("concept:aaa", 2, [
      ref(b1),
      { id: "passage:handling-limits", revision: 1 },
    ]),
    "A2",
  );
  const withdrawn = structuredClone(
    c.records.find((x) => x.id === "passage:handling-limits")!,
  );
  withdrawn.revision = 2;
  withdrawn.lifecycle = "withdrawn";
  withdrawn.change_reason = "Withdrawn";
  await publish(withdrawn, "Withdraw");
  const index = await c.store.withReadSession(() =>
    LibraryIndex.open(c.store, {}),
  );
  assert(!index.usableIds.has("concept:aaa"));
  assert(!index.usableIds.has("concept:bbb"));
  const recall: any = await new Recall(c.store, noIndex).recall({
    query: "bbb",
    semantic: false,
    graph: false,
  });
  assert(!ids(recall).includes("concept:bbb"));
});

test("F03: a filed answer carries its premise's condition and caveats even with graph expansion off", async () => {
  const f = await published("audit-inherited-guards");
  await new Filing(f.store).file({
    title: "Saffron Orbit Position",
    answer_markdown:
      "Saffron orbit analysis applies the handbook procedure to this particular fictional example. This worked synthesis recommends following the procedure as written.",
    cites: ["knowledge:handling@1"],
    authorization: "File the fictional example",
  });
  const result: any = await new Recall(f.store, noIndex).recall({
    query: "Saffron Orbit Position",
    purpose: "apply",
    semantic: false,
    graph: false,
    budget_tokens: 500,
  });
  // The premise's structured condition reaches the reader, loaded or listed.
  assert.match(result.briefing, /Dry reading room/);
  assert.match(result.briefing, /knowledge:handling@1/);
  assert.match(result.briefing, /readiness-conflict/);
});

test("F04: content staged after the check reopens it, and publication rejects a stale check", async () => {
  const f = await published("audit-check-binding");
  const jobs = new Jobs(f.store);
  const started = await jobs.ingest({
    paths: [path.join(FIX, "sources/handbook.md")],
    module: "workshop",
    domains: ["fictional_workshop"],
    idempotency_key: uid("check-"),
    authorization: "Exercise check binding",
  });
  const id = started.job.job_id;
  await jobs.convert(id);
  for (const stage of [
    "reconstruct",
    "integrate",
    "discover",
    "reweave",
    "compile",
    "check",
  ])
    await jobs.submit(id, {
      step_id: stage,
      stage,
      summary: "Reviewed the fictional source and what is currently staged.",
      coverage_all: { status: "complete" },
      stopping_reason: "Nothing else to stage.",
      unfinished: [],
      capability: "checked",
      understanding_change: {
        added: [],
        revised_refs: [],
        unresolved: [],
        checks: ["The checked staging contained no new accounts."],
        no_new_supported_understanding:
          "The duplicate adds no supported understanding.",
      },
    } as any);
  const job = await jobs.load(id);
  assert.equal(job.stage, "publish");

  // Out-of-band change to staging is caught by the digest.
  const stagedFile = path.join(jobs.jobPath(id), "staged.json");
  const original = await fs.readFile(stagedFile, "utf8");
  const tampered = JSON.parse(original);
  tampered.bodies["tampered@1"] = "Unchecked text";
  await fs.writeFile(stagedFile, json(tampered));
  await assert.rejects(jobs.publish(id), { code: "CHECK_STALE" });
  await fs.writeFile(stagedFile, original);

  // A proposal after the check sends the job back to the check stage.
  const proposal = await readJson<any>(path.join(FIX, "proposal.example.json"));
  proposal.job_id = id;
  proposal.base_release = job.base_release;
  proposal.proposal_id = "late-after-check";
  proposal.items = proposal.items.slice(0, 1);
  proposal.items[0].body_markdown =
    "This fictional explanation was written after the check receipt.";
  await jobs.propose(proposal);
  assert.equal((await jobs.load(id)).stage, "check");
  await assert.rejects(jobs.publish(id), {
    message: /required stages/,
  });
});

test("F05: retargeting a qualifier flags the account it used to qualify", async () => {
  const f = await published("audit-retarget");
  const oldLink = f.records.find((r) => r.id === "relationship:limits")!;
  const moved = structuredClone(oldLink);
  moved.revision++;
  (moved.payload as any).object = { id: "knowledge:courier", revision: 1 };
  moved.provenance.input_refs = [
    ...moved.provenance.input_refs.filter((r) => r.id !== "knowledge:handling"),
    { id: "knowledge:courier", revision: 1 },
  ];
  moved.depends_on = [
    ...moved.depends_on.filter((r) => r.id !== "knowledge:handling"),
    { id: "knowledge:courier", revision: 1 },
  ];
  const result = await f.store.publish(
    [moved],
    {},
    await f.store.current(),
    "Retarget qualifier",
    f.scope,
  );
  const flagged = result.impacts.map((i: any) => i.record_ref.id);
  for (const id of [
    "knowledge:handling",
    "knowledge:courier",
    "learning:near-miss",
  ])
    assert(flagged.includes(id), id);
});

test("F06: a note using a same-batch note inherits its source, in either order", async () => {
  const f = await published("audit-local-sources");
  const jobs = new Jobs(f.store);
  const file = f.store.p("../" + path.basename(f.store.root) + "-notice.md");
  await fs.writeFile(
    file,
    "# Notice\n\nThe saffron orbit entry requires a specific fictional room check before use.\n",
  );
  const created = await jobs.ingest({
    paths: [file],
    module: "workshop",
    domains: ["fictional_workshop"],
    idempotency_key: uid("local-"),
    authorization: "Exercise source propagation",
  });
  const id = created.job.job_id;
  const unit = (await jobs.convert(id)).job.coverage[0].unit_id;
  // The explanation comes first and uses the concept defined after it.
  await new Notes(jobs).write({
    job_id: id,
    notes: [
      `---\nid: saffron-explanation\ntype: knowledge\ntitle: Saffron orbit explanation\nuses: [saffron-concept]\n---\nThe saffron orbit concept describes the special room state. This explanation develops how it applies in this fictional example.`,
      `---\nid: saffron-concept\ntype: concept\ntitle: Saffron orbit meaning\ncites: [${unit}]\ndefinition: A special fictional room state.\n---\nA special fictional room state.`,
    ],
  });
  const staged = await readJson<any>(
    path.join(jobs.jobPath(id), "staged.json"),
  );
  const explanation = staged.records.find(
    (r: any) => r.title === "Saffron orbit explanation",
  );
  assert.deepEqual(
    explanation.provenance.source_refs.map((s: any) => s.id),
    created.job.source_refs.map((s: any) => s.id),
  );
  await f.store.publish(
    staged.records,
    staged.bodies,
    await f.store.current(),
    "Publish",
    f.scope,
  );
  const restricted: any = await new Recall(f.store, noIndex).recall({
    query: "Saffron orbit explanation",
    semantic: false,
    graph: false,
    scope: { ...f.scope, source_refs: created.job.source_refs },
  });
  assert(ids(restricted).includes(explanation.id));
});

test("F07: recall against a pinned release still shows a qualification published later", async () => {
  const p = await published("audit-pinned-caveat");
  const base = p.publication.release_id;
  const qualifier = structuredClone(
    p.records.find((x) => x.id === "knowledge:alternative")!,
  );
  qualifier.id = "knowledge:quarantined";
  qualifier.title = "Quarantine check introduced after baseline";
  qualifier.provenance.input_refs = [];
  qualifier.depends_on = qualifier.provenance.source_refs;
  qualifier.change_reason = "New quarantine qualification";
  const body = "Quarantined lanterns require a separate inspection.";
  qualifier.body = {
    path: objectPath(qualifier) + "/body.md",
    sha256: hash(body),
  };
  const link = structuredClone(
    p.records.find((x) => x.id === "relationship:limits")!,
  );
  link.id = "relationship:quarantined";
  link.title = "Quarantine restriction";
  link.change_reason = "New qualification";
  link.payload = {
    ...(link.payload as any),
    subject: ref(qualifier),
    object: { id: "knowledge:handling", revision: 1 },
    predicate: "qualifies",
    rationale: "Quarantined lanterns are excluded.",
  };
  link.depends_on = [ref(qualifier), { id: "knowledge:handling", revision: 1 }];
  link.provenance.input_refs = link.depends_on;
  link.provenance.source_refs = qualifier.provenance.source_refs;
  await p.store.publish(
    [qualifier, link],
    { [key(qualifier)]: body },
    base,
    "New quarantine rule",
    p.scope,
  );
  const pinned: any = await new Recall(p.store, noIndex).recall({
    query: "move lantern amber badge valve",
    purpose: "apply",
    semantic: false,
    graph: false,
    release_id: base,
  });
  assert.match(pinned.briefing, /Quarantine check introduced after baseline/);
  assert.match(pinned.briefing, /published after release/);
});

test("F08: the brief marks an expired primer and shows its boundary", async () => {
  const b = await published("audit-brief-expiry");
  const old = b.records.find((x) => x.id === "learning:primer")!;
  const expired = structuredClone(old);
  expired.revision = 2;
  expired.change_reason = "Expired scope";
  expired.scope.valid_until = "2021-01-01";
  const body = await b.store.body(old);
  expired.body = { path: objectPath(expired) + "/body.md", sha256: hash(body) };
  await b.store.publish(
    [expired],
    { [key(expired)]: body },
    await b.store.current(),
    "Expired primer",
    b.scope,
  );
  const brief: any = await new Brief(b.store).brief({});
  assert.match(
    brief.briefing,
    /learning:primer@2 · expired: valid until 2021-01-01/,
  );
  assert(!/learning:primer@2 · current/.test(brief.briefing));
});

test("F09: a corrected revision publishes after an interrupted publication left files behind", async () => {
  const f = await published("audit-aborted-object");
  const concept = f.records.find((r) => r.id === "concept:ready-handbook")!;
  const attempt = { ...concept, revision: 2, title: "An abandoned change" };
  process.env.KB_TEST_FAULT = "before_pointer";
  await assert.rejects(
    f.store.publish(
      [attempt],
      {},
      await f.store.current(),
      "Abandoned",
      f.scope,
    ),
    { code: "SIMULATED_CRASH" },
  );
  delete process.env.KB_TEST_FAULT;
  await f.store.recover();
  await f.store.publish(
    [{ ...attempt, title: "Corrected replacement" }],
    {},
    await f.store.current(),
    "Corrected replacement",
    f.scope,
  );
  const current = (await f.store.records()).get(concept.id)!;
  assert.equal(current.revision, 2);
  assert.equal(current.title, "Corrected replacement");
  // A committed revision is never treated as a leftover.
  await assert.rejects(
    f.store.publish(
      [{ ...current, title: "Rewrite of committed history" }],
      {},
      await f.store.current(),
      "Must fail",
      f.scope,
    ),
  );
});

test("F10: evaluation refuses an original whose bytes no longer match the source record", async () => {
  const f = await fixture("audit-eval-integrity");
  for (const r of f.records)
    if (r.id === "source:handbook")
      (r.payload as any).media_type = "text/plain";
  await f.store.publish(f.records, f.bodies, null, "Fixture", f.scope);
  const state = path.join(f.store.root, "evaluation-state");
  await fs.mkdir(state, { recursive: true });
  await fs.writeFile(
    path.join(state, "evaluation-isolation.json"),
    json({
      verified: true,
      mode: "native_commands_denied_input_only",
      fixture: true,
    }),
  );
  const evaluation = new Evaluation(f.store, new Retrieval(f.store), state);
  const manifest = await evaluation.prepare(
    [
      {
        case_id: "source-integrity",
        prompt: "What does the handbook say?",
        query: "READY",
        rubric: "Use the original fixture.",
        source_refs: [{ id: "source:handbook", revision: 1 }],
        source_grounding: "Handbook",
        held_out: true,
      },
    ] as any,
    "fixture-model",
    ["no_kb"],
  );
  const source = await f.store.exact({ id: "source:handbook", revision: 1 });
  await fs.writeFile(
    f.store.p((source.payload as any).original_path),
    "MUTATED AFTER EVALUATION FREEZE: invented policy.",
  );
  let graded: any = null;
  evaluation.isolated = async (workspace: string) => {
    try {
      graded = (await readJson(path.join(workspace, "case.json")))
        .original_sources;
      return {
        answer: json({
          verdict: "pass",
          reasons: ["stub"],
          citation_errors: [],
          rubric_errors: [],
          source_errors: [],
          uncertainty: [],
        }),
        elapsed_ms: 0,
        events: "",
        usage: null,
      };
    } catch {
      return {
        answer: "Fixture answer",
        elapsed_ms: 0,
        events: "",
        usage: null,
      };
    }
  };
  const report: any = await evaluation.run(manifest.run_id).catch((e) => e);
  assert(!JSON.stringify(graded ?? "").includes("MUTATED"));
  assert.notEqual(report?.manifest?.state, "complete");
});

test("F11: the reported budget is the whole delivered briefing, and overflow is stated", async () => {
  const f = await published("audit-budget");
  await new Filing(f.store).file({
    title: "Saffron Orbit Position",
    answer_markdown:
      "Saffron orbit analysis applies the handbook procedure to this particular fictional example. This worked synthesis recommends following the procedure as written.",
    cites: ["knowledge:handling@1"],
    authorization: "File this fictional explanation",
  });
  const small: any = await new Recall(f.store, noIndex).recall({
    query: "Saffron Orbit Position",
    purpose: "apply",
    semantic: false,
    budget_tokens: 500,
  });
  assert.equal(small.budget.used, estimateTokens(small.briefing));
  if (small.budget.used > 500)
    assert(
      small.warnings.some((w: string) => /over the 500-token budget/.test(w)),
    );
  const roomy: any = await new Recall(f.store, noIndex).recall({
    query: "move lantern amber badge valve",
    purpose: "apply",
  });
  assert.equal(roomy.budget.used, estimateTokens(roomy.briefing));
  assert(roomy.budget.used <= roomy.budget.requested);
});

test("F12: wiki_edit returns an edit kept in an older view, and says which release it was made against", async () => {
  const w = await published("audit-old-wiki-edit");
  const projections = new Projections(w.store);
  projections.graph = async () => {
    throw new Error("Graph unavailable in this test");
  };
  projections.qmd = async () =>
    ({ stdout: "", stderr: "", elapsed_ms: 0 }) as any;
  await projections.build({ semantic: false });
  const account = w.records.find((r) => r.id === "knowledge:handling")!;
  const oldPage = w.store.p(
    `views/${w.publication.release_id}/wiki/${hash(account.id).slice(0, 24)}.md`,
  );
  await fs.writeFile(
    oldPage,
    (await fs.readFile(oldPage, "utf8")).replace(
      "In the dry reading room",
      "NEW PROPOSED WORDING: In the dry reading room",
    ),
  );
  await w.store.publish([], {}, await w.store.current(), "Unrelated", w.scope);
  await projections.build({ semantic: false });
  const edit: any = await new Maintenance(w.store).wikiEdit(ref(account));
  assert.match(edit.proposed_markdown, /NEW PROPOSED WORDING/);
  assert.equal(edit.view_release, w.publication.release_id);
  assert.equal(key(edit.edited_against), key(account));
});

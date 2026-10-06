import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import { published } from "./helpers.js";
import { Ideas } from "../src/ideas.js";
import { Recall } from "../src/recall.js";
import { Filing } from "../src/filing.js";
import { Connect } from "../src/connect.js";
import { Brief } from "../src/brief.js";
import { Retrieval } from "../src/retrieval.js";
import { hash, key, objectPath, readJson } from "../src/core.js";
import type { RecordData } from "../src/core.js";

const noIndex = { fresh: async () => false, receipt: async () => null } as any;
const ask = "Save the idea we just worked out";

const draft = {
  statement:
    "Gate lantern moves on a second, independent valve sensor instead of the badge colour alone.",
  kill_test:
    "Moves gated by two sensors fail as often as moves gated by the badge alone.",
  premises: ["knowledge:handling@1", "knowledge:qualified-permission"],
  originality: { level: "medium", why: "Combines two known rules" },
  feasibility: { level: "high", why: "Sensors already exist" },
};

async function setup(label: string) {
  const f = await published(label);
  const ideas = new Ideas(f.store);
  const proposed: any = await ideas.call({
    action: "propose",
    ...draft,
    authorization: ask,
  });
  return {
    f,
    ideas,
    idea: proposed.ideas[0] as { id: string; revision: number },
  };
}

/** Publishes a hand-built revision, bypassing kb_idea, to prove the store enforces the rules itself. */
async function forge(
  f: Awaited<ReturnType<typeof published>>,
  id: string,
  change: (r: RecordData) => void,
) {
  const old = (await f.store.records()).get(id)!;
  const record = structuredClone(old);
  record.revision = old.revision + 1;
  record.change_reason = "Forged revision";
  change(record);
  const bodies: Record<string, string> = {};
  if (old.body) {
    const body = await f.store.body(old);
    record.body = { path: objectPath(record) + "/body.md", sha256: hash(body) };
    bodies[key(record)] = body;
  }
  return f.store.publish(
    [record],
    bodies,
    await f.store.current(),
    "Forged",
    f.scope,
  );
}

test("an idea needs premises, a kill test and the owner's request, and lands in its own lane", async () => {
  const f = await published("idea-propose");
  const ideas = new Ideas(f.store);
  await assert.rejects(
    ideas.call({ action: "propose", ...draft, authorization: "" }),
    /owner's request/,
  );
  await assert.rejects(
    ideas.call({
      action: "propose",
      ...draft,
      premises: ["source:handbook@1"],
      authorization: ask,
    }),
    /not a current, usable account or passage/,
  );
  await assert.rejects(
    ideas.call({
      action: "propose",
      ...draft,
      premises: [],
      authorization: ask,
    }),
    /premises it rests on/,
  );
  const result: any = await ideas.call({
    action: "propose",
    ...draft,
    authorization: ask,
  });
  const record = (await f.store.records()).get(result.ideas[0].id)!;
  assert.equal(record.record_type, "idea");
  assert.equal(record.epistemic, "hypothesis");
  assert.equal((record.payload as any).status, "proposed");
  assert.deepEqual(record.provenance.input_refs.map(key).sort(), [
    "knowledge:handling@1",
    "knowledge:qualified-permission@1",
  ]);
  assert.match(result.briefing, /declare its pass rule/);
});

test("ideas never reach explain, teach or apply recall, connect, filing or packet retrieval", async () => {
  const { f, idea } = await setup("idea-walls-read");
  const recall = new Recall(f.store, noIndex);
  for (const purpose of ["explain", "teach", "apply", "compare"] as const) {
    const result: any = await recall.recall({
      query: "independent valve sensor badge colour lantern",
      purpose,
    });
    assert.ok(
      !result.items.some((i: any) => i.record_ref.id === idea.id),
      purpose,
    );
    assert.doesNotMatch(result.briefing, /Ideas on file/);
  }
  await assert.rejects(
    new Connect(f.store).connect({ from: idea.id }),
    /not a current, usable record/,
  );
  await assert.rejects(
    new Filing(f.store).file({
      title: "Sensor gating",
      answer_markdown:
        "Gate lantern moves on two sensors; this restates the idea as if it were established knowledge.",
      cites: [key(idea)],
      authorization: "file it",
    }),
    /current, usable record/,
  );
  const packet: any = await new Retrieval(f.store, noIndex).retrieve({
    query: "independent valve sensor badge colour",
  });
  assert.ok(!JSON.stringify(packet).includes(idea.id));
});

test("nothing else can rest on an idea, and an untested idea can't parent another", async () => {
  const { f, ideas, idea } = await setup("idea-walls-write");
  await assert.rejects(
    forge(f, "knowledge:handling", (r) => {
      r.provenance.input_refs.push(idea);
    }),
    /An idea can't be evidence/,
  );
  await assert.rejects(
    ideas.call({
      action: "propose",
      ...draft,
      premises: [key(idea)],
      authorization: ask,
    }),
    /enters as a parent/,
  );
  await assert.rejects(
    ideas.call({
      action: "propose",
      ...draft,
      parents: [key(idea)],
      authorization: ask,
    }),
    /hasn't been tested/,
  );
});

test("status moves only with a result judged by a pass rule declared in an earlier revision", async () => {
  const { f, ideas, idea } = await setup("idea-results");
  const result = {
    action: "result" as const,
    tool: "lantern-sim",
    version: "0.4",
    data_window: "workshop log 2025",
    trials: 12,
    authorization: "Record the sim run",
  };
  await assert.rejects(
    ideas.call({ ...result, idea: idea.id, outcome: "pass" }),
    /Declare the pass rule first/,
  );
  // The store refuses a status the results don't support, and a rule declared with its own result.
  await assert.rejects(
    forge(f, idea.id, (r) => {
      (r.payload as any).status = "supported";
    }),
    /status follows its results: this one is proposed/,
  );
  await assert.rejects(
    forge(f, idea.id, (r) => {
      const p = r.payload as any;
      p.pass_rule = "Fewer failed moves than the badge rule";
      p.results.push({
        recorded_at: new Date().toISOString(),
        tool: "x",
        version: "1",
        data_window: null,
        pass_rule: p.pass_rule,
        outcome: "pass",
        trials: 1,
        metrics: {},
        note: null,
        failure: null,
      });
      p.status = "supported";
    }),
    /pass rule published in an earlier revision/,
  );
  const planned: any = await ideas.call({
    action: "plan",
    idea: idea.id,
    pass_rule:
      "Two-sensor gating cuts failed moves by at least half over 1,000 simulated moves",
    authorization: "Plan the test",
  });
  assert.equal(planned.idea_status, "under_test");
  await assert.rejects(
    ideas.call({ ...result, idea: idea.id, outcome: "fail" }),
    /failure \{kind/,
  );
  const execution: any = await ideas.call({
    ...result,
    idea: idea.id,
    outcome: "fail",
    failure: { kind: "execution", reason: "The sim dropped sensor readings" },
  });
  assert.equal(execution.idea_status, "under_test");
  const passed: any = await ideas.call({
    ...result,
    idea: idea.id,
    outcome: "pass",
    trials: 30,
    metrics: { failed_moves_cut: 0.62 },
  });
  assert.equal(passed.idea_status, "supported");
  assert.match(passed.briefing, /Trials across all results: 42/);
  // A tested idea keeps its wording, and its rule; results can't be rewritten.
  await assert.rejects(
    ideas.call({
      action: "revise",
      idea: idea.id,
      statement: "Something else entirely, now that we know the answer.",
      reason: "reword",
      authorization: "reword",
    }),
    /keeps its statement/,
  );
  await assert.rejects(
    ideas.call({
      action: "plan",
      idea: idea.id,
      pass_rule: "A looser rule after seeing the data",
      authorization: "loosen",
    }),
    /pass rule is fixed/,
  );
  await assert.rejects(
    forge(f, idea.id, (r) => {
      (r.payload as any).results[0].outcome = "pass";
    }),
    /Results are kept as recorded/,
  );
  // A later failure blamed on the idea refutes it; the refuted idea can now parent a new one.
  const failed: any = await ideas.call({
    ...result,
    idea: idea.id,
    outcome: "fail",
    trials: 5,
    failure: {
      kind: "idea",
      reason:
        "In humid rooms both sensors misread together, so they aren't independent",
    },
  });
  assert.equal(failed.idea_status, "refuted");
  const child: any = await ideas.call({
    action: "propose",
    statement:
      "Gate lantern moves on two sensors of different physical kinds so humidity can't fool both.",
    kill_test:
      "Humid-room failures stay correlated across the two sensor kinds.",
    parents: [idea.id],
    origin: "Fixes the refuted two-sensor idea",
    authorization: ask,
  });
  const childRecord = (await f.store.records()).get(child.ideas[0].id)!;
  assert.deepEqual((childRecord.payload as any).parent_refs, [
    { id: idea.id, revision: failed.idea.revision },
  ]);
});

test("a premise change flags the idea until it is looked at again, and export carries everything", async () => {
  const { f, ideas, idea } = await setup("idea-premise");
  await forge(f, "knowledge:handling", (r) => {
    (r.payload as any).summary = "Revised summary of the handling rule.";
  });
  const listed: any = await ideas.call({ action: "list" });
  assert.match(listed.briefing, /a premise changed since it was written/);
  assert.match(listed.briefing, /1 with a changed premise/);
  const revised: any = await ideas.call({
    action: "revise",
    idea: idea.id,
    reason: "Still follows from the revised handling rule",
    authorization: "Check the idea again",
  });
  assert.match(revised.briefing, /knowledge:handling@1 → knowledge:handling@2/);
  const after: any = await ideas.call({ action: "list" });
  assert.doesNotMatch(after.briefing, /premise changed/);

  const exported: any = await ideas.call({ action: "export" });
  assert.equal(exported.count, 1);
  const file = await readJson<any>(exported.path);
  assert.equal(file.format, "know-fu-ideas-1");
  const item = file.ideas[0];
  assert.equal(item.statement, draft.statement);
  assert.equal(item.ratings.originality.level, "medium");
  assert.ok(item.premises.some((p: any) => p.ref === "knowledge:handling@2"));
  assert.ok(item.premises.every((p: any) => p.current));
  await fs.rm(exported.path);
});

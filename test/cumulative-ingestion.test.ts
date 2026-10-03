import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import * as fs from "node:fs/promises";
import { published, FIX } from "./helpers.js";
import { Jobs } from "../src/jobs.js";
import { Reading } from "../src/reading.js";
import {
  atomic,
  hash,
  json,
  key,
  objectPath,
  readJson,
  ref,
} from "../src/core.js";
import type { RecordData } from "../src/core.js";

async function stagedChange() {
  const f = await published("cumulative-reweave"),
    jobs = new Jobs(f.store);
  const created = await jobs.ingest({
    paths: [path.join(FIX, "sources/handbook.md")],
    module: "workshop",
    domains: ["fictional_workshop"],
    idempotency_key: "cumulative-test",
    authorization: "Exercise the fictional ingestion protocol",
  });
  const id = created.job.job_id,
    job = await jobs.load(id);
  job.stage = "reweave";
  for (const unit of job.coverage) {
    unit.converted = "complete";
    unit.read = "complete";
    unit.integrated = "complete";
    unit.checked = "complete";
    unit.gaps = [];
  }
  await jobs.save(job);
  const old = f.records.find((r) => r.id === "relationship:limits")!;
  const link: RecordData = {
    ...old,
    id: "relationship:new-caveat",
    title: "A newly learned caveat",
    change_reason: "New fictional evidence qualifies an earlier account",
  };
  await atomic(
    path.join(jobs.jobPath(id), "staged.json"),
    json({
      records: [link],
      bodies: {},
      local_refs: {},
      proposal_hash: "fixture",
    }),
  );
  return { ...f, jobs, id, link };
}

test("new material relationships mark the existing explanation, teaching and question chain for reassessment", async () => {
  const f = await published("cumulative-impact"),
    old = f.records.find((r) => r.id === "relationship:limits")!;
  const link: RecordData = {
    ...old,
    id: "relationship:new-caveat",
    title: "Later qualifying evidence",
  };
  const result = await f.store.publish(
    [link],
    {},
    await f.store.current(),
    "Additional evidence",
    f.scope,
  );
  for (const id of [
    "knowledge:handling",
    "learning:primer",
    "learning:near-miss",
    "question:resolve-valve",
  ])
    assert(
      result.impacts.some((x) => x.record_ref.id === id),
      id,
    );
  const primer = await new Reading(f.store).read({
    kind: "account",
    record_ref: { id: "learning:primer", revision: 1 },
  });
  assert.equal(primer.candidates[0].freshness, "pending_reassessment");
  assert.equal(
    (await f.store.exact({ id: "knowledge:handling", revision: 1 })).revision,
    1,
  );
});

test("rebasing preserves unfinished source work and reopens later reassessment", async () => {
  const f = await stagedChange();
  const original = await f.jobs.load(f.id);
  original.stage = "reconstruct";
  original.coverage[0].read = "pending";
  original.coverage[0].integrated = "pending";
  await f.jobs.save(original);
  const newer = await f.store.publish(
    [],
    {},
    await f.store.current(),
    "Unrelated concurrent publication",
    f.scope,
  );
  const rebased = await f.jobs.action(f.id, "rebase");
  assert.equal(rebased.job.base_release, newer.release_id);
  assert.equal(rebased.job.stage, "reconstruct");
  assert.equal(rebased.job.coverage[0].read, "pending");
  await f.jobs.submit(f.id, {
    step_id: "read-after-rebase",
    stage: "reconstruct",
    summary: "The actual source reading can still be completed after rebasing.",
    coverage: original.coverage.map((u) => ({
      unit_id: u.unit_id,
      status: "complete",
    })),
  });
  assert.equal((await f.jobs.load(f.id)).stage, "integrate");
  const checked = await f.jobs.load(f.id);
  checked.stage = "publish";
  await f.jobs.save(checked);
  const reopened = await f.jobs.action(f.id, "rebase");
  assert.equal(reopened.job.stage, "reweave");
});

test("reweaving cannot claim reaffirmation without a durable revision; partial decisions keep the stage open", async () => {
  const f = await stagedChange();
  const plan = await f.jobs.reweavePlan(f.id),
    target = plan.targets.find(
      (t) => t.record_ref.id === "knowledge:handling",
    )!;
  await assert.rejects(
    f.jobs.submit(f.id, {
      step_id: "unrecorded",
      stage: "reweave",
      summary:
        "Attempt to claim reaffirmation without preserving its reassessment.",
      resolutions: [
        {
          record_ref: target.record_ref,
          decision: "reaffirmed",
          rationale: "Claiming a review that has no staged canonical revision.",
        },
      ],
    }),
    { code: "REASSESSMENT_INCOMPLETE" },
  );
  const partial = await f.jobs.submit(f.id, {
    step_id: "one-pending",
    stage: "reweave",
    summary:
      "This affected account remains pending a substantive follow-up review.",
    resolutions: [
      {
        record_ref: target.record_ref,
        decision: "pending",
        rationale:
          "The fictional reviewer has not yet resolved the new evidence.",
      },
    ],
  });
  assert.equal(partial.job.stage, "reweave");
  const remaining = (await f.jobs.reweavePlan(f.id)).targets.filter(
    (t) => t.resolution === "unassessed",
  );
  const completed = await f.jobs.submit(f.id, {
    step_id: "remaining-pending",
    stage: "reweave",
    summary:
      "Remaining affected records are explicitly unresolved, not silently marked current.",
    resolutions: remaining.map((t) => ({
      record_ref: t.record_ref,
      decision: "pending" as const,
      rationale:
        "Preserve the unresolved consequence for a later authorized assessment.",
    })),
  });
  assert.equal(completed.job.stage, "compile");
});

test("a changed staged caveat invalidates old reassessment decisions before publication", async () => {
  const f = await stagedChange();
  const plan = await f.jobs.reweavePlan(f.id);
  await f.jobs.submit(f.id, {
    step_id: "pending",
    stage: "reweave",
    summary:
      "Record the unresolved effect of the new caveat throughout the existing account.",
    resolutions: plan.targets.map((t) => ({
      record_ref: t.record_ref,
      decision: "pending" as const,
      rationale:
        "The new material caveat has not yet been resolved in this account.",
    })),
  });
  await f.jobs.submit(f.id, {
    step_id: "compile",
    stage: "compile",
    summary:
      "The original prose remains preserved and its unresolved status is explicit.",
  });
  await assert.rejects(
    f.jobs.submit(f.id, {
      step_id: "check-incomplete",
      stage: "check",
      summary: "Check lacks an explanation of what understanding changed.",
      capability: "not_assessed",
    }),
    { code: "VALIDATION_FAILED" },
  );
  await f.jobs.submit(f.id, {
    step_id: "check",
    stage: "check",
    summary:
      "Check preserves the new caveat and openly leaves affected explanations pending.",
    capability: "not_assessed",
    understanding_change: {
      added: ["A new material caveat was recorded."],
      revised_refs: [],
      unresolved: ["Earlier explanations await review."],
      checks: [],
    },
  });
  const staged = await readJson(path.join(f.jobs.jobPath(f.id), "staged.json"));
  staged.records[0].payload.rationale =
    "A different substantive caveat replaced the reviewed staging content.";
  await atomic(path.join(f.jobs.jobPath(f.id), "staged.json"), json(staged));
  await assert.rejects(f.jobs.publish(f.id), {
    code: "REASSESSMENT_INCOMPLETE",
  });
  assert(
    (await f.jobs.reweavePlan(f.id)).targets.some(
      (t) => t.resolution === "unassessed",
    ),
  );
});

test("a canonical reaffirmation can be checked and the ingestion report preserves unresolved dependents", async () => {
  const f = await stagedChange();
  const old = f.records.find((r) => r.id === "knowledge:handling")!;
  const body =
    (await f.store.body(old)) +
    "\nThe additional caveat was assessed; the stated dry-room boundary remains required.\n";
  const revised = {
    ...old,
    revision: 2,
    change_reason:
      "Reaffirmed the original conditions after checking the additional evidence",
    body: {
      path: objectPath({ id: old.id, revision: 2 }) + "/body.md",
      sha256: hash(body),
    },
  };
  await atomic(
    path.join(f.jobs.jobPath(f.id), "staged.json"),
    json({
      records: [f.link, revised],
      bodies: { [key(revised)]: body },
      local_refs: {},
      proposal_hash: "fixture",
    }),
  );
  const plan = await f.jobs.reweavePlan(f.id);
  await f.jobs.submit(f.id, {
    step_id: "review",
    stage: "reweave",
    summary:
      "Reaffirm the primary explanation while preserving unresolved teaching consequences.",
    resolutions: plan.targets.map((t) => ({
      record_ref: t.record_ref,
      decision:
        t.record_ref.id === old.id
          ? ("reaffirmed" as const)
          : ("pending" as const),
      rationale:
        "The primary account was assessed; dependent teaching still needs its own review.",
    })),
  });
  await f.jobs.submit(f.id, {
    step_id: "compile",
    stage: "compile",
    summary:
      "Persist the reassessed account and preserve the original authored revision.",
  });
  await f.jobs.submit(f.id, {
    step_id: "check",
    stage: "check",
    summary:
      "The synthetic application still requires the original conjunction and its limits.",
    capability: "checked",
    understanding_change: {
      added: [],
      no_new_supported_understanding:
        "The additional caveat confirms the existing boundary without adding a new supported rule.",
      revised_refs: [ref(revised)],
      unresolved: ["Dependent teaching requires follow-up."],
      checks: [
        "The synthetic conjunction and permission-limit check remains satisfied.",
      ],
    },
  });
  const result = await f.jobs.publish(f.id);
  assert.equal(
    result.understanding!.understanding_change.revised_refs[0].revision,
    2,
  );
  assert(
    result.understanding!.pending_reassessments.some(
      (r: any) => r.record_ref.id === "learning:primer",
    ),
  );
  assert.equal((await f.store.read(ref(old))).body, f.bodies[key(old)]);
  assert.equal(
    (await readJson(path.join(f.jobs.jobPath(f.id), "ingestion-report.json")))
      .capability,
    "checked",
  );
  await fs.unlink(path.join(f.jobs.jobPath(f.id), "ingestion-report.json"));
  const recovered = await f.jobs.publish(f.id);
  assert.equal(recovered.recovered, true);
  assert.deepEqual(recovered.understanding, result.understanding);
  assert.deepEqual(
    await readJson(path.join(f.jobs.jobPath(f.id), "ingestion-report.json")),
    result.understanding,
  );
});

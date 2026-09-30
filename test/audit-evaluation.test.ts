import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import * as fs from "node:fs/promises";
import { published } from "./helpers.js";
import { Evaluation } from "../src/evaluation.js";
import { Retrieval } from "../src/retrieval.js";
import { atomic, json, validate, readJson } from "../src/core.js";

const cases = [
  {
    case_id: "one",
    prompt: "What does READY mean?",
    query: "READY",
    rubric: "Amber badge and closed valve.",
    source_refs: [{ id: "source:handbook", revision: 1 }],
    source_grounding: "The fictional handbook",
    held_out: true,
  },
];
const validGrade = {
  verdict: "pass",
  reasons: ["Both conditions are present."],
  citation_errors: [],
  rubric_errors: [],
  source_errors: [],
  uncertainty: [],
};
async function setup() {
  const f = await published("audit-evaluation"),
    state = f.store.p("evaluation-state");
  const evaluation = new Evaluation(f.store, new Retrieval(f.store), state);
  // Isolated stub calls exercise orchestration, not model quality or real isolation.
  await atomic(
    path.join(state, "evaluation-isolation.json"),
    json({
      verified: true,
      mode: "native_commands_denied_input_only",
      fixture: true,
    }),
  );
  return { ...f, evaluation, state };
}

test("evaluation rejects changed frozen cases before any model call", async () => {
  const { evaluation } = await setup();
  const manifest = await evaluation.prepare(cases, "fixture-model", ["no_kb"]);
  await atomic(
    path.join(evaluation.dir(manifest.run_id), "private/cases.json"),
    json([{ ...cases[0], rubric: "Changed after freezing" }]),
  );
  let calls = 0;
  evaluation.isolated = async () => {
    calls++;
    return { answer: "stub", elapsed_ms: 0, events: "", usage: null };
  };
  await assert.rejects(() => evaluation.run(manifest.run_id), {
    code: "VALIDATION_FAILED",
  });
  assert.equal(calls, 0);
});

test("malformed grading leaves an incomplete run with retained raw evidence and a valid manifest", async () => {
  const { evaluation } = await setup();
  const manifest = await evaluation.prepare(cases, "fixture-model", ["no_kb"]);
  evaluation.isolated = async () => ({
    answer: "not JSON; no verdict",
    elapsed_ms: 0,
    events: "",
    usage: null,
  });
  const report = await evaluation.run(manifest.run_id);
  assert.equal(report.manifest.state, "incomplete");
  assert.equal(report.results[0].state, "failed");
  await validate("evaluation-run", report.manifest);
  assert(
    (await fs.readdir(path.join(evaluation.dir(manifest.run_id), "attempts")))
      .length > 0,
  );
});

test("valid grading completes once and resumes without repeating successful calls", async () => {
  const { evaluation } = await setup();
  const manifest = await evaluation.prepare(cases, "fixture-model", ["no_kb"]);
  let calls = 0;
  evaluation.isolated = async () => ({
    answer: ++calls % 2 ? "Amber badge AND closed valve." : json(validGrade),
    elapsed_ms: 0,
    events: "",
    usage: null,
  });
  const report = await evaluation.run(manifest.run_id);
  assert.equal(report.manifest.state, "complete");
  assert.equal(report.results[0].grade.verdict, "pass");
  await validate("evaluation-run", report.manifest);
  await evaluation.run(manifest.run_id);
  assert.equal(calls, 2);
});

test("evaluation rejects empty comparisons, duplicate cases and changed frozen model settings", async () => {
  const { evaluation } = await setup();
  await assert.rejects(() => evaluation.prepare(cases, "fixture-model", []), {
    code: "VALIDATION_FAILED",
  });
  await assert.rejects(
    () => evaluation.prepare([...cases, ...cases], "fixture-model", ["no_kb"]),
    { code: "VALIDATION_FAILED" },
  );
  const manifest = await evaluation.prepare(cases, "fixture-model", ["no_kb"]);
  await atomic(
    path.join(evaluation.dir(manifest.run_id), "manifest.json"),
    json({ ...manifest, model: "changed-model" }),
  );
  await assert.rejects(() => evaluation.run(manifest.run_id), {
    code: "VALIDATION_FAILED",
  });
});

test("resumed evaluations reject edited successful outcomes against their attempt receipts", async () => {
  const { evaluation } = await setup();
  const manifest = await evaluation.prepare(cases, "fixture-model", ["no_kb"]);
  let calls = 0;
  evaluation.isolated = async () => ({
    answer: ++calls % 2 ? "Amber badge AND closed valve." : json(validGrade),
    elapsed_ms: 0,
    events: "",
    usage: null,
  });
  await evaluation.run(manifest.run_id);
  const file = path.join(evaluation.dir(manifest.run_id), "manifest.json"),
    changed = await readJson(file);
  changed.results[0].answer = "Altered successful answer";
  await atomic(file, json(changed));
  await assert.rejects(() => evaluation.run(manifest.run_id), {
    code: "VALIDATION_FAILED",
  });
  assert.equal(calls, 2);
});

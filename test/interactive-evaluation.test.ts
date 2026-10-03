import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { published } from "./helpers.js";
import { EvaluationReader } from "../src/evaluation-reader.js";
import type { ReaderSessionConfig } from "../src/evaluation-reader.js";
import { Reading } from "../src/reading.js";
import { Evaluation } from "../src/evaluation.js";
import { isolationFingerprint } from "../src/evaluation-codex.js";
import { Retrieval } from "../src/retrieval.js";
import { atomic, json, readJson, ref } from "../src/core.js";

async function session(max_calls = 10, max_rendered_characters = 100000) {
  const f = await published("interactive-reader");
  const config: ReaderSessionConfig = {
    interface_version: "1.0.0",
    root: f.store.root,
    project: f.store.project,
    ledger_root: f.store.ledgerRoot,
    release_id: (await f.store.current())!,
    scope: f.scope,
    graph: false,
    purpose: "apply",
    trace_directory: f.store.p("reader-trace"),
    max_calls,
    max_rendered_characters,
  };
  return {
    ...f,
    config,
    reader: new EvaluationReader(
      config,
      new Reading(f.store, {
        fresh: async () => false,
        receipt: async () => null,
      } as any),
    ),
  };
}
const handling = { id: "knowledge:handling", revision: 1 };

test("the reader exposes only pinned published operations and cannot override its binding", async () => {
  const { reader } = await session();
  for (const request of [
    {
      kind: "account",
      record_ref: handling,
      scope: { read_modules: ["other"] },
      reason: "Try a broader scope",
    },
    {
      kind: "account",
      record_ref: handling,
      release_id: "other",
      reason: "Try another release",
    },
    {
      kind: "unit",
      job_id: "private",
      unit_id: "hidden",
      reason: "Try unpublished material",
    },
    {
      kind: "guide",
      name: "operations",
      reason: "Try a nonresearch tool path",
    },
  ])
    await assert.rejects(reader.call("kb_read", request), {
      code: "SCOPE_DENIED",
    });
  await assert.rejects(reader.call("kb_propose", { reason: "Try a write" }), {
    code: "SCOPE_DENIED",
  });
  assert.equal(reader.snapshot().denied_calls, 5);
});

test("chosen accounts can be batched, repeated prose is deduplicated, and unresolved reads stay visible", async () => {
  const { reader } = await session();
  const first = await reader.call("kb_read", {
    kind: "account",
    record_ref: handling,
    reason: "Inspect the procedure",
  });
  assert(reader.snapshot().unmet_required_reads.length > 0);
  const needed = first.result.necessary_reading.map((r: any) => r.record_ref);
  const batch = await reader.call("kb_read", {
    kind: "accounts",
    record_refs: needed,
    reason: "Resolve the identified conditions and disagreement together",
  });
  assert.equal(batch.result.contents.length, needed.length);
  assert.equal(reader.snapshot().unmet_required_reads.length, 0);
  const repeated = await reader.call("kb_read", {
    kind: "accounts",
    record_refs: [handling, needed[0]],
    reason: "Recheck already inspected accounts",
  });
  assert.equal(repeated.result.contents.length, 0);
  assert.equal(repeated.result.previously_read.length, 2);
  assert.equal(reader.snapshot().full_reads.length, needed.length + 1);
  assert(reader.snapshot().rendered_characters > 0);
});

test("simultaneous calls cannot outrun the enforced call budget", async () => {
  const { reader } = await session(1);
  const attempts = await Promise.allSettled(
    [1, 2].map(() =>
      reader.call("kb_read", {
        kind: "account",
        record_ref: handling,
        reason: "Inspect one procedure",
      }),
    ),
  );
  assert.equal(attempts.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal(reader.snapshot().calls, 2);
  assert.equal(reader.snapshot().denied_calls, 1);
});

test("an evidence budget rejects the complete response without silently cutting a reasoning unit", async () => {
  const { reader } = await session(5, 1000);
  await assert.rejects(
    reader.call("kb_read", {
      kind: "account",
      record_ref: handling,
      reason: "Inspect a large response",
    }),
    { code: "BUDGET_EXHAUSTED" },
  );
  assert.equal(reader.snapshot().full_reads.length, 0);
  assert.equal(reader.snapshot().rendered_characters, 0);
});

test("even repeated reads recheck current release and withdrawal state", async () => {
  const f = await session();
  await f.reader.call("kb_read", {
    kind: "account",
    record_ref: handling,
    reason: "Initial read",
  });
  const old = f.records.find((r) => r.id === "source:handbook")!;
  await f.store.publish(
    [{ ...old, revision: 2, lifecycle: "withdrawn" }],
    {},
    await f.store.current(),
    "Withdraw fixture support",
    f.scope,
  );
  await assert.rejects(
    f.reader.call("kb_read", {
      kind: "account",
      record_ref: handling,
      reason: "Repeat after a correction",
    }),
    { code: "REVISION_CONFLICT" },
  );
});

test("version 3 evaluations freeze budgets and preserve separate quality dimensions and reading receipts on resume", async () => {
  const f = await published("interactive-evaluation"),
    state = f.store.p("evaluation-state");
  const evaluation = new Evaluation(f.store, new Retrieval(f.store), state);
  await atomic(
    path.join(state, "evaluation-isolation.json"),
    json({
      verified: true,
      mode: "native_commands_denied_input_only",
      policy_fingerprint: await isolationFingerprint(false),
      fixture: true,
    }),
  );
  const readerReceipt = {
    verified: true,
    mode: "native_commands_denied_scoped_mcp",
    configuration_family: "evaluation-reader-v1",
    policy_fingerprint: await isolationFingerprint(true),
    fixture: true,
  };
  await atomic(
    path.join(state, "evaluation-reader-isolation.json"),
    json({ ...readerReceipt, policy_fingerprint: "stale" }),
  );
  const cases = [
    {
      case_id: "condition",
      prompt: "When does the handbook permit moving?",
      query: "lantern",
      rubric: "Keep all conditions",
      source_refs: [{ id: "source:handbook", revision: 1 }],
      source_grounding: "Fictional handbook lines 2–5",
      held_out: false,
    },
  ];
  const manifest = await evaluation.prepare(
    cases,
    "fixture-model",
    ["progressive_prose"],
    { budget: { input_tokens: 1000 }, repetitions: 2 },
  );
  assert.equal(manifest.version, 3);
  assert.equal(manifest.case_ids.length, 2);
  await assert.rejects(evaluation.run(manifest.run_id), {
    code: "ISOLATION_FAILED",
  });
  await atomic(
    path.join(state, "evaluation-reader-isolation.json"),
    json(readerReceipt),
  );
  let calls = 0;
  evaluation.interactive = async (
    _work,
    _state,
    _prompt,
    _model,
    _output,
    configPath,
  ) => {
    calls++;
    const config = await readJson<ReaderSessionConfig>(configPath);
    const reader = new EvaluationReader(
      config,
      new Reading(f.store, {
        fresh: async () => false,
        receipt: async () => null,
      } as any),
    );
    await reader.call("kb_read", {
      kind: "account",
      record_ref: handling,
      reason: "Inspect exact account",
    });
    return {
      answer:
        "Dry room, amber badge, closed valve; moving does not permit opening.",
      elapsed_ms: 0,
      usage: { input_tokens: 1200 },
      events: "",
    };
  };
  const dimensions = Object.fromEntries(
    [
      "correctness",
      "completeness",
      "decisive_conditions",
      "citation_support",
      "coherent_teaching",
      "useful_synthesis",
      "justified_inference",
      "gap_recognition",
    ].map((name) => [
      name,
      {
        verdict: "pass",
        rationale: "Fixture orchestration check, not a model-quality judgment.",
      },
    ]),
  );
  evaluation.isolated = async () => ({
    answer: json({
      verdict: "pass",
      reasons: ["Fixture result"],
      citation_errors: [],
      rubric_errors: [],
      source_errors: [],
      uncertainty: [],
      dimensions,
      decisive_failures: [],
    }),
    elapsed_ms: 0,
    usage: null,
    events: "",
  });
  const report = await evaluation.run(manifest.run_id);
  assert.equal(report.manifest.state, "complete");
  assert.equal(report.results[0].budget_status, "exceeded");
  assert(report.results[0].reading.unmet_required_reads.length > 0);
  assert.equal(
    report.results[0].grade.dimensions.decisive_conditions.verdict,
    "pass",
  );
  assert.equal(report.results[0].case_group, "condition");
  await evaluation.run(manifest.run_id);
  assert.equal(calls, 2);
});

test("additional grader passages require destination authorization for the exact original source", async () => {
  const f = await published("grading-authorization"),
    evaluation = new Evaluation(
      f.store,
      new Retrieval(f.store),
      f.store.p("evaluation-state"),
    );
  const cases = [
    {
      case_id: "source-check",
      prompt: "Explain the condition",
      query: "condition",
      rubric: "Keep the valve limit",
      source_refs: [{ id: "source:handbook", revision: 1 }],
      source_grounding: "Handbook lines 2–3",
      held_out: false,
      grading_refs: [{ id: "passage:handling-rule", revision: 1 }],
    },
  ];
  await assert.rejects(
    evaluation.prepare(cases, "fixture-model", ["no_kb"], {}),
    { code: "AUTHORIZATION_REQUIRED" },
  );
  await assert.rejects(
    evaluation.prepare(cases, "fixture-model", ["no_kb"], {
      grading_data_authorization: {
        destination: "configured_codex_service",
        basis: "explicit_user_permission",
        statement:
          "Synthetic test authorization for orchestration only; no real model call.",
        source_refs: [],
        evidence_hashes: [],
      },
    }),
    { code: "AUTHORIZATION_REQUIRED" },
  );
  const manifest = await evaluation.prepare(cases, "fixture-model", ["no_kb"], {
    grading_data_authorization: {
      destination: "configured_codex_service",
      basis: "explicit_user_permission",
      statement:
        "Synthetic test authorization for orchestration only; no real model call.",
      source_refs: cases[0].source_refs,
      evidence_hashes: [],
    },
  });
  assert.equal(manifest.version, 3);
  assert.equal(
    manifest.grading_data_authorization!.source_refs[0].id,
    "source:handbook",
  );
});

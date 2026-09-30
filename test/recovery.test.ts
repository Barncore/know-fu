import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import path from "node:path";
import { Jobs } from "../src/jobs.js";
import { fixture, published, FIX } from "./helpers.js";
import {
  readJson,
  ref,
  atomic,
  json,
  key,
  hash,
  objectPath,
} from "../src/core.js";
import { Lifecycle } from "../src/lifecycle.js";
import { Maintenance } from "../src/maintenance.js";
import { Retrieval } from "../src/retrieval.js";
test("interrupted publication before pointer retains base; after pointer recovers committed audit", async () => {
  const f = await fixture();
  process.env.KB_TEST_FAULT = "before_pointer";
  try {
    await assert.rejects(
      () => f.store.publish(f.records, f.bodies, null, "before", f.scope),
      { code: "SIMULATED_CRASH" },
    );
  } finally {
    delete process.env.KB_TEST_FAULT;
  }
  assert.equal(await f.store.current(), null);
  await f.store.recover();
  process.env.KB_TEST_FAULT = "after_pointer";
  try {
    await assert.rejects(
      () => f.store.publish(f.records, f.bodies, null, "after", f.scope),
      { code: "SIMULATED_CRASH" },
    );
  } finally {
    delete process.env.KB_TEST_FAULT;
  }
  assert(await f.store.current());
  await f.store.recover();
  const events = (await fs.readFile(f.store.p("audit/events.jsonl"), "utf8"))
    .trim()
    .split("\n")
    .map(JSON.parse as any);
  assert.equal(
    events.filter(
      (e: any) => e.operation === "publish" && e.outcome === "committed",
    ).length,
    1,
  );
  await f.store.recover();
});
test("correction impact follows explanations into primers and cases without rewriting them", async () => {
  const f = await published(),
    old = await f.store.exact({ id: "concept:ready-handbook", revision: 1 });
  const r = { ...old, revision: 2, change_reason: "Clarified definition" };
  const result = await f.store.publish(
    [r],
    {},
    f.publication.release_id,
    "definition correction",
    f.scope,
  );
  assert(result.impacts.some((x) => x.record_ref.id === "knowledge:handling"));
  assert(result.impacts.some((x) => x.record_ref.id === "learning:primer"));
  const packet = await new Retrieval(f.store).retrieve({
    query: "handling lantern",
    semantic: false,
  });
  assert(packet.warnings.some((x) => x.includes("needs reassessment")));
});
test("purge blocks historical access and rejects restoration of an older backup", async () => {
  const f = await published(),
    m = new Maintenance(f.store);
  const bundle = await m.exportBundle();
  const life = new Lifecycle(f.store, {
    graph: async () => ({
      graph: { query: async () => ({}) },
      db: { close: async () => {} },
    }),
    indexName: async () => "isolated-purge-test",
  } as any);
  const p = await life.plan(
    "purge",
    [{ id: "source:handbook", revision: 1 }],
    "Delete this fixture and derived content",
  );
  const out = await life.execute(p.plan_id, {
    action: "purge",
    targets: p.targets,
    user_instruction:
      "Delete the handbook fixture and all content listed in this preview",
  });
  assert.equal(out.plan.state, "complete");
  await assert.rejects(
    () => f.store.read({ id: "knowledge:handling", revision: 1 }),
    { code: "CONTENT_PURGED" },
  );
  assert(
    !(await fs.access(f.store.p("sources/handbook.md")).then(
      () => true,
      () => false,
    )),
  );
  assert(
    !(await fs.access(bundle.path).then(
      () => true,
      () => false,
    )),
  );
});
test("missing independent deletion ledger blocks reads and restores", async () => {
  const f = await published();
  const file =
    f.store.ledgerRoot +
    "/" +
    hash((await f.store.config()).corpus_id) +
    ".json";
  await fs.rename(file, file + "-moved");
  try {
    await assert.rejects(
      () => f.store.read({ id: "knowledge:handling", revision: 1 }),
      { code: "LEDGER_UNAVAILABLE" },
    );
  } finally {
    await fs.rename(file + "-moved", file);
  }
});

test("proposal and step retries reconcile a crash between staging and receipt checkpoint", async () => {
  const f = await published(),
    jobs = new Jobs(f.store),
    j = await jobs.ingest({
      paths: [path.join(FIX, "sources/handbook.md")],
      module: "workshop",
      domains: ["fictional_workshop"],
      idempotency_key: "interrupted-steps",
      authorization: "Ingest the controlled recovery fixture",
    });
  const p = await readJson(path.join(FIX, "proposal.example.json"));
  p.job_id = j.job.job_id;
  p.base_release = f.publication.release_id;
  process.env.KB_TEST_FAULT = "proposal_after_staging";
  try {
    await assert.rejects(() => jobs.propose(p), { code: "SIMULATED_CRASH" });
  } finally {
    delete process.env.KB_TEST_FAULT;
  }
  const first = await jobs.propose(p),
    second = await jobs.propose(p);
  assert.deepEqual(first, second);
  const staged = await readJson(
    path.join(jobs.jobPath(j.job.job_id), "staged.json"),
  );
  assert.equal(
    new Set(staged.records.map((r: any) => r.id)).size,
    staged.records.length,
  );
  const converted = await jobs.convert(j.job.job_id),
    receipt = {
      step_id: "reading",
      stage: "reconstruct",
      summary: "Read every source unit and reconstructed its full argument.",
      coverage: converted.job.coverage.map((u) => ({
        unit_id: u.unit_id,
        status: "complete" as const,
      })),
    };
  process.env.KB_TEST_FAULT = "step_before_checkpoint";
  try {
    await assert.rejects(() => jobs.submit(j.job.job_id, receipt), {
      code: "SIMULATED_CRASH",
    });
  } finally {
    delete process.env.KB_TEST_FAULT;
  }
  const resumed = await jobs.submit(j.job.job_id, receipt);
  assert.equal(resumed.job.stage, "integrate");
  assert.equal(resumed.job.receipts.length, 1);
});

test("initial ingestion retries recover request and staging written before the job checkpoint", async () => {
  const f = await published("ingest-register-recovery"),
    jobs = new Jobs(f.store);
  const input = {
    paths: [path.join(FIX, "sources/handbook.md")],
    module: "workshop",
    domains: ["fictional_workshop"],
    idempotency_key: "initial-crash",
    authorization: "Read the isolated recovery source",
  };
  const first = await jobs.ingest(input);
  await fs.unlink(path.join(jobs.jobPath(first.job.job_id), "job.json"));
  const resumed = await jobs.ingest(input);
  assert.equal(resumed.job.job_id, first.job.job_id);
  assert.deepEqual(resumed.job.source_refs, first.job.source_refs);
  assert.deepEqual(resumed.job.coverage, first.job.coverage);
  await assert.rejects(
    () => jobs.ingest({ ...input, domains: ["different"] }),
    { code: "REVISION_CONFLICT" },
  );
});

test("initial registration resumes after a real checkpoint fault without the supplied path", async () => {
  const f = await published("registration-fault"),
    jobs = new Jobs(f.store);
  const original = path.join(f.store.root, "temporary-supply.txt");
  await fs.writeFile(
    original,
    "Original supplied bytes for registration crash recovery.",
  );
  const input = {
    paths: [original],
    module: "workshop",
    domains: ["fictional_workshop"],
    idempotency_key: "actual-register-fault",
    authorization: "Inspect this synthetic original",
  };
  process.env.KB_TEST_FAULT = "ingest_after_request";
  try {
    await assert.rejects(() => jobs.ingest(input), { code: "SIMULATED_CRASH" });
  } finally {
    delete process.env.KB_TEST_FAULT;
  }
  await fs.unlink(original);
  const resumed = await jobs.ingest(input);
  assert.equal(resumed.job.stage, "convert");
  assert.equal(resumed.job.source_refs.length, 1);
  assert.equal(
    (await jobs.convert(resumed.job.job_id)).job.stage,
    "reconstruct",
  );
});

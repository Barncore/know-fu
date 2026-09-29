import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import path from "node:path";
import { fixture, published, FIX } from "./helpers.js";
import {
  hash,
  key,
  readJson,
  ref,
  objectPath,
  json,
  condition,
  atomic,
} from "../src/core.js";
import { Retrieval } from "../src/retrieval.js";
import { Store } from "../src/store.js";
import { Jobs } from "../src/jobs.js";
import { Maintenance } from "../src/maintenance.js";
import { Lifecycle } from "../src/lifecycle.js";
test("canonical publication verifies original locators, bodies and immutable revisions", async () => {
  const f = await published();
  assert.equal((await f.store.records()).size, 25);
  const r = await f.store.read({ id: "knowledge:handling", revision: 1 });
  assert.match(r.body, /valve/);
  await fs.appendFile(f.store.p(r.record.body!.path), "unauthorized");
  await assert.rejects(() => f.store.read(ref(r.record)), {
    code: "VALIDATION_FAILED",
  });
});
test("dangling and wrong-family provenance never advances CURRENT", async () => {
  const f = await fixture();
  f.records.find((r) => r.id === "knowledge:handling")!.provenance.source_refs =
    [{ id: "concept:ready-handbook", revision: 1 }];
  await assert.rejects(
    () => f.store.publish(f.records, f.bodies, null, "invalid", f.scope),
    { code: "VALIDATION_FAILED" },
  );
  assert.equal(await f.store.current(), null);
});
test("competing publication from one base rejects stale writer", async () => {
  const f = await published();
  const old = await f.store.exact({
    id: "concept:ready-handbook",
    revision: 1,
  });
  const r = {
    ...old,
    revision: 2,
    change_reason: "Clarified source definition",
  };
  const results = await Promise.allSettled([
    f.store.publish([r], {}, f.publication.release_id, "one", f.scope),
    f.store.publish([r], {}, f.publication.release_id, "two", f.scope),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    (results.find((r) => r.status === "rejected") as PromiseRejectedResult)
      .reason.code,
    "REVISION_CONFLICT",
  );
});
test("source scope cannot leak multi-source judgment or excluded meanings", async () => {
  const f = await published();
  const narrow = {
    ...f.scope,
    source_refs: [{ id: "source:handbook", revision: 1 }],
  };
  const result = await new Retrieval(f.store).retrieve({
    query: "READY valve courier",
    scope: narrow,
    semantic: false,
  });
  assert(!result.items.some((r) => r.record_ref.id === "knowledge:courier"));
  assert(
    !result.items.some(
      (r) => r.record_ref.id === "judgment:readiness-conflict",
    ),
  );
  await assert.rejects(
    () =>
      new Store(f.store.root, "unbound", f.store.ledgerRoot).read({
        id: "knowledge:handling",
        revision: 1,
      }),
    { code: "SCOPE_DENIED" },
  );
});
test("material exception remains in packet despite a narrow relevance limit", async () => {
  const f = await published();
  const result = await new Retrieval(f.store).retrieve({
    query: "handbook permits moving lantern",
    semantic: false,
    limit: 1,
  });
  assert(
    result.items.some(
      (x) =>
        x.role === "qualification" ||
        x.record_ref.id === "passage:handling-limits",
    ),
  );
  assert.equal(result.freshness, "degraded");
  await assert.rejects(
    () =>
      new Retrieval(f.store).retrieve({
        query: "handling",
        graph_required: true,
      }),
    { code: "GRAPH_UNAVAILABLE" },
  );
});
test("semantic compiler resolves local names and never invents assessments", async () => {
  const f = await published();
  const p = await readJson(path.join(FIX, "proposal.example.json"));
  p.base_release = f.publication.release_id;
  const c = await f.store.compile(p);
  assert.equal(c.records.length, 2);
  assert.equal(c.records[0].assessments.evidence.level, "not_assessed");
  assert.equal((c.records[1].payload as any).object.id, c.records[0].id);
  p.items[1].payload.object = { local_ref: "missing" };
  await assert.rejects(() => f.store.compile(p), { code: "VALIDATION_FAILED" });
});
test("export and restore preserve canonical hashes in a path with spaces and Unicode", async () => {
  const f = await published();
  const m = new Maintenance(f.store),
    backup = await m.exportBundle();
  const target = f.store.root + " restored Ω";
  await m.restoreBundle(backup.path, target);
  const restored = new Store(target, f.store.project, f.store.ledgerRoot);
  assert.deepEqual(
    [...(await restored.records())].map(([id, r]) => [id, key(r)]),
    [...(await f.store.records())].map(([id, r]) => [id, key(r)]),
  );
  assert.equal(
    await restored.body(
      await restored.exact({ id: "knowledge:handling", revision: 1 }),
    ),
    f.bodies["knowledge:handling@1"],
  );
});
test("archive retains evidence access; withdrawal stops derived reliance; stale plans reject", async () => {
  const f = await published(),
    life = new Lifecycle(f.store);
  const target = [{ id: "source:handbook", revision: 1 }];
  const p = await life.plan(
    "archive",
    target,
    "Keep evidence but hide source from normal browsing",
  );
  await life.execute(p.plan_id, {
    action: "archive",
    targets: target,
    user_instruction: "Archive the supplied handbook source",
  });
  const r = await new Retrieval(f.store).retrieve({
    query: "handling lantern",
    semantic: false,
  });
  assert(r.items.some((i) => i.record_ref.id === "knowledge:handling"));
  await assert.rejects(
    () =>
      life.execute(p.plan_id, {
        action: "archive",
        targets: target,
        user_instruction: "Archive source",
      }),
    { code: "PLAN_STALE" },
  );
  const w = await life.plan(
    "withdraw",
    [{ id: "source:handbook", revision: 2 }],
    "Evidence has been withdrawn",
  );
  await life.execute(w.plan_id, {
    action: "withdraw",
    targets: w.targets,
    user_instruction: "Stop relying on the handbook",
  });
  const after = await new Retrieval(f.store).retrieve({
    query: "handling lantern",
    semantic: false,
  });
  assert(!after.items.some((i) => i.record_ref.id === "knowledge:handling"));
});
test("conditions preserve unknown context and units", () => {
  const expression = {
    dimension: "temperature",
    operator: "gt",
    value: 20,
    unit: "C",
  };
  assert.equal(
    condition(expression, {}, { temperature: { type: "number" } }),
    "unknown",
  );
  assert.equal(
    condition(
      expression,
      { temperature: { value: 90, unit: "F" } },
      { temperature: { type: "number" } },
    ),
    "unknown",
  );
  assert.equal(
    condition(
      expression,
      { temperature: { value: 21, unit: "C" } },
      { temperature: { type: "number" } },
    ),
    "true",
  );
});
test("conversion does not count as reading; receipts account for each source unit", async () => {
  const f = await fixture(),
    jobs = new Jobs(f.store);
  const input = {
    paths: [path.join(FIX, "sources/handbook.md")],
    module: "workshop",
    domains: ["fictional_workshop"],
    idempotency_key: "test-read",
    authorization: "Ingest the test handbook",
  };
  const registered = await jobs.ingest(input);
  const again = await jobs.ingest(input);
  assert.equal(registered.job.job_id, again.job.job_id);
  const converted = await jobs.convert(registered.job.job_id);
  assert(converted.job.coverage.every((u) => u.read === "pending"));
  await assert.rejects(() => jobs.publish(registered.job.job_id), {
    code: "VALIDATION_FAILED",
  });
  await jobs.action(registered.job.job_id, "cancel");
  await assert.rejects(
    () =>
      jobs.submit(registered.job.job_id, {
        step_id: "read",
        stage: "reconstruct",
        summary: "This source was read in its entirety.",
      }),
    { code: "VALIDATION_FAILED" },
  );
});

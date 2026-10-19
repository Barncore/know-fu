import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import * as fs from "node:fs/promises";
import { published } from "./helpers.js";
import { KnowledgeSystem } from "../src/api.js";

test("a long conversion keeps running after its MCP call returns, and kb_job next reports it", async () => {
  const f = await published("background-convert");
  const system = new KnowledgeSystem(f.store, { background: true });
  const file = f.store.p("../" + path.basename(f.store.root) + "-notice.md");
  await fs.writeFile(file, "# Notice\n\nRun the vent for ten minutes.\n");
  const created: any = await system.call("kb_ingest", {
    paths: [file],
    module: "workshop",
    domains: ["fictional_workshop"],
    idempotency_key: "background-convert",
    authorization: "Exercise background conversion",
  });
  const id = created.job.job_id;
  const real = system.jobs.convert.bind(system.jobs);
  let finish!: () => void;
  const gate = new Promise<void>((resolve) => (finish = resolve));
  system.jobs.convert = (async (...args: Parameters<typeof real>) => {
    await gate;
    return real(...args);
  }) as typeof real;
  const previous = process.env.KB_BACKGROUND_WAIT_MS;
  process.env.KB_BACKGROUND_WAIT_MS = "20";
  try {
    const first: any = await system.call("kb_job", {
      action: "convert",
      job_id: id,
    });
    assert.match(first.instruction, /still running in the background/);
    const again: any = await system.call("kb_job", {
      action: "convert",
      job_id: id,
    });
    assert.match(again.instruction, /didn't start another/);
    const next: any = await system.call("kb_job", {
      action: "next",
      job_id: id,
    });
    assert.match(next.instruction, /running in the background since/);
    finish();
    // The real conversion can take a few seconds when the whole suite runs at once.
    for (let i = 0; i < 500; i++) {
      const job: any = await system.call("kb_job", {
        action: "next",
        job_id: id,
      });
      if (job.job.stage !== "convert") {
        assert.doesNotMatch(job.instruction, /background/);
        return;
      }
      await new Promise((r) => setTimeout(r, 50));
    }
    assert.fail("conversion never finished");
  } finally {
    if (previous === undefined) delete process.env.KB_BACKGROUND_WAIT_MS;
    else process.env.KB_BACKGROUND_WAIT_MS = previous;
  }
});

test("a background conversion that fails after its call returned leaves the error on the job", async () => {
  const f = await published("background-convert-failure");
  const system = new KnowledgeSystem(f.store, { background: true });
  const file = f.store.p("../" + path.basename(f.store.root) + "-notice.md");
  await fs.writeFile(file, "# Notice\n\nRun the vent for ten minutes.\n");
  const created: any = await system.call("kb_ingest", {
    paths: [file],
    module: "workshop",
    domains: ["fictional_workshop"],
    idempotency_key: "background-convert-failure",
    authorization: "Exercise background conversion failure",
  });
  const id = created.job.job_id;
  const real = system.jobs.convert.bind(system.jobs);
  let fail!: () => void;
  const gate = new Promise<void>(
    (_, reject) => (fail = () => reject(new Error("converter crashed"))),
  );
  gate.catch(() => {});
  system.jobs.convert = (async () => {
    await gate;
  }) as any;
  const previous = process.env.KB_BACKGROUND_WAIT_MS;
  process.env.KB_BACKGROUND_WAIT_MS = "20";
  try {
    const first: any = await system.call("kb_job", {
      action: "convert",
      job_id: id,
    });
    assert.match(first.instruction, /still running in the background/);
    fail();
    let job: any;
    for (let i = 0; i < 200; i++) {
      job = (await system.call("kb_job", { action: "next", job_id: id })).job;
      if (job.error) break;
      await new Promise((r) => setTimeout(r, 25));
    }
    assert.equal(job.error?.code, "CONVERSION_FAILED");
    assert.match(job.error.message, /converter crashed/);
    // Converting again clears it and runs normally.
    system.jobs.convert = real;
    process.env.KB_BACKGROUND_WAIT_MS = "60000";
    const done: any = await system.call("kb_job", {
      action: "convert",
      job_id: id,
    });
    assert.equal(done.job.error, null);
    assert.notEqual(done.job.stage, "convert");
  } finally {
    if (previous === undefined) delete process.env.KB_BACKGROUND_WAIT_MS;
    else process.env.KB_BACKGROUND_WAIT_MS = previous;
  }
});

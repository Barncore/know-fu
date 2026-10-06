import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import path from "node:path";
import { FIX, published, readUnits } from "./helpers.js";
import { Jobs } from "../src/jobs.js";
import { agentName, readJson } from "../src/core.js";
import type { RecordData } from "../src/core.js";

async function source(
  f: Awaited<ReturnType<typeof published>>,
  name: string,
  text: string,
) {
  const file = f.store.p(`../${path.basename(f.store.root)}-${name}.md`);
  await fs.writeFile(file, text);
  return file;
}

async function converted(label: string) {
  const f = await published(label);
  const jobs = new Jobs(f.store);
  const file = await source(
    f,
    "long",
    Array.from({ length: 250 }, (_, i) => `Observation ${i}.`).join("\n"),
  );
  const created = await jobs.ingest({
    paths: [file],
    module: "workshop",
    domains: ["fictional_workshop"],
    idempotency_key: label,
    authorization: "Exercise read receipts",
  });
  const id = created.job.job_id;
  await jobs.convert(id);
  return { ...f, jobs, id, job: await jobs.load(id) };
}

test("a unit counts as read only once kb_read has served all of it", async () => {
  const f = await converted("read-receipts");
  const [first, second] = f.job.coverage;
  assert.ok(second, "the fixture needs at least two units");
  const submit = (step: string, coverage: any) =>
    f.jobs.submit(f.id, {
      step_id: step,
      stage: "reconstruct",
      summary: "Read the observations and reconstructed the list.",
      ...coverage,
    });
  // Nothing served yet: a blanket receipt is refused, and the unread units are named.
  await assert.rejects(
    submit("blanket", { coverage_all: { status: "complete" } }),
    (error: any) =>
      /hasn't served all of \d+ unit/.test(error.message) &&
      error.details.unread.includes(first.unit_id),
  );
  // Reading only the start, or skipping the middle, doesn't count.
  const total = (await f.jobs.readUnit(f.id, first.unit_id, 0, 10)).next_offset;
  assert.equal(total, 10);
  await assert.rejects(
    submit("start-only", {
      coverage: [{ unit_id: first.unit_id, status: "complete" }],
    }),
    /hasn't served all/,
  );
  let offset: number | null = 50;
  while (offset !== null)
    offset = (await f.jobs.readUnit(f.id, first.unit_id, offset, 32000))
      .next_offset;
  await assert.rejects(
    submit("skipped-middle", {
      coverage: [{ unit_id: first.unit_id, status: "complete" }],
    }),
    /hasn't served all/,
  );
  // Filling the gap completes the unit; an excluded unit needs only its reason.
  await f.jobs.readUnit(f.id, first.unit_id, 10, 40);
  await submit("first", {
    coverage: [{ unit_id: first.unit_id, status: "complete" }],
  });
  const rest = f.job.coverage.slice(1).map((u) => u.unit_id);
  await readUnits(f.jobs, f.id, rest.slice(1));
  await submit("rest", {
    coverage: [
      {
        unit_id: rest[0],
        status: "excluded",
        reason: "A repeated table of contents",
      },
      ...rest.slice(1).map((unit_id) => ({ unit_id, status: "complete" })),
    ],
  });
  const job = await f.jobs.load(f.id);
  assert.equal(job.stage, "integrate");
  const report = await (f.jobs as any).ingestionReport(
    job,
    await f.store.current(),
  );
  assert.deepEqual(report.reading, {
    units: job.coverage.length,
    excluded: 1,
    read_in_full: job.coverage.length - 1,
    ratio: 1,
  });
});

test("jobs from before read receipts keep working, and say reading wasn't tracked", async () => {
  const f = await converted("read-receipts-legacy");
  const job = await f.jobs.load(f.id);
  delete (job as any).read_receipts;
  await f.jobs.save(job);
  await f.jobs.submit(f.id, {
    step_id: "legacy",
    stage: "reconstruct",
    summary: "Read under the older workflow.",
    coverage_all: { status: "complete" },
  });
  const report = await (f.jobs as any).ingestionReport(
    await f.jobs.load(f.id),
    await f.store.current(),
  );
  assert.deepEqual(report.reading, { tracked: false });
});

test("provenance names the agent from KB_ACTOR, and jobs wait for the agent", async () => {
  const before = process.env.KB_ACTOR;
  try {
    delete process.env.KB_ACTOR;
    assert.equal(agentName(), "unspecified");
    process.env.KB_ACTOR = "Claude Code";
    assert.equal(agentName(), "unspecified");
    process.env.KB_ACTOR = "claude";
    assert.equal(agentName(), "claude");
    const f = await converted("actor");
    const sources = await readJson<RecordData[]>(
      path.join(f.jobs.jobPath(f.id), "sources.json"),
    );
    assert.equal(sources[0].provenance.actor, "claude");
    assert.equal(f.job.status, "waiting_for_agent");
  } finally {
    if (before === undefined) delete process.env.KB_ACTOR;
    else process.env.KB_ACTOR = before;
  }
});

test("a source's evidence family, independence and derivation are set when it's registered", async () => {
  const f = await published("families");
  const jobs = new Jobs(f.store);
  const book = await source(f, "book", "# A book\n\nThe whole argument.\n");
  const summary = await source(
    f,
    "summary",
    "# A summary\n\nThe argument, shorter.\n",
  );
  await assert.rejects(
    jobs.ingest({
      paths: [{ path: book, evidence_family: "Bad Family" }],
      module: "workshop",
      domains: ["fictional_workshop"],
      idempotency_key: "bad-family",
      authorization: "test",
    }),
    /short lowercase name/,
  );
  const first = await jobs.ingest({
    paths: [
      {
        path: book,
        evidence_family: "lantern-book",
        independence: "independent",
      },
    ],
    module: "workshop",
    domains: ["fictional_workshop"],
    idempotency_key: "book",
    authorization: "test",
  });
  const [registered] = await readJson<RecordData[]>(
    path.join(jobs.jobPath(first.job.job_id), "sources.json"),
  );
  assert.equal((registered.payload as any).evidence_family, "lantern-book");
  assert.equal((registered.payload as any).independence, "independent");
  // A summary of an unpublished source can't name it yet; one of a published source can.
  await assert.rejects(
    jobs.ingest({
      paths: [{ path: summary, derived_from: [registered.id] }],
      module: "workshop",
      domains: ["fictional_workshop"],
      idempotency_key: "summary-early",
      authorization: "test",
    }),
    /derived_from names registered sources/,
  );
  const handbook = (await f.store.records()).get("source:handbook")!;
  const derived = await jobs.ingest({
    paths: [
      {
        path: summary,
        evidence_family: "lantern-handbook",
        derived_from: [handbook.id],
      },
    ],
    module: "workshop",
    domains: ["fictional_workshop"],
    idempotency_key: "summary",
    authorization: "test",
  });
  const [summaryRecord] = await readJson<RecordData[]>(
    path.join(jobs.jobPath(derived.job.job_id), "sources.json"),
  );
  assert.equal((summaryRecord.payload as any).independence, "derived");
  assert.deepEqual((summaryRecord.payload as any).derived_from_sources, [
    { id: handbook.id, revision: handbook.revision },
  ]);
  // A published source keeps the family it was registered with.
  await assert.rejects(
    jobs.ingest({
      paths: [
        {
          path: path.join(FIX, "sources/handbook.md"),
          evidence_family: "someone-else",
        },
      ],
      module: "workshop",
      domains: ["fictional_workshop"],
      idempotency_key: "handbook-again",
      authorization: "test",
    }),
    /already registered with evidence family/,
  );
  // Plain paths still work, with the old defaults.
  const plain = await source(f, "plain", "# Plain\n\nNo family given.\n");
  const defaulted = await jobs.ingest({
    paths: [plain],
    module: "workshop",
    domains: ["fictional_workshop"],
    idempotency_key: "plain",
    authorization: "test",
  });
  const [plainRecord] = await readJson<RecordData[]>(
    path.join(jobs.jobPath(defaulted.job.job_id), "sources.json"),
  );
  assert.match((plainRecord.payload as any).evidence_family, /^unknown-/);
  assert.equal((plainRecord.payload as any).independence, "unknown");
});

import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import { published } from "./helpers.js";
import { Recall } from "../src/recall.js";
import { Brief } from "../src/brief.js";
import { Filing } from "../src/filing.js";
import { Projections } from "../src/projections.js";
import { presentResult } from "../src/present.js";
import { renderJobResponse } from "../src/job-render.js";
import { Bm25Index, stem, tokens } from "../src/text-index.js";
import { atomic, hash, json, key, objectPath, readJson } from "../src/core.js";
import type { RecordData } from "../src/core.js";

const noIndex = { fresh: async () => false, receipt: async () => null } as any;
const ids = (result: any) => result.items.map((i: any) => i.record_ref.id);

async function revise(
  f: Awaited<ReturnType<typeof published>>,
  id: string,
  body: string,
  change: Partial<RecordData> = {},
) {
  const old = (await f.store.records()).get(id)!;
  const record = {
    ...structuredClone(old),
    ...change,
    revision: old.revision + 1,
    change_reason: "Fixture revision",
  } as RecordData;
  const bodies: Record<string, string> = {};
  if (old.body) {
    record.body = { path: objectPath(record) + "/body.md", sha256: hash(body) };
    bodies[key(record)] = body;
  }
  await f.store.publish(
    [record],
    bodies,
    await f.store.current(),
    "Fixture revision",
    f.scope,
  );
  return record;
}

test("BM25 tokens drop stopwords and fold simple plurals", () => {
  assert.deepEqual(tokens("How are the lanterns moved?"), ["lantern", "moved"]);
  assert.equal(stem("comparisons"), stem("comparison"));
  const index = new Bm25Index();
  index.add("a", [
    { text: "valve permission", weight: 3 },
    { text: "amber badge", weight: 1 },
  ]);
  index.add("b", [{ text: "courier terminology", weight: 3 }]);
  index.finish();
  assert.equal(index.search("valve")[0].id, "a");
  assert.equal(index.coverage("valve unknownterm"), 0.5);
});

test("recall delivers the answer with its challenge, judgment and qualifying passage inside the budget", async () => {
  const f = await published("recall-caveats");
  const result: any = await new Recall(f.store, noIndex).recall({
    query: "may I move the lantern with an amber badge and closed valve",
    purpose: "apply",
  });
  const loaded = ids(result);
  assert.equal(loaded[0], "knowledge:handling");
  for (const required of [
    "knowledge:alternative",
    "judgment:readiness-conflict",
    "passage:handling-limits",
  ])
    assert(
      loaded.includes(required),
      `${required} should travel with the procedure`,
    );
  assert(result.budget.used <= result.budget.requested);
  assert.match(result.briefing, /⚠ Challenged by The alternative handbook/);
  assert.match(result.channels.semantic, /unavailable|skipped/);
  // Each loaded record appears exactly once as a block: no duplicated text.
  for (const id of loaded) {
    const occurrences = result.briefing
      .split("\n")
      .filter((l: string) => l.startsWith(id + "@")).length;
    assert.equal(occurrences, 1, id);
  }
  // Source passages arrive as page/line labels, not pasted text, unless they qualify a loaded account.
  assert(!loaded.includes("passage:handling-rule"));
  assert.match(result.briefing, /Sources: Handbook lines/);
  const receipt = await readJson(
    f.store.p(`retrieval-receipts/${result.request_id}.json`),
  );
  assert.equal(receipt.record_refs.length, loaded.length);
});

test("a tiny budget still returns the best account whole and lists the caveats it could not load", async () => {
  const f = await published("recall-budget");
  const result: any = await new Recall(f.store, noIndex).recall({
    query: "move lantern amber badge valve",
    purpose: "apply",
    budget_tokens: 500,
  });
  assert.equal(ids(result)[0], "knowledge:handling");
  assert(result.unresolved_caveats.length > 0);
  assert.match(result.briefing, /Caveats not loaded/);
});

test("seen accounts are not sent again", async () => {
  const f = await published("recall-seen");
  const recall = new Recall(f.store, noIndex);
  const first: any = await recall.recall({
    query: "move lantern amber badge valve",
    purpose: "apply",
  });
  const second: any = await recall.recall({
    query: "move lantern amber badge valve",
    purpose: "apply",
    seen: [
      "knowledge:handling@1",
      { id: "knowledge:alternative", revision: 1 },
    ],
  });
  assert(ids(first).includes("knowledge:handling"));
  assert(!ids(second).includes("knowledge:handling"));
  assert(!ids(second).includes("knowledge:alternative"));
  assert.match(second.briefing, /already hold were not sent again/);
});

test("withdrawn knowledge and everything resting on it leave recall", async () => {
  const f = await published("recall-withdrawn");
  await revise(f, "knowledge:alternative", "Withdrawn claim.", {
    lifecycle: "withdrawn",
  });
  const result: any = await new Recall(f.store, noIndex).recall({
    query: "valve alternative handbook open",
    purpose: "compare",
  });
  assert(!ids(result).includes("knowledge:alternative"));
  assert(!/Challenged by The alternative handbook/.test(result.briefing));
});

test("a source-restricted scope never sees records built on other sources", async () => {
  const f = await published("recall-scope");
  const courier = f.records.find((r) => r.id === "source:courier")!;
  const result: any = await new Recall(f.store, noIndex).recall({
    query: "READY meaning lantern handling",
    scope: {
      read_modules: ["workshop"],
      write_modules: [],
      source_refs: [{ id: courier.id, revision: courier.revision }],
    },
  });
  for (const id of ids(result)) {
    const record = f.records.find((r) => r.id === id)!;
    const sources =
      record.record_type === "source"
        ? [record.id]
        : record.provenance.source_refs.map((s) => s.id);
    assert(
      sources.every((s) => s === "source:courier"),
      id,
    );
  }
  assert(!result.briefing.includes("handbook permits"));
});

test("a pinned release recalls the historical revision", async () => {
  const f = await published("recall-pinned");
  const base = await f.store.current();
  await revise(
    f,
    "knowledge:handling",
    "Revised handling account mentioning a ventilation rule for lanterns with amber badges and closed valves.",
  );
  const now: any = await new Recall(f.store, noIndex).recall({
    query: "lantern amber badge valve",
    purpose: "apply",
  });
  const then: any = await new Recall(f.store, noIndex).recall({
    query: "lantern amber badge valve",
    purpose: "apply",
    release_id: base!,
  });
  assert.match(now.briefing, /ventilation rule/);
  assert(!then.briefing.includes("ventilation rule"));
  assert.match(then.briefing, /current is release-/);
});

test("brief orients with the primer, connected ideas and questions, and flags a stale primer", async () => {
  const f = await published("brief");
  const brief = new Brief(f.store);
  const first: any = await brief.brief({});
  assert.match(
    first.briefing,
    /### Primer: Orientation to the fictional workshop sources/,
  );
  assert.match(first.briefing, /· current/);
  assert.match(first.briefing, /What would resolve the valve disagreement\?/);
  assert.match(first.briefing, /Valve disagreement remains unresolved/);
  assert(first.budget.used <= first.budget.requested + 200);
  await revise(
    f,
    "knowledge:courier",
    "Courier readiness now also covers sealed parcels and keeps its separate meaning.",
  );
  const later: any = await brief.brief({});
  assert.match(
    later.briefing,
    /stale: 1 account\(s\) published or revised in later releases/,
  );
});

test("a filed answer publishes as a cited synthesis, ranks below its sources and goes pending when they change", async () => {
  const f = await published("file-answer");
  const filing = new Filing(f.store);
  const answer =
    "Move the lantern only when the badge is amber and the valve is closed; READY never permits opening the valve, and the alternative handbook disagrees about an open valve.";
  await assert.rejects(
    filing.file({
      title: "x",
      answer_markdown: answer,
      cites: ["knowledge:handling@9"],
      authorization: "test",
    }),
    /current, usable record/,
  );
  await assert.rejects(
    filing.file({
      title: "x",
      answer_markdown: answer,
      cites: ["knowledge:handling@1"],
      authorization: "",
    }),
    /user's request/,
  );
  const before = await f.store.current();
  const preview: any = await filing.file({
    title: "When a lantern may move",
    answer_markdown: answer,
    cites: [
      "knowledge:handling@1",
      "knowledge:alternative@1",
      "judgment:readiness-conflict@1",
    ],
    authorization: "File this answer",
    dry_run: true,
  });
  assert.equal(preview.status, "preview");
  assert.equal(await f.store.current(), before);
  const filed: any = await filing.file({
    title: "When a lantern may move",
    answer_markdown: answer,
    question: "Can I move an amber-badged lantern?",
    cites: [
      "knowledge:handling@1",
      "knowledge:alternative@1",
      "judgment:readiness-conflict@1",
    ],
    authorization: "File this answer",
  });
  assert.equal(filed.status, "published");
  const record = (await f.store.records()).get(filed.record_ref.id)!;
  assert.equal(record.provenance.method, "filed_answer");
  assert.deepEqual(record.provenance.source_refs.map((s) => s.id).sort(), [
    "source:alternative",
    "source:handbook",
  ]);
  const recall: any = await new Recall(f.store, noIndex).recall({
    query: "move lantern amber badge closed valve",
    purpose: "apply",
  });
  const order = ids(recall);
  assert(order.indexOf("knowledge:handling") < order.indexOf(record.id));
  assert.match(recall.briefing, /filed answer/);
  await revise(
    f,
    "knowledge:handling",
    "Handling now also requires a dry reading room log entry before moving an amber-badged lantern with a closed valve.",
  );
  const impacts = await readJson<any[]>(
    f.store.p(`releases/${await f.store.current()}.impacts.json`),
  );
  assert(
    impacts.some(
      (x) =>
        x.record_ref.id === record.id && x.status === "pending_reassessment",
    ),
  );
});

test("job responses render compactly for MCP and stay complete with detail:full", () => {
  const coverage = Array.from({ length: 900 }, (_, i) => ({
    unit_id: `source:x:unit-${i}`,
    source_ref: { id: "source:x", revision: 1 },
    locator: {
      kind: "pages",
      label: `Physical PDF page ${i}`,
      start: i,
      end: i,
      anchor: "extract:a",
      precision: "exact",
    },
    registered: "complete",
    converted: "complete",
    read: i < 300 ? "complete" : "pending",
    integrated: "pending",
    checked: "pending",
    receipts: ["sources/x/1/extractions/job-a/extraction.json"],
    gaps: [],
    exclusion_reason: null,
  }));
  const value = {
    job: {
      job_id: "job-a",
      stage: "reconstruct",
      status: "waiting_for_codex",
      workflow_version: 2,
      coverage,
      remaining_work: [],
      receipts: [],
      paid_budget: { limit: null },
    },
    instruction: "Read source units.",
    source_paths: [],
    recommended_guides: ["books"],
    staged_path: "jobs/job-a/staged.json",
  };
  const compact = renderJobResponse(value);
  assert.match(compact, /600 pending/);
  assert.match(compact, /Pending for this stage \(600, first 40\)/);
  assert(compact.length * 20 < JSON.stringify(value).length);
  assert.equal(presentResult({ detail: "full" }, value), JSON.stringify(value));
  assert.equal(presentResult({}, value), compact);
});

test("the audit journal appends per event and rebuilds itself when out of step", async () => {
  const f = await published("audit-append");
  for (let i = 0; i < 3; i++) await f.store.audit("note", `Event ${i}`, []);
  const names = (await fs.readdir(f.store.p("audit/events"))).filter((n) =>
    n.endsWith(".json"),
  );
  const lines = (await fs.readFile(f.store.p("audit/events.jsonl"), "utf8"))
    .trim()
    .split("\n");
  assert.equal(lines.length, names.length);
  await fs.rm(f.store.p("audit/journal-state.json"));
  await f.store.audit("note", "After losing the journal state", []);
  const rebuilt = (await fs.readFile(f.store.p("audit/events.jsonl"), "utf8"))
    .trim()
    .split("\n");
  assert.equal(rebuilt.length, names.length + 1);
  assert.equal(
    (await fs.readFile(f.store.p("log.md"), "utf8")).match(/^## \[/gm)!.length,
    names.length + 1,
  );
});

test("old view folders are collected unless they hold an unimported wiki edit", async () => {
  const f = await published("views-gc");
  const projections = new Projections(f.store);
  for (const release of ["release-old-a", "release-old-b", "release-keep"]) {
    const page = `views/${release}/wiki/page.md`;
    await atomic(f.store.p(page), "generated");
    await atomic(
      f.store.p(`views/${release}/file-hashes.json`),
      json({ [page]: hash("generated") }),
    );
  }
  await fs.writeFile(
    f.store.p("views/release-old-b/wiki/page.md"),
    "hand edited",
  );
  const result = await projections.collectOldViews("release-keep");
  assert.equal(result.removed, 1);
  assert.deepEqual(result.kept_with_unimported_edits, ["release-old-b"]);
  await assert.rejects(fs.access(f.store.p("views/release-old-a")));
  await fs.access(f.store.p("views/release-keep"));
});

test("an older held revision does not suppress the current one", async () => {
  const f = await published("recall-seen-revision");
  await revise(
    f,
    "knowledge:handling",
    "Revised handling: amber badge, closed valve, and a logged room check before moving the lantern.",
  );
  const result: any = await new Recall(f.store, noIndex).recall({
    query: "move lantern amber badge valve",
    purpose: "apply",
    seen: ["knowledge:handling@1"],
  });
  assert(ids(result).includes("knowledge:handling"));
  assert.match(result.briefing, /logged room check/);
});

test("assessment levels show on the account and side by side in a conflict, without changing rank", async () => {
  const f = await published("recall-assessed");
  const recall = new Recall(f.store, noIndex);
  const request = {
    query: "may I move the lantern with an amber badge and closed valve",
    purpose: "apply" as const,
  };
  // Revise both sides once without levels, so the comparison isolates the levels.
  for (const id of ["knowledge:handling", "knowledge:alternative"]) {
    const old = (await f.store.records()).get(id)!;
    await revise(f, id, await f.store.body(old));
  }
  const before: any = await recall.recall(request);
  assert(!/Side by side|Assessed:/.test(before.briefing));
  assert(!before.warnings.some((w: string) => /Assessment levels/.test(w)));

  const assess = (level: string, rationale: string, basis?: string) => ({
    level,
    rationale,
    context: null,
    ...(basis ? { basis } : {}),
  });
  for (const [id, evidence] of [
    [
      "knowledge:handling",
      assess(
        "moderate",
        "Two workshop inspections agree.",
        "controlled_comparison",
      ),
    ],
    ["knowledge:alternative", assess("low", "One unreviewed memo.")],
  ] as const) {
    const old = (await f.store.records()).get(id)!;
    await revise(f, id, await f.store.body(old), {
      assessments: { ...old.assessments, evidence },
    });
  }
  const after: any = await recall.recall(request);
  assert.deepEqual(ids(after), ids(before), "levels never change the ranking");
  assert.match(
    after.briefing,
    /knowledge:handling@3 · procedure · evidence moderate/,
  );
  assert.match(
    after.briefing,
    /Assessed: evidence \(a controlled comparison\), Two workshop inspections agree\./,
  );
  assert.match(
    after.briefing,
    /Side by side: this account \(evidence moderate from a controlled comparison; 1 independent source\) \| The alternative handbook conflicts on the valve condition \(evidence low; 1 independent source\)/,
  );
  assert.equal(
    after.briefing.match(/^ {2}Side by side:/gm).length,
    1,
    "a pair shows once when both sides are loaded",
  );
  assert.match(after.briefing, /Weighs, side by side: /);
  assert(
    after.warnings.some((w: string) => /never settles a conflict/.test(w)),
  );
  const oriented: any = await new Brief(f.store).brief({});
  assert.match(
    oriented.briefing,
    /Valve disagreement remains unresolved \(unresolved; judgment:readiness-conflict\)\n {2}Side by side: How the handbook permits moving a lantern \(evidence moderate from a controlled comparison; 1 independent source\) \| The alternative handbook conflicts on the valve condition \(evidence low; 1 independent source\)/,
  );
  assert.match(oriented.briefing, /never settles a conflict/);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { QmdSearch, type SearchRequest } from "../src/qmd-search.js";
import { Retrieval } from "../src/retrieval.js";
import { published } from "./helpers.js";
import { APP, atomic, json, ref } from "../src/core.js";

const request: SearchRequest = {
  index: "kb_" + "a".repeat(24),
  query: "valid",
  collections: ["module-a"],
  semantic: false,
  limit: 4,
  rerank: false,
};
const client = () =>
  new QmdSearch(path.join(APP, "test/fixtures/qmd-worker.cjs"), 1000);

test("persistent search isolates requests and never widens an empty collection scope", async () => {
  const worker = client();
  try {
    const [a, b] = await Promise.all([
      worker.search(request),
      worker.search({ ...request, collections: ["module-b"] }),
    ]);
    assert.match(a.items[0].file, /module-a/);
    assert.match(b.items[0].file, /module-b/);
    assert.deepEqual(
      (await worker.search({ ...request, collections: [] })).items,
      [],
    );
  } finally {
    worker.close();
  }
});

test("search timeout and crash terminate the worker and allow a clean retry", async () => {
  const worker = client();
  try {
    await assert.rejects(
      () => worker.search({ ...request, query: "hang" }, 150),
      { code: "TIMEOUT" },
    );
    assert.equal((await worker.search(request)).items.length, 1);
    await assert.rejects(() => worker.search({ ...request, query: "crash" }), {
      code: "PROCESS_FAILED",
    });
    assert.equal((await worker.search(request)).items.length, 1);
  } finally {
    worker.close();
  }
});

test("reindex/purge shutdown invalidates active and already queued searches", async () => {
  const worker = client();
  try {
    const active = worker.search({ ...request, query: "hang" });
    const queued = worker.search(request);
    const checked = Promise.all([
      assert.rejects(active, { code: "INDEX_STALE" }),
      assert.rejects(queued, { code: "INDEX_STALE" }),
    ]);
    setTimeout(() => worker.close(), 30);
    await checked;
    assert.equal((await worker.search(request)).items.length, 1);
  } finally {
    worker.close();
  }
});

test("QMD URL query suffixes map to canonical records and contribute to ranking", async () => {
  const fixture = await published("search-url");
  const record = fixture.records.find(
    (record) => record.id === "knowledge:courier",
  )!;
  const receipt = {
    release_id: fixture.publication.release_id,
    search: { state: "ready", semantic: true, version: "fixture" },
  };
  await atomic(
    fixture.store.p(`views/${fixture.publication.release_id}/search-map.json`),
    json({ "module/record.md": { record_ref: ref(record) } }),
  );
  const retrieval = new Retrieval(fixture.store, {
    fresh: async (_release: string, kind: string) => kind === "search",
    receipt: async () => receipt,
    search: async () => ({
      items: [{ file: "qmd://module/record.md?index=kb_fixture", score: 1 }],
      elapsed_ms: 1,
    }),
  } as any);
  // No literal matching words: only the indexed hit can seed this result.
  const packet = await retrieval.retrieve({
    query: "semantic-only-needle",
    graph: false,
    limit: 1,
  });
  assert.equal(packet.items[0].record_ref.id, record.id);
  assert(packet.route.includes("semantic"));
  const excluded = await retrieval.retrieve({
    query: "semantic-only-needle",
    graph: false,
    limit: 1,
    scope: {
      ...fixture.scope,
      source_refs: [{ id: "source:handbook", revision: 1 }],
    },
  });
  assert(!excluded.items.some((item) => item.record_ref.id === record.id));
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { published } from "./helpers.js";
import { Retrieval } from "../src/retrieval.js";
import { atomic, json, ref, objectPath, hash, key } from "../src/core.js";

async function selected(
  f: Awaited<ReturnType<typeof published>>,
  id: string,
  graph = false,
) {
  const release = (await f.store.current())!;
  const record = (await f.store.records()).get(id)!;
  await atomic(
    f.store.p(`views/${release}/search-map.json`),
    json({ "module/account.md": { record_ref: ref(record) } }),
  );
  return new Retrieval(f.store, {
    fresh: async (_r: string, kind: string) => kind === "search" || graph,
    receipt: async () => ({
      release_id: release,
      graph: { state: "ready" },
      search: { state: "ready", semantic: true, version: "fixture" },
    }),
    search: async () => ({
      items: [{ file: "qmd://module/account.md", score: 1 }],
      elapsed_ms: 0,
    }),
    adjacent: async () => ["relationship:prerequisite"],
  } as any);
}

for (const state of ["superseded", "archived", "withdrawn"] as const)
  test(`automatic judgment expansion does not call a ${state} judgment current`, async () => {
    const f = await published("audit-judgment");
    const old = f.records.find((r) => r.id === "judgment:readiness-conflict")!;
    const changed = {
      ...old,
      revision: 2,
      lifecycle: state === "archived" ? old.lifecycle : state,
      archived: state === "archived",
    };
    await f.store.publish(
      [changed],
      {},
      await f.store.current(),
      "Retired judgment",
      f.scope,
    );
    const packet = await (
      await selected(f, "knowledge:handling")
    ).retrieve({ query: "semantic-only-needle", graph: false, limit: 1 });
    assert(!packet.judgment_refs.some((r) => r.id === old.id));
    assert(
      !packet.items.some(
        (i) =>
          i.record_ref.id === old.id &&
          /Current judgment/.test(i.selection_reason),
      ),
    );
  });

test("an active judgment still qualifies retrieved accounts", async () => {
  const f = await published("audit-active-judgment");
  const packet = await (
    await selected(f, "knowledge:handling")
  ).retrieve({ query: "semantic-only-needle", graph: false, limit: 1 });
  assert(
    packet.judgment_refs.some((r) => r.id === "judgment:readiness-conflict"),
  );
});

test("graph dependency roles distinguish prerequisites from their dependents", async () => {
  const f = await published("audit-direction");
  const reverse = await (
    await selected(f, "concept:ready-handbook", true)
  ).retrieve({ query: "semantic-only-needle", limit: 1, hops: 1 });
  const dependent = reverse.items.find(
    (i) => i.record_ref.id === "knowledge:handling",
  )!;
  assert.notEqual(dependent.role, "prerequisite");
  assert.match(dependent.selection_reason, /dependent|depends on/i);
  const forward = await (
    await selected(f, "knowledge:handling", true)
  ).retrieve({ query: "semantic-only-needle", limit: 1, hops: 1 });
  assert.equal(
    forward.items.find((i) => i.record_ref.id === "concept:ready-handbook")
      ?.role,
    "prerequisite",
  );
});

test("validity and lifecycle remain visible even when a long body is truncated", async () => {
  const f = await published("audit-validity");
  const old = f.records.find((r) => r.id === "knowledge:handling")!;
  const changed = {
    ...old,
    revision: 2,
    scope: {
      ...old.scope,
      valid_from: "2020-01-01",
      valid_until: "2021-01-01",
    },
  };
  const body = "A detailed account. ".repeat(450);
  changed.body = { path: objectPath(changed) + "/body.md", sha256: hash(body) };
  await f.store.publish(
    [changed],
    { [key(changed)]: body },
    await f.store.current(),
    "Date-limited account",
    f.scope,
  );
  const packet = await (
    await selected(f, old.id)
  ).retrieve({ query: "semantic-only-needle", graph: false, limit: 1 });
  const item = packet.items.find(
    (i) => i.record_ref.id === old.id && i.record_ref.revision === 2,
  )!;
  assert.match(item.excerpt, /2020-01-01/);
  assert.match(item.excerpt, /2021-01-01/);
  assert.match(item.excerpt, /Lifecycle: active/);
  assert(
    packet.warnings.some(
      (w) => w.includes(key(changed)) && /expired|outside.*validity/i.test(w),
    ),
  );
  assert(packet.truncated);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import path from "node:path";
import { published } from "./helpers.js";
import { Retrieval } from "../src/retrieval.js";
import { Store } from "../src/store.js";
import { Lifecycle } from "../src/lifecycle.js";
import { VerifiedCache } from "../src/verified-cache.js";
import { atomic, hash, json, ref, key, objectPath } from "../src/core.js";

const query = {
  query: "handbook permits moving lantern",
  semantic: false,
  graph: false,
  limit: 1,
};
const stable = ({ request_id, timings_ms, ...packet }: any) => packet;

test("warm retrieval preserves the complete packet and does not share mutable records", async () => {
  const fixture = await published("warm-parity");
  const retrieval = new Retrieval(fixture.store);
  const before = await retrieval.retrieve(query);
  const hits = fixture.store.cacheStats().hits;
  assert.deepEqual(stable(await retrieval.retrieve(query)), stable(before));
  assert(fixture.store.cacheStats().hits > hits);
  const record = await fixture.store.exact({
    id: "knowledge:handling",
    revision: 1,
  });
  record.title = "An uncommitted caller edit";
  assert.notEqual((await fixture.store.exact(ref(record))).title, record.title);
});

test("warm cache detects same-length prose edits even when mtime is restored", async () => {
  const fixture = await published("warm-tamper");
  const target = { id: "knowledge:handling", revision: 1 };
  const original = await fixture.store.read(target);
  const file = fixture.store.p(original.record.body!.path);
  const stat = await fs.stat(file);
  await fs.writeFile(file, original.body.replace("valve", "xxxxx"));
  await fs.utimes(file, stat.atime, stat.mtime);
  await assert.rejects(() => fixture.store.read(target), {
    code: "VALIDATION_FAILED",
  });
  await fs.writeFile(file, original.body);
  assert.equal((await fixture.store.read(target)).body, original.body);
});

test("metadata replacement and missing files do not inherit cached verification", async () => {
  const fixture = await published("warm-metadata");
  const reference = { id: "knowledge:handling", revision: 1 };
  const record = await fixture.store.read(reference);
  const file = fixture.store.p(objectPath(reference) + "/record.json");
  const bytes = await fs.readFile(file);
  await atomic(
    file,
    json({ ...record.record, title: "Unpublished replacement" }),
  );
  await assert.rejects(() => fixture.store.read(reference), {
    code: "VALIDATION_FAILED",
  });
  await atomic(file, bytes);
  await fixture.store.read(reference);
  await fs.unlink(file);
  await assert.rejects(() => fixture.store.read(reference), { code: "ENOENT" });
});

test("same process notices publication and withdrawal, including historical queries", async () => {
  const fixture = await published("warm-revisions");
  const retrieval = new Retrieval(fixture.store);
  await retrieval.retrieve(query);
  const old = await fixture.store.exact({
    id: "knowledge:handling",
    revision: 1,
  });
  const body =
    (await fixture.store.body(old)) + "\nA newly reviewed clarification.";
  const revised = {
    ...old,
    revision: 2,
    body: {
      path: objectPath({ ...old, revision: 2 }) + "/body.md",
      sha256: hash(body),
    },
  };
  await fixture.store.publish(
    [revised],
    { [key(revised)]: body },
    fixture.publication.release_id,
    "Clarify fixture",
    fixture.scope,
  );
  const current = await retrieval.retrieve(query);
  assert(
    current.items.some(
      (item) => item.record_ref.id === old.id && item.record_ref.revision === 2,
    ),
  );
  const lifecycle = new Lifecycle(fixture.store);
  const plan = await lifecycle.plan(
    "withdraw",
    [{ id: "source:handbook", revision: 1 }],
    "Withdraw test support",
  );
  await lifecycle.execute(plan.plan_id, {
    action: "withdraw",
    targets: plan.targets,
    user_instruction: "Withdraw the fixture handbook source",
  });
  for (const release_id of [undefined, fixture.publication.release_id]) {
    const packet = await retrieval.retrieve({ ...query, release_id });
    assert(!packet.items.some((item) => item.record_ref.id === old.id));
  }
});

test("warm retrieval rereads bindings, source scope and independent deletion policy", async () => {
  const fixture = await published("warm-policy");
  const retrieval = new Retrieval(fixture.store);
  await retrieval.retrieve(query);
  const narrow = await retrieval.retrieve({
    ...query,
    scope: {
      ...fixture.scope,
      source_refs: [{ id: "source:handbook", revision: 1 }],
    },
  });
  assert(
    !narrow.items.some(
      (item) => item.record_ref.id === "judgment:readiness-conflict",
    ),
  );
  const config = await fixture.store.config();
  await atomic(
    fixture.store.p("corpus.json"),
    json({
      ...config,
      project_bindings: config.project_bindings.map((binding) => ({
        ...binding,
        project_id: "revoked-project",
      })),
    }),
  );
  await assert.rejects(() => retrieval.retrieve(query), {
    code: "SCOPE_DENIED",
  });
  await atomic(fixture.store.p("corpus.json"), json(config));
  await retrieval.retrieve(query);
  const ledgerFile = path.join(
    fixture.store.ledgerRoot,
    hash(config.corpus_id) + ".json",
  );
  const ledger = await fixture.store.ledger();
  await fs.unlink(ledgerFile);
  await assert.rejects(() => retrieval.retrieve(query), {
    code: "LEDGER_UNAVAILABLE",
  });
  await atomic(
    ledgerFile,
    json({ ...ledger, generation: 1, blocked_ids: ["source:handbook"] }),
  );
  await assert.rejects(() => retrieval.retrieve(query), {
    code: "LEDGER_UNAVAILABLE",
  });
  await atomic(
    fixture.store.p("lifecycle/ledger-generation.json"),
    json({ generation: 1 }),
  );
  await assert.rejects(
    () => fixture.store.read({ id: "source:handbook", revision: 1 }),
    { code: "CONTENT_PURGED" },
  );
  assert(
    !(await retrieval.retrieve(query)).items.some(
      (item) => item.record_ref.id === "knowledge:handling",
    ),
  );
});

test("a policy change during an asynchronous retrieval invalidates the whole result", async () => {
  const fixture = await published("concurrent-policy");
  let changed = false;
  const retrieval = new Retrieval(fixture.store, {
    fresh: async () => {
      if (!changed) {
        changed = true;
        const config = await fixture.store.config();
        await atomic(
          fixture.store.p("corpus.json"),
          json({
            ...config,
            project_bindings: config.project_bindings.map((binding) => ({
              ...binding,
              project_id: "revoked-project",
            })),
          }),
        );
      }
      return false;
    },
    receipt: async () => null,
  } as any);
  await assert.rejects(() => retrieval.retrieve(query), {
    code: "REVISION_CONFLICT",
  });
});

test("cache allowance evicts contents without changing reads and can be disabled", async () => {
  const fixture = await published("bounded-cache");
  const cached = new Store(
    fixture.store.root,
    fixture.store.project,
    fixture.store.ledgerRoot,
    8192,
  );
  const uncached = new Store(
    fixture.store.root,
    fixture.store.project,
    fixture.store.ledgerRoot,
    0,
  );
  const packet = await new Retrieval(cached).retrieve(query);
  assert.deepEqual(
    stable(packet),
    stable(await new Retrieval(uncached).retrieve(query)),
  );
  assert(cached.cacheStats().estimatedBytes <= 8192);
  assert.equal(uncached.cacheStats().entries, 0);
});

test("a directory junction cannot reuse trusted cached content", async () => {
  const fixture = await published("junction-cache");
  const cache = new VerifiedCache(fixture.store.root);
  await fs.mkdir(fixture.store.p("safe"));
  await fs.writeFile(fixture.store.p("safe/text.txt"), "evidence");
  await cache.text("safe/text.txt", hash("evidence"));
  await fs.rename(fixture.store.p("safe"), fixture.store.p("moved"));
  await fs.symlink(
    fixture.store.p("moved"),
    fixture.store.p("safe"),
    process.platform === "win32" ? "junction" : "dir",
  );
  await assert.rejects(() => cache.text("safe/text.txt", hash("evidence")), {
    code: "VALIDATION_FAILED",
  });
});

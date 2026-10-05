import { test } from "node:test";
import assert from "node:assert/strict";
import { published } from "./helpers.js";
import { Connect } from "../src/connect.js";
import { hash, key, objectPath } from "../src/core.js";
import type { RecordData } from "../src/core.js";

test("connect finds the chain between two ideas and reads each hop with its reason", async () => {
  const f = await published("connect-chain");
  const result: any = await new Connect(f.store).connect({
    from: "knowledge:alternative",
    to: "learning:near-miss",
  });
  assert(result.chains.length >= 1);
  const best = result.chains[0];
  assert.equal(best.steps[0].record_ref.id, "knowledge:alternative");
  assert.equal(best.steps.at(-1).record_ref.id, "learning:near-miss");
  assert.equal(best.steps[1].record_ref.id, "knowledge:handling");
  assert.equal(best.steps[1].link, "challenges");
  assert.match(best.steps[1].rationale, /disagree about an open valve/);
  assert.match(
    result.briefing,
    /↳ challenges \*\*How the handbook permits moving a lantern\*\*/,
  );
  assert.match(result.briefing, /why: The sources disagree/);
  assert.match(result.briefing, /not evidence that one causes the other/);
});

test("connect resolves words to records and respects max_hops", async () => {
  const f = await published("connect-words");
  const result: any = await new Connect(f.store).connect({
    from: "courier readiness different meaning",
    to: "near miss open valve amber badge",
    max_hops: 6,
  });
  assert.equal(result.from.id, "knowledge:courier");
  assert.equal(result.to.id, "learning:near-miss");
  assert(result.chains.length >= 1);
  const short: any = await new Connect(f.store).connect({
    from: "knowledge:courier",
    to: "learning:near-miss",
    max_hops: 1,
  });
  assert.equal(short.chains.length, 0);
  assert.match(short.briefing, /No chain within 1 hops/);
});

test("connect never routes through withdrawn knowledge", async () => {
  const f = await published("connect-withdrawn");
  const old = (await f.store.records()).get("knowledge:handling")!;
  const body = "Withdrawn handling account.";
  const withdrawn = {
    ...structuredClone(old),
    revision: 2,
    lifecycle: "withdrawn",
    change_reason: "Fixture withdrawal",
  } as RecordData;
  withdrawn.body = {
    path: objectPath(withdrawn) + "/body.md",
    sha256: hash(body),
  };
  await f.store.publish(
    [withdrawn],
    { [key(withdrawn)]: body },
    await f.store.current(),
    "Withdraw",
    f.scope,
  );
  const result: any = await new Connect(f.store).connect({
    from: "knowledge:alternative",
    to: "concept:ready-handbook",
  });
  for (const chain of result.chains)
    assert(
      !chain.steps.some((s: any) => s.record_ref.id === "knowledge:handling"),
    );
  await assert.rejects(
    new Connect(f.store).connect({
      from: "knowledge:handling",
      to: "concept:ready-handbook",
    }),
    /not a current, usable record/,
  );
});

test("connect outward lists ideas two or more hops away with the chain to each", async () => {
  const f = await published("connect-outward");
  const result: any = await new Connect(f.store).connect({
    from: "knowledge:courier",
    limit: 5,
  });
  assert(result.reached.length >= 1);
  for (const r of result.reached) assert(r.hops >= 2);
  assert.match(
    result.briefing,
    /# Connect outward: Courier readiness uses a different meaning/,
  );
});

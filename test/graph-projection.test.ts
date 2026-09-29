import { test } from "node:test";
import assert from "node:assert/strict";
import { writeGraph } from "../src/graph-projection.js";
import { fixture } from "./helpers.js";

test("an interrupted graph batch cannot publish a ready release marker", async () => {
  const f = await fixture("graph-failure");
  const calls: string[] = [];
  const graph = {
    async query(query: string) {
      calls.push(query);
      if (query.includes("UNWIND")) throw Error("connection lost mid-build");
      return { data: [] };
    },
  };
  await assert.rejects(
    () =>
      writeGraph(
        graph,
        new Map(f.records.map((r) => [r.id, r])),
        "test-release",
      ),
    /connection lost/,
  );
  assert.equal(
    calls.some((q) => q.includes("CREATE (:Projection")),
    false,
  );
});

test("incomplete graph counts block the release marker after apparent write success", async () => {
  const f = await fixture("graph-counts");
  const records = new Map(f.records.map((r) => [r.id, r]));
  for (const mismatch of ["nodes", "edges"]) {
    const calls: string[] = [];
    const graph = {
      async query(query: string) {
        calls.push(query);
        if (query.includes("count(n)"))
          return { data: [{ count: mismatch === "nodes" ? 0 : records.size }] };
        return { data: [] };
      },
    };
    await assert.rejects(() => writeGraph(graph, records, "test-release"), {
      code: "VALIDATION_FAILED",
    });
    assert.equal(
      calls.some((q) => q.includes("CREATE (:Projection")),
      false,
    );
  }
});

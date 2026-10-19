import { test } from "node:test";
import assert from "node:assert/strict";
import { fuseRankings, semanticGate } from "../src/recall.js";
import { Bm25Index } from "../src/text-index.js";

test("fusion keeps a clear keyword margin, so a purpose preference can't lift a weak match over it", () => {
  // A case from a real ingest: the best account scored 14.65 on keywords and the procedure
  // that beat it was ninth at 10.01; apply prefers procedures by a quarter.
  const scores = [14.65, 11.92, 11.9, 11.04, 10.97, 10.89, 10.21, 10.17, 10.01];
  const lexical = scores.map((score, i) => ({ id: `doc-${i + 1}`, score }));
  const fused = fuseRankings(new Map([["lexical", lexical]]), { lexical: 1 });
  const principle = fused.get("doc-1")!.score;
  const procedure = fused.get("doc-9")!.score * 1.25;
  assert(principle > procedure, `${principle} should beat ${procedure}`);

  // A neighbour at 63% of the best score doesn't overtake it either.
  const wide = fuseRankings(
    new Map([
      [
        "lexical",
        [
          { id: "best", score: 10 },
          { id: "procedure", score: 6.3 },
        ],
      ],
    ]),
    { lexical: 1 },
  );
  assert(wide.get("best")!.score > wide.get("procedure")!.score * 1.25);

  // When two matches are close, the purpose preference still decides.
  const close = fuseRankings(
    new Map([
      [
        "lexical",
        [
          { id: "assertion", score: 10 },
          { id: "procedure", score: 9.8 },
        ],
      ],
    ]),
    { lexical: 1 },
  );
  assert(close.get("procedure")!.score * 1.25 > close.get("assertion")!.score);

  // Without scores (equal or missing), fusion is plain reciprocal rank.
  const plain = fuseRankings(
    new Map([
      [
        "graph",
        [
          { id: "a", score: 0 },
          { id: "b", score: 0 },
        ],
      ],
    ]),
    { graph: 0.8 },
  );
  assert.equal(plain.get("a")!.score, 0.8 / 61);
});

test("the semantic gate judges the best match, not the library's vocabulary", () => {
  const index = new Bm25Index();
  index.add("lantern", [{ text: "The lantern needs the vent", weight: 1 }]);
  index.add("workshop", [{ text: "A humid workshop loses heat", weight: 1 }]);
  index.finish();
  const query = "lantern vent humid workshop";
  // Every query word appears somewhere, so the old library-wide test saw 100%.
  assert.equal(index.coverage(query), 1);
  const best = index.search(query, 5)[0];
  assert(index.coverageOf(query, best.id) < 0.7);
  assert.equal(semanticGate(index.coverageOf(query, best.id), 5), true);
  assert.equal(semanticGate(0.8, 5), false);
  assert.equal(semanticGate(0.8, 2), true);
});

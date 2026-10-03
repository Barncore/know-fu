import { test } from "node:test";
import assert from "node:assert/strict";
import { published } from "./helpers.js";
import { Reading } from "../src/reading.js";
import { renderReadingResponse } from "../src/reading-render.js";

test("MCP reading presentation keeps full prose, exact provenance, low-ranked guards and their scope", async () => {
  const f = await published("reading-presentation");
  const reading = new Reading(f.store, {
    fresh: async () => false,
    receipt: async () => null,
  } as any);
  const response = await reading.read({
    kind: "account",
    record_ref: { id: "knowledge:handling", revision: 1 },
    purpose: "apply",
  });
  const text = renderReadingResponse(response);
  assert(text.includes(response.content.text));
  assert(text.includes(response.content.body_sha256));
  assert(text.includes(response.reading_status));
  for (const card of [...response.candidates, ...response.necessary_reading]) {
    assert(text.includes(card.record_ref.id));
    assert(text.includes(card.title));
    if (card.summary) assert(text.includes(card.summary));
    assert(text.includes(JSON.stringify(card.scope)));
    for (const ref of [...card.source_refs, ...card.support_refs])
      assert(text.includes(ref.id));
    for (const warning of card.warnings) assert(text.includes(warning));
  }
  for (const r of response.relationships) {
    assert(text.includes(r.predicate));
    assert(text.includes(r.rationale));
  }
  assert(text.length < JSON.stringify(response).length);
});

test("MCP reading presentation retains explicit partial reads, pending metadata, budgeting and fallback values", () => {
  assert.equal(renderReadingResponse({ hello: "world" }), '{"hello":"world"}');
  const r = {
    interface_version: "1.0.0",
    request_id: "test",
    kind: "account",
    release_id: "release-old",
    current_release: "release-current",
    purpose: "explain",
    purpose_requirements: ["reason"],
    reading_status: "section_read",
    completeness: "Partial; further reading is necessary",
    candidates: [],
    necessary_reading: [],
    content: {
      record_ref: { id: "knowledge:partial", revision: 3 },
      coverage: "section_only",
      body_sha256: "hash",
      section_id: "section-1",
      text: "Complete selected section; no arbitrary cut.",
      payload: null,
      extensions: {},
      assessments: {
        fidelity: {
          level: "unknown",
          rationale: "Not independently verified",
          context: null,
        },
      },
    },
    warnings: ["pending reassessment"],
    material_context: { resolved: false, next_offset: 40 },
    sections: [{ section_id: "section-1" }],
    traceable_support: [{ id: "source:exact", revision: 2 }],
  };
  const text = renderReadingResponse({
    result: r,
    budget: { calls_remaining: 1 },
  });
  for (const value of [
    "section_only",
    "section-1",
    "pending reassessment",
    "release-current",
    "source:exact",
    "Not independently verified",
    '"resolved":false',
    '"next_offset":40',
    '"calls_remaining":1',
  ])
    assert(text.includes(value), value);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import { fixture, published } from "./helpers.js";
import { Reading } from "../src/reading.js";
import { KnowledgeSystem } from "../src/api.js";
import { Projections } from "../src/projections.js";
import {
  atomic,
  hash,
  json,
  key,
  objectPath,
  readJson,
  ref,
} from "../src/core.js";
import type { RecordData } from "../src/core.js";

const noIndex = { fresh: async () => false, receipt: async () => null } as any;
const exact = (id: string, revision = 1) => ({ id, revision });

test("full passage text receives body relevance rather than the authored-summary multiplier", async () => {
  const f = await fixture("passage-body-ranking");
  const base = f.records.find((r) => r.id === "knowledge:handling")!;
  const account: RecordData = {
    ...structuredClone(base),
    id: "knowledge:focused",
    title: "Focused account",
    payload: {
      ...(base.payload as any),
      summary: "Amber badge",
      concept_refs: [],
    },
  };
  const body = "A connected explanation.";
  account.body = { path: objectPath(account) + "/body.md", sha256: hash(body) };
  await f.store.publish(
    [...f.records, account],
    { ...f.bodies, [key(account)]: body },
    null,
    "Rank body and summary evidence consistently",
    f.scope,
  );
  const result = await new Reading(f.store, noIndex).retrieve({
    query: "amber badge valve",
    semantic: false,
    limit: 40,
  });
  const ids = result.candidates.map((c: any) => c.record_ref.id);
  assert(ids.includes(account.id));
  assert(ids.includes("passage:handling-rule"));
  assert(ids.indexOf(account.id) < ids.indexOf("passage:handling-rule"));
});

async function revise(
  f: Awaited<ReturnType<typeof published>>,
  id: string,
  body: string,
) {
  const old = (await f.store.records()).get(id)!;
  const record = {
    ...old,
    revision: old.revision + 1,
    change_reason: "Reassessed fixture account",
  };
  record.body = { path: objectPath(record) + "/body.md", sha256: hash(body) };
  await f.store.publish(
    [record],
    { [key(record)]: body },
    await f.store.current(),
    "Fixture correction",
    f.scope,
  );
  return record;
}

test("a complete account read carries low-ranked exceptions, prerequisites and current disagreement without pasting source bodies", async () => {
  const f = await published("progressive-material");
  const answer = await new Reading(f.store, noIndex).read({
    kind: "account",
    record_ref: exact("knowledge:handling"),
  });
  assert.equal(answer.content.coverage, "complete_account");
  assert.equal(answer.candidates[0].applicability, "unknown");
  for (const id of [
    "passage:handling-limits",
    "concept:ready-handbook",
    "knowledge:alternative",
    "judgment:readiness-conflict",
  ])
    assert(
      answer.necessary_reading.some((r: any) => r.record_ref.id === id),
      id,
    );
  assert(
    answer.traceable_support.some((r: any) => r.id === "passage:handling-rule"),
  );
  assert(
    !answer.necessary_reading.some(
      (r: any) => r.record_ref.id === "source:handbook",
    ),
  );
  assert(
    !JSON.stringify(answer).includes(
      "This handbook establishes no handling rule for humid rooms.",
    ),
  );
  const guard = await new Reading(f.store, noIndex).read({
    kind: "account",
    record_ref: exact("passage:handling-limits"),
  });
  assert.match(guard.content.text, /humid rooms/);
  assert.equal(guard.content.payload.text, undefined);
  assert.equal(guard.candidates[0].locator.precision, "exact");
});

test("a shared judgment does not make every assessed procedure a prerequisite; explicit prerequisites still apply", async () => {
  const f = await fixture("judgment-directions");
  const handling = f.records.find((r) => r.id === "knowledge:handling")!;
  const judgment = f.records.find(
    (r) => r.id === "judgment:readiness-conflict",
  )!;
  const unrelated: RecordData = {
    ...structuredClone(handling),
    id: "knowledge:filing",
    title: "Separate filing procedure",
  };
  const body = "A separate filing rule with its own prerequisite.";
  unrelated.body = {
    path: objectPath(unrelated) + "/body.md",
    sha256: hash(body),
  };
  const prerequisite: RecordData = {
    ...structuredClone(f.records.find((r) => r.record_type === "concept")!),
    id: "concept:filing",
    title: "Filing prerequisite",
    body: null,
  };
  const template = f.records.find((r) => r.record_type === "relationship")!;
  const link: RecordData = {
    ...structuredClone(template),
    id: "relationship:filing-prerequisite",
    body: null,
    depends_on: [ref(unrelated), ref(prerequisite)],
    payload: {
      subject: ref(unrelated),
      object: ref(prerequisite),
      predicate: "depends_on",
      rationale: "Filing depends on its separate conceptual prerequisite.",
      materiality: "essential",
    },
  };
  (judgment.payload as any).issue_refs.push(ref(unrelated));
  judgment.depends_on.push(ref(unrelated));
  for (const r of [...f.records, unrelated, prerequisite, link])
    r.scope = {
      ...r.scope,
      conditions: [],
      exclusions: [],
      condition_expression: null,
    };
  await f.store.publish(
    [...f.records, unrelated, prerequisite, link],
    { ...f.bodies, [key(unrelated)]: body },
    null,
    "Shared judgment fixture",
    f.scope,
  );
  const reading = new Reading(f.store, noIndex);
  const initial = await reading.read({
    kind: "account",
    record_ref: ref(handling),
  });
  const required = initial.necessary_reading.map((c: any) => c.record_ref.id);
  assert(required.includes(judgment.id));
  assert(!required.includes(unrelated.id));
  assert(!required.includes(prerequisite.id));
  const explicit: RecordData = {
    ...structuredClone(link),
    id: "relationship:judgment-prerequisite",
    depends_on: [ref(judgment), ref(unrelated)],
    payload: {
      ...(link.payload as any),
      subject: ref(judgment),
      object: ref(unrelated),
      rationale: "This judgment explicitly needs the filing procedure.",
    },
  };
  await f.store.publish(
    [explicit],
    {},
    await f.store.current(),
    "Explicit prerequisite",
    f.scope,
  );
  const next = await reading.read({
    kind: "account",
    record_ref: ref(handling),
  });
  assert(
    next.necessary_reading.some((c: any) => c.record_ref.id === unrelated.id),
  );
  assert(
    next.necessary_reading.some(
      (c: any) => c.record_ref.id === prerequisite.id,
    ),
  );
});

test("repeated source-wide scope does not require every provenance body; a distinct inherited limit does", async () => {
  const f = await fixture("progressive-boundaries");
  const account = f.records.find((r) => r.id === "knowledge:handling")!;
  const passage = f.records.find((r) => r.id === "passage:handling-rule")!;
  account.scope.condition_expression = null;
  account.scope.conditions = ["Fictional handbook; dry reading room only"];
  for (const record of f.records) record.scope = structuredClone(account.scope);
  await f.store.publish(
    f.records,
    f.bodies,
    null,
    "Shared boundary fixture",
    f.scope,
  );
  let result = await new Reading(f.store, noIndex).read({
    kind: "account",
    record_ref: ref(account),
  });
  assert(
    !result.necessary_reading.some((r: any) => r.record_ref.id === passage.id),
  );
  const revised = {
    ...passage,
    revision: 2,
    scope: {
      ...passage.scope,
      conditions: ["Additional hidden fixture limit: after inspection only"],
    },
  };
  const revisedAccount = {
    ...account,
    revision: 2,
    body: {
      path: objectPath({ id: account.id, revision: 2 }) + "/body.md",
      sha256: hash(f.bodies[key(account)]),
    },
    depends_on: account.depends_on.map((r) =>
      r.id === passage.id ? ref(revised) : r,
    ),
  };
  await f.store.publish(
    [revised, revisedAccount],
    { [key(revisedAccount)]: f.bodies[key(account)] },
    await f.store.current(),
    "A distinct supporting boundary",
    f.scope,
  );
  result = await new Reading(f.store, noIndex).read({
    kind: "account",
    record_ref: ref(revisedAccount),
  });
  assert(
    result.necessary_reading.some(
      (r: any) => r.record_ref.id === passage.id && r.record_ref.revision === 2,
    ),
  );
});

test("primers inherit material caveats of exact supporting inputs while their source bodies remain traceable", async () => {
  const f = await published("progressive-primer");
  const result = await new Reading(f.store, noIndex).read({
    kind: "account",
    record_ref: exact("learning:primer"),
    purpose: "teach",
  });
  assert(
    result.necessary_reading.some(
      (r: any) => r.record_ref.id === "passage:handling-limits",
    ),
  );
  assert(
    result.necessary_reading.some(
      (r: any) =>
        r.record_ref.id === "knowledge:handling" &&
        r.applicability === "unknown",
    ),
  );
  assert(
    result.purpose_requirements.some((r: string) => /misunderstanding/.test(r)),
  );
});

test("summary and body search hits share one candidate identity and reading is a separate operation", async () => {
  const f = await published("progressive-search"),
    release = (await f.store.current())!;
  await atomic(
    f.store.p(`views/${release}/search-map.json`),
    json({
      "module/account.md": {
        record_ref: exact("knowledge:handling"),
        level: "account",
      },
      "module/summary.md": {
        record_ref: exact("knowledge:handling"),
        level: "summary",
      },
    }),
  );
  const projections = {
    fresh: async (_r: string, kind: string) => kind === "search",
    receipt: async () => ({ search: { semantic: true } }),
    search: async () => ({
      items: [
        { file: "qmd://module/summary.md", score: 1 },
        { file: "qmd://module/account.md", score: 0.5 },
      ],
    }),
  } as any;
  const result = await new Reading(f.store, projections).retrieve({
    query: "unmatched-needle",
    graph: false,
    limit: 1,
  });
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].record_ref.id, "knowledge:handling");
  assert.equal(result.content, null);
  assert.equal(result.reading_status, "orientation_only");
  assert(
    result.necessary_reading.some(
      (r: any) => r.record_ref.id === "passage:handling-limits",
    ),
  );
  assert(result.usage.rendered_characters > 0);
  assert.equal(
    (await readJson(f.store.p(`retrieval-receipts/${result.request_id}.json`)))
      .reading_status,
    "orientation_only",
  );
});

test("catalogues and topic pagination filter inaccessible metadata before counts and summaries", async () => {
  const f = await published("progressive-scope");
  const scope = { ...f.scope, source_refs: [exact("source:courier")] };
  const reading = new Reading(f.store, noIndex);
  const catalogue = await reading.read({ kind: "catalogue", scope });
  assert.equal(catalogue.topics.length, 1);
  assert.equal(catalogue.topics[0].accounts, 2);
  const topic = await reading.read({
    kind: "topic",
    topic: "fictional_workshop",
    scope,
    limit: 1,
  });
  assert.equal(topic.pagination.total, 2);
  assert.equal(topic.pagination.next_offset, 1);
  assert(!JSON.stringify(topic).includes("knowledge:handling"));
  assert(!JSON.stringify(catalogue).includes("Valve disagreement"));
  await assert.rejects(
    reading.read({
      kind: "account",
      record_ref: exact("knowledge:handling"),
      scope,
    }),
    /scope/i,
  );
});

test("section locators ignore fenced headings, preserve complete bodies and reject a different release", async () => {
  const f = await published("progressive-sections"),
    reader = new Reading(f.store, noIndex);
  const body =
    "# Procedure\nOpening reasoning.\n\n## Conditions\n" +
    "Condition detail. ".repeat(500) +
    "\n```md\n## Not a section\n```\n\n## Example\nA worked case.\n";
  const record = await revise(f, "knowledge:handling", body),
    release = (await f.store.current())!;
  const all = await reader.read({
    kind: "account",
    record_ref: ref(record),
    release_id: release,
  });
  assert.equal(all.content.text, body);
  assert.equal(all.sections.length, 3);
  const selected = await reader.read({
    kind: "account",
    record_ref: ref(record),
    release_id: release,
    section_id: all.sections[1].section_id,
  });
  assert.equal(selected.content.coverage, "section_only");
  assert.match(selected.content.text, /^## Conditions/);
  assert(!selected.content.text.includes("A worked case."));
  await revise(
    f,
    "knowledge:courier",
    "An unrelated updated courier explanation.",
  );
  await assert.rejects(
    reader.read({
      kind: "account",
      record_ref: ref(record),
      section_id: all.sections[1].section_id,
    }),
    /Section/,
  );
  const stillPinned = await reader.read({
    kind: "account",
    record_ref: ref(record),
    release_id: release,
    section_id: all.sections[1].section_id,
  });
  assert.equal(stillPinned.content.text, selected.content.text);
});

test("current withdrawal blocks exact historical reliance and discovery", async () => {
  const f = await published("progressive-withdrawal"),
    release = (await f.store.current())!;
  const old = f.records.find((r) => r.id === "source:handbook")!;
  await f.store.publish(
    [{ ...old, revision: 2, lifecycle: "withdrawn" }],
    {},
    release,
    "Withdraw fixture source",
    f.scope,
  );
  const reader = new Reading(f.store, noIndex);
  await assert.rejects(
    reader.read({
      kind: "account",
      record_ref: exact("knowledge:handling"),
      release_id: release,
    }),
    /withdrawal|support/i,
  );
  const result = await reader.retrieve({
    query: "lantern handbook",
    release_id: release,
    graph: false,
  });
  assert(
    !result.candidates.some(
      (r: any) => r.record_ref.id === "knowledge:handling",
    ),
  );
});

test("pinned reads surface a newly published qualification and exact historical inputs", async () => {
  const f = await published("progressive-history"),
    release = (await f.store.current())!;
  const old = f.records.find((r) => r.id === "relationship:limits")!;
  const qualification: RecordData = {
    ...old,
    id: "relationship:new-limit",
    title: "A later clarification",
    payload: {
      ...(old.payload as any),
      rationale: "Later material caveat for the historical procedure",
    },
  };
  await f.store.publish(
    [qualification],
    {},
    release,
    "Add material caveat",
    f.scope,
  );
  const reader = new Reading(f.store, noIndex);
  const result = await reader.read({
    kind: "account",
    record_ref: exact("knowledge:handling"),
    release_id: release,
  });
  assert(
    result.relationships.some((r: any) => r.record_ref.id === qualification.id),
  );
  await revise(
    f,
    "concept:ready-handbook",
    "A revised concept whose former definition must remain traceable.",
  );
  const historical = await reader.read({
    kind: "account",
    record_ref: exact("knowledge:handling"),
  });
  assert(
    historical.traceable_support.some(
      (r: any) => r.id === "concept:ready-handbook" && r.revision === 1,
    ),
  );
  const premise = await reader.read({
    kind: "account",
    record_ref: exact("concept:ready-handbook"),
  });
  assert.equal(premise.candidates[0].freshness, "historical");
  const catalogue = await reader.read({ kind: "catalogue" });
  assert.equal(
    catalogue.topics[0].primers[0].freshness,
    "pending_reassessment",
  );
});

test("retired judgments are not returned as current material guidance", async () => {
  const f = await published("progressive-judgment"),
    old = f.records.find((r) => r.id === "judgment:readiness-conflict")!;
  await f.store.publish(
    [{ ...old, revision: 2, archived: true }],
    {},
    await f.store.current(),
    "Archive fixture judgment",
    f.scope,
  );
  const result = await new Reading(f.store, noIndex).read({
    kind: "account",
    record_ref: exact("knowledge:handling"),
  });
  assert(
    !result.necessary_reading.some((r: any) => r.record_ref.id === old.id),
  );
});

test("projection navigation has authored summaries, meaningful topic links and distinct search levels", async () => {
  const f = await published("progressive-projection"),
    projections = new Projections(f.store);
  projections.graph = async () => {
    throw new Error("isolated fixture");
  };
  projections.qmd = async () =>
    ({ stdout: "fixture", stderr: "", code: 0 }) as any;
  const result = await projections.build({ semantic: false });
  const release = (await f.store.current())!;
  const index = await fs.readFile(
    f.store.p(`views/${release}/wiki/_index.md`),
    "utf8",
  );
  assert.match(index, /Distinguish author-specific meanings/);
  assert.match(index, /_topics\//);
  const catalogue = await readJson(
    f.store.p(`views/${release}/catalogue.json`),
  );
  assert(
    catalogue.entries.some(
      (r: any) =>
        r.record_ref.id === "knowledge:handling" &&
        /Check room/.test(r.summary),
    ),
  );
  assert(!catalogue.entries.some((r: any) => r.record_type === "passage"));
  const mapping = await readJson(f.store.p(`views/${release}/search-map.json`));
  const entries = Object.values(mapping).filter(
    (r: any) => r.record_ref.id === "knowledge:handling",
  ) as any[];
  assert.deepEqual(entries.map((r) => r.level).sort(), ["account", "summary"]);
  const topic = await fs.readFile(
    f.store.p(
      `views/${release}/wiki/_topics/${hash("fictional_workshop").slice(0, 24)}.md`,
    ),
    "utf8",
  );
  assert.match(topic, /challenges/);
  assert.match(topic, /incompatible|disagree/);
  for (const match of topic.matchAll(/\]\(([^)]+)\)/g))
    await fs.access(f.store.p(`views/${release}/wiki/_topics/${match[1]}`));
  assert.equal((await projections.receipt()).wiki.state, "ready");
});

test("the public API preserves full-record reads and adds progressive operations", async () => {
  const f = await published("progressive-api"),
    api = new KnowledgeSystem(f.store);
  const old = await api.call("kb_read", {
    record_ref: exact("knowledge:handling"),
  });
  assert.equal(old.record.id, "knowledge:handling");
  const next = await api.call("kb_read", {
    kind: "account",
    record_ref: exact("knowledge:handling"),
  });
  assert.equal(next.interface_version, "1.0.0");
  assert.equal(next.content.text, old.body);
  const schema = await api.call("kb_read", { kind: "schema", name: "reading" });
  assert.equal(schema.properties.interface_version.const, "1.0.0");
});

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import * as fs from "node:fs/promises";
import { readFileSync } from "node:fs";
import { published } from "./helpers.js";
import { Jobs } from "../src/jobs.js";
import { Notes, splitNote } from "../src/notes.js";
import { APP, readJson } from "../src/core.js";
import { parse as parseYaml } from "yaml";

async function converted(label: string) {
  const f = await published(label);
  const jobs = new Jobs(f.store);
  const file = f.store.p(
    "../" + path.basename(f.store.root) + "-ventilation.md",
  );
  await fs.writeFile(
    file,
    "# Ventilation notice\n\nIn a humid workshop, a lantern with an amber badge may be moved only after the vent has run for ten minutes.\n\nThe notice says nothing about opening the valve.\n",
  );
  const created = await jobs.ingest({
    paths: [file],
    module: "workshop",
    domains: ["fictional_workshop"],
    idempotency_key: label,
    authorization: "Exercise note authoring",
  });
  const id = created.job.job_id;
  const after = await jobs.convert(id);
  const unit = after.job.coverage[0].unit_id;
  const drafts = f.store.p("../" + path.basename(f.store.root) + "-drafts");
  await fs.mkdir(drafts, { recursive: true });
  return { ...f, jobs, id, unit, drafts, notes: new Notes(jobs) };
}

const explanation = (slug: string, unit: string, extra = "") => `---
id: ${slug}
type: knowledge
form: explanation
title: The ${slug} account
${extra}cites: [${unit}]
---
The notice adds a ventilation wait before an amber-badged lantern is moved in a humid workshop.`;

const stagedRecords = async (f: { jobs: Jobs; id: string }) =>
  (await readJson<any>(path.join(f.jobs.jobPath(f.id), "staged.json")))
    .records as any[];

test("kb_write stages notes from files and names every failing note by file", async () => {
  const f = await converted("notes-files");
  const good = path.join(f.drafts, "a-good.md");
  const twoProblems = path.join(f.drafts, "b-two-problems.md");
  const oneProblem = path.join(f.drafts, "c-one-problem.md");
  await fs.writeFile(good, explanation("good-note", f.unit));
  await fs.writeFile(
    twoProblems,
    `---\nid: two-problems\ntype: knowledge\nform: explanation\ncites: [${f.unit}]\nlinks:\n  - qualifies: nowhere-note\n    why: It narrows the rule.\n---\nBody text for the note.`,
  );
  await fs.writeFile(
    oneProblem,
    `---\nid: one-problem\ntype: knowledge\nform: explanation\ntitle: Missing grounding\n---\nA claim with no evidence.`,
  );
  const before = (await stagedRecords(f)).length;
  const failure = await f.notes
    .write({ job_id: f.id, paths: [f.drafts] })
    .catch((e) => e);
  assert.equal(failure.code, "VALIDATION_FAILED");
  const errors: any[] = failure.details.errors;
  const files = errors.map((e) => path.basename(e.file));
  // Every failing note is reported in one call, with its file; the good one isn't.
  assert(files.includes("b-two-problems.md"));
  assert(files.includes("c-one-problem.md"));
  assert(!files.includes("a-good.md"));
  assert(errors.some((e) => /title is required/.test(e.message)));
  assert(errors.some((e) => /ungrounded/.test(e.message)));
  assert.equal((await stagedRecords(f)).length, before, "nothing staged");

  // Fixing the files in place and calling again with the same paths stages everything.
  await fs.writeFile(twoProblems, explanation("two-problems", f.unit));
  await fs.writeFile(oneProblem, explanation("one-problem", f.unit));
  const staged: any = await f.notes.write({
    job_id: f.id,
    paths: [f.drafts],
  });
  assert.equal(staged.status, "staged");
  assert.deepEqual(staged.notes.map((n: any) => n.slug).sort(), [
    "good-note",
    "one-problem",
    "two-problems",
  ]);
});

test("kb_write reads JSON frontmatter, since JSON is valid YAML", async () => {
  const f = await converted("notes-json");
  const note = `---\n${JSON.stringify({
    id: "json-note",
    type: "knowledge",
    form: "explanation",
    title: "A note whose frontmatter is JSON: colons, commas, and all",
    summary: "Summary text: with a colon, and a comma",
    cites: [f.unit],
    assess: {
      evidence: {
        level: "moderate",
        basis: "worked_case",
        why: "One notice, read once, with no second source",
      },
    },
  })}\n---\nThe notice adds a ventilation wait.`;
  const staged: any = await f.notes.write({ job_id: f.id, notes: [note] });
  assert.equal(staged.status, "staged");
  const record = (await stagedRecords(f)).find(
    (r) => r.record_type === "knowledge",
  );
  assert.equal(
    record.assessments.evidence.rationale,
    "One notice, read once, with no second source",
  );
});

test("a flow mapping that splits a reason at a comma is refused, naming the stray key", async () => {
  const f = await converted("notes-flow-mapping");
  const note = explanation(
    "flow-note",
    f.unit,
    "assess:\n  evidence: {level: moderate, basis: worked_case, why: One notice, read once}\n",
  );
  const failure = await f.notes
    .write({ job_id: f.id, notes: [note] })
    .catch((e) => e);
  assert.equal(failure.code, "VALIDATION_FAILED");
  assert.match(failure.message, /assess\.evidence/);
  assert.match(failure.message, /read once/);
  for (const [field, value] of [
    ["priority", "priority: {impact: high, effort: low, why: Cheap, useful}"],
    [
      "links",
      "links:\n  - {qualifies: knowledge:handling, why: Narrower, humid only}",
    ],
  ]) {
    const other = explanation("flow-" + field, f.unit, value + "\n").replace(
      "type: knowledge",
      field === "priority"
        ? "type: question\nrelated: [knowledge:handling]"
        : "type: knowledge",
    );
    const refused = await f.notes
      .write({ job_id: f.id, notes: [other] })
      .catch((e) => e);
    assert.equal(refused.code, "VALIDATION_FAILED", field);
    assert.match(refused.message, new RegExp(field), field);
  }
});

test("replacing a staged proposal that created passages stages the new version", async () => {
  const f = await converted("notes-replace");
  const first: any = await f.notes.write({
    job_id: f.id,
    proposal_id: "notes-replace-batch",
    notes: [explanation("replaced-note", f.unit)],
  });
  assert.equal(first.passages_created, 1);
  const second: any = await f.notes.write({
    job_id: f.id,
    proposal_id: "notes-replace-batch",
    replace: true,
    notes: [
      explanation("replaced-note", f.unit).replace(
        "The notice adds",
        "Rewritten: the notice adds",
      ),
    ],
  });
  assert.equal(second.status, "staged");
  const records = await stagedRecords(f);
  assert.equal(records.filter((r) => r.record_type === "knowledge").length, 1);
  assert.equal(records.filter((r) => r.record_type === "passage").length, 1);
  const staged = await readJson<any>(
    path.join(f.jobs.jobPath(f.id), "staged.json"),
  );
  const ids = new Set(records.map((r) => r.id));
  for (const reference of Object.values<any>(staged.local_refs))
    assert(ids.has(reference.id), `stale local ref ${reference.id}`);
});

test("parallel kb_write calls into one job keep every slug", async () => {
  const f = await converted("notes-parallel");
  await Promise.all(
    ["left-note", "right-note", "middle-note"].map((slug) =>
      f.notes.write({ job_id: f.id, notes: [explanation(slug, f.unit)] }),
    ),
  );
  const linking = explanation(
    "linking-note",
    f.unit,
    "uses: [left-note, right-note, middle-note]\n",
  );
  const staged: any = await f.notes.write({
    job_id: f.id,
    notes: [linking],
  });
  assert.equal(staged.status, "staged");
});

test("staging a folder again refuses notes already staged, and a replacement updates them in place", async () => {
  const f = await converted("notes-restage");
  const file = path.join(f.drafts, "only.md");
  await fs.writeFile(file, explanation("staged-once", f.unit));
  await f.notes.write({
    job_id: f.id,
    paths: [f.drafts],
    proposal_id: "notes-span-1",
  });
  await fs.writeFile(
    file,
    explanation("staged-once", f.unit).replace(
      "The notice",
      "Edited: the notice",
    ),
  );
  const again = await f.notes
    .write({ job_id: f.id, paths: [f.drafts] })
    .catch((e) => e);
  assert.equal(again.code, "VALIDATION_FAILED");
  assert.match(again.message, /already staged in this job/);
  const replaced: any = await f.notes.write({
    job_id: f.id,
    paths: [f.drafts],
    proposal_id: "notes-span-1",
    replace: true,
  });
  assert.equal(replaced.status, "staged");
  const knowledge = (await stagedRecords(f)).filter(
    (r) => r.record_type === "knowledge",
  );
  assert.equal(knowledge.length, 1, "one record, not two");
});

test("a cites flow mapping that cuts a quote at a comma is refused", async () => {
  const f = await converted("notes-cites-flow");
  const note = explanation("cited", f.unit).replace(
    `cites: [${f.unit}]`,
    `cites: [{unit: ${f.unit}, quote: In a humid workshop, a lantern with an amber badge}]`,
  );
  const refused = await f.notes
    .write({ job_id: f.id, notes: [note] })
    .catch((e) => e);
  assert.equal(refused.code, "VALIDATION_FAILED");
  assert.match(refused.message, /cites\[0\]/);
});

test("every bad exemplifies link is reported in one refusal, with its file", async () => {
  const f = await converted("notes-exemplifies");
  const target = `---\nid: vent-procedure\ntype: knowledge\nform: procedure\ntitle: Run the vent before moving\nfacets:\n  purpose:\n    - text: Move a lantern safely\n      abstract: Make a transfer safe\n  mechanism:\n    - text: Run the vent first\n      abstract: Clear a hazard before acting\ncites: [${f.unit}]\n---\nRun the vent for ten minutes, then move the lantern.`;
  const claim = (slug: string) =>
    explanation(
      slug,
      f.unit,
      "links:\n  - exemplifies: vent-procedure\n    why: It shows the procedure.\n",
    );
  await fs.writeFile(path.join(f.drafts, "a.md"), target);
  await fs.writeFile(path.join(f.drafts, "b.md"), claim("first-claim"));
  await fs.writeFile(path.join(f.drafts, "c.md"), claim("second-claim"));
  const refused = await f.notes
    .write({ job_id: f.id, paths: [f.drafts] })
    .catch((e) => e);
  const errors = refused.details.errors.filter((e: any) =>
    /exemplifies runs from an attributable case/.test(e.message),
  );
  assert.deepEqual(
    errors.map((e: any) => path.basename(e.file)),
    ["b.md", "c.md"],
  );
});

test("every note and frontmatter example in the notes guide parses", () => {
  const guide = readFileSync(
    path.join(APP, "plugin/skills/know-fu/references/notes.md"),
    "utf8",
  );
  let notes = 0,
    yaml = 0;
  for (const [, lang, body] of guide.matchAll(/```(\w+)\n([\s\S]*?)```/g)) {
    if (lang === "markdown" && body.startsWith("---")) {
      splitNote(body.replace(/\n\.\.\.\n/g, "\n"));
      notes++;
    } else if (lang === "yaml") {
      parseYaml(body);
      yaml++;
    }
  }
  assert(
    notes >= 2 && yaml >= 3,
    `checked ${notes} notes and ${yaml} yaml blocks`,
  );
});

import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import * as fs from "node:fs/promises";
import { published } from "./helpers.js";
import { Jobs } from "../src/jobs.js";
import { Notes, facetsFrom, splitNote } from "../src/notes.js";
import { facetsOnlyRevision } from "../src/store.js";
import { Recall } from "../src/recall.js";
import { Brief } from "../src/brief.js";
import { hash, key, objectPath, readJson } from "../src/core.js";
import type { RecordData } from "../src/core.js";
import { normalizeForQuote, quoteFound } from "../src/quote.js";

const noIndex = { fresh: async () => false, receipt: async () => null } as any;

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
  return { ...f, jobs, id, unit, notes: new Notes(jobs) };
}

test("quote matching folds typography but rejects paraphrase", () => {
  assert.equal(normalizeForQuote("“Ready”—it’s  fine"), '"ready"-it\'s fine');
  assert(
    quoteFound(
      "may be moved only after the vent",
      "a lantern may be\nmoved only after the vent has run",
    ),
  );
  assert(quoteFound("compari-\nson of methods", "comparison of methods"));
  assert(
    !quoteFound(
      "can be moved once the vent runs",
      "may be moved only after the vent has run",
    ),
  );
});

test("a note needs frontmatter, a slug and grounding", async () => {
  assert.throws(() => splitNote("no frontmatter"), /frontmatter/);
  const f = await converted("notes-grounding");
  await assert.rejects(
    f.notes.write({
      job_id: f.id,
      notes: ["---\nid: Bad Slug\ntype: knowledge\ntitle: x\n---\nBody"],
    }),
    /slug/,
  );
  await assert.rejects(
    f.notes.write({
      job_id: f.id,
      notes: [
        "---\nid: floating\ntype: knowledge\ntitle: Floating claim\n---\nA claim with no evidence.",
      ],
    }),
    /ungrounded/,
  );
});

test("notes stage verified passages, typed links and quotes; slugs carry across batches", async () => {
  const f = await converted("notes-stage");
  const wrongQuote = `---
id: humid-rule
type: knowledge
form: procedure
title: Humid-room handling needs ten minutes of ventilation
facets:
  purpose:
    - text: Move an amber-badged lantern safely in a humid workshop
      abstract: Make a transfer safe under a risky ambient condition
  mechanism:
    - text: Run the vent for ten minutes before moving
      abstract: Clear the hazard for a fixed time before acting
cites:
  - unit: ${f.unit}
    quote: "can be moved once the vent runs"
---
In a humid workshop the notice adds a ventilation wait.`;
  const failure = await f.notes
    .write({ job_id: f.id, notes: [wrongQuote] })
    .catch((e) => e);
  assert.equal(failure.code, "QUOTE_NOT_FOUND");
  assert.match(JSON.stringify(failure.details), /closest wording/);

  const note = `---
id: humid-rule
type: knowledge
form: procedure
title: Humid-room handling needs ten minutes of ventilation
facets:
  purpose:
    - text: Move an amber-badged lantern safely in a humid workshop
      abstract: Make a transfer safe under a risky ambient condition
  mechanism:
    - text: Run the vent for ten minutes before moving
      abstract: Clear the hazard for a fixed time before acting
summary: In a humid room, run the vent ten minutes before moving an amber-badged lantern.
holds_when: humid workshop
cites:
  - unit: ${f.unit}
    quote: "may be moved only after the vent has run for ten minutes"
links:
  - qualifies: knowledge:handling
    why: The handbook has no humid-room rule; this notice supplies one for moving, not for the valve.
---
The ventilation notice fills the handbook's humid-room gap for moving the lantern. It does not change the valve rule.`;
  const preview: any = await f.notes.write({
    job_id: f.id,
    notes: [note],
    dry_run: true,
  });
  assert.equal(preview.status, "valid");
  assert.equal(preview.passages_created, 1);
  assert.equal(preview.relationships, 1);
  const staged: any = await f.notes.write({ job_id: f.id, notes: [note] });
  assert.equal(staged.status, "staged");
  assert.equal(staged.citations_verified, 1);

  const batch = await readJson<any>(
    path.join(f.jobs.jobPath(f.id), "staged.json"),
  );
  const records: RecordData[] = batch.records;
  const knowledge = records.find((r) => r.title.startsWith("Humid-room"))!;
  const passage = records.find((r) => r.record_type === "passage")!;
  const link = records.find((r) => r.record_type === "relationship")!;
  assert.equal(knowledge.epistemic, "source_account");
  assert.deepEqual(knowledge.scope.conditions, ["humid workshop"]);
  assert.equal(
    (knowledge.extensions as any).citations[0].quote,
    "may be moved only after the vent has run for ten minutes",
  );
  assert.equal(
    key((knowledge.extensions as any).citations[0].ref),
    key(passage),
  );
  assert.equal((link.payload as any).predicate, "qualifies");
  assert.equal((link.payload as any).object.id, "knowledge:handling");
  assert.equal((link.payload as any).materiality, "essential");

  // A later batch refers to the earlier note by slug and reuses its passage.
  const lesson = `---
id: humid-lesson
type: learning
form: worked_example
title: Moving a lantern on a humid day
uses: [humid-rule, knowledge:handling]
cites: [${f.unit}]
---
Check the badge is amber and the valve closed, then run the vent ten minutes before moving the lantern.`;
  const second: any = await f.notes.write({ job_id: f.id, notes: [lesson] });
  assert.equal(second.passages_created, 0);
  const after = (
    await readJson<any>(path.join(f.jobs.jobPath(f.id), "staged.json"))
  ).records as RecordData[];
  const learning = after.find((r) => r.record_type === "learning")!;
  assert.deepEqual(
    (learning.payload as any).knowledge_refs.map((r: any) => r.id).sort(),
    [knowledge.id, "knowledge:handling"].sort(),
  );
});

test("published notes are recalled with their verified quote and qualify the older procedure", async () => {
  const f = await converted("notes-publish");
  const note = `---
id: humid-rule
type: knowledge
form: procedure
title: Humid-room handling needs ten minutes of ventilation
facets:
  purpose:
    - text: Move an amber-badged lantern safely in a humid workshop
      abstract: Make a transfer safe under a risky ambient condition
  mechanism:
    - text: Run the vent for ten minutes before moving
      abstract: Clear the hazard for a fixed time before acting
cites:
  - unit: ${f.unit}
    quote: "may be moved only after the vent has run for ten minutes"
links:
  - qualifies: knowledge:handling
    why: Supplies the humid-room rule the handbook lacks.
---
Run the vent ten minutes before moving an amber-badged lantern in a humid workshop.`;
  await f.notes.write({ job_id: f.id, notes: [note] });
  const job = await f.jobs.load(f.id);
  job.stage = "reweave";
  for (const unit of job.coverage)
    Object.assign(unit, {
      read: "complete",
      integrated: "complete",
      checked: "complete",
    });
  await f.jobs.save(job);
  const plan = await f.jobs.reweavePlan(f.id);
  assert(
    plan.targets.some((t: any) => t.record_ref.id === "knowledge:handling"),
  );
  await f.jobs.submit(f.id, {
    step_id: "reweave",
    stage: "reweave",
    summary:
      "The humid-room notice qualifies the handling procedure; full revision deferred.",
    resolutions: plan.targets.map((t: any) => ({
      record_ref: t.record_ref,
      decision: "pending",
      rationale:
        "Deferred in this fixture; the qualification travels with recall meanwhile.",
    })),
  });
  await f.jobs.submit(f.id, {
    step_id: "compile",
    stage: "compile",
    summary: "No primer change is warranted for this small notice.",
  });
  await f.jobs.submit(f.id, {
    step_id: "check",
    stage: "check",
    summary: "Quote verified by the engine; recall carries the qualification.",
    capability: "not_assessed",
    understanding_change: {
      added: ["A humid-room ventilation wait before moving a lantern."],
      revised_refs: [],
      unresolved: [],
      checks: [],
    },
  });
  const result: any = await f.jobs.publish(f.id);
  assert.equal(result.status, "canonical_committed");
  const recall: any = await new Recall(f.store, noIndex).recall({
    query: "move lantern amber badge humid workshop",
    purpose: "apply",
  });
  assert.match(
    recall.briefing,
    /Qualified by Humid-room handling needs ten minutes of ventilation/,
  );
  const deep: any = await new Recall(f.store, noIndex).recall({
    query: "humid workshop ventilation ten minutes",
    purpose: "apply",
  });
  assert.match(
    deep.briefing,
    /> "may be moved only after the vent has run for ten minutes" \(lines \d+-\d+, verified\)/,
  );
});

test("a reaffirmation is a one-line note that inherits the current revision", async () => {
  const f = await converted("notes-reaffirm");
  const staged: any = await f.notes.write({
    job_id: f.id,
    notes: [
      `---\nid: handling-still-holds\nrevises: knowledge:handling@1\nreaffirm: The ventilation notice adds a humid-room wait but leaves the dry-room procedure unchanged.\n---\n`,
    ],
  });
  assert.equal(staged.notes[0].ref, "knowledge:handling@2");
  const batch = await readJson<any>(
    path.join(f.jobs.jobPath(f.id), "staged.json"),
  );
  const revised: RecordData = batch.records.find(
    (r: RecordData) => r.id === "knowledge:handling",
  );
  const original = f.records.find((r) => r.id === "knowledge:handling")!;
  assert.equal(revised.title, original.title);
  assert.equal(revised.body!.sha256, original.body!.sha256);
  assert.deepEqual(revised.payload, original.payload);
  assert.deepEqual(revised.scope, original.scope);
  assert.match(revised.change_reason, /^Reaffirmed: The ventilation notice/);
  await assert.rejects(
    f.notes.write({
      job_id: f.id,
      notes: [`---\nid: no-reason\nrevises: knowledge:courier@1\n---\n`],
    }),
    /reason/,
  );
});

test("an assessment needs its reason, and a revision keeps the dimensions it leaves out", async () => {
  const f = await converted("notes-assess");
  // Publish handling@2 with an evidence assessment, as an earlier ingest would have.
  const old = (await f.store.records()).get("knowledge:handling")!;
  const assessedRevision = {
    ...structuredClone(old),
    revision: old.revision + 1,
    change_reason: "Fixture assessment",
    assessments: {
      ...old.assessments,
      evidence: {
        level: "moderate",
        rationale: "Two workshop inspections agree.",
        context: null,
      },
    },
  } as RecordData;
  const body = await f.store.body(old);
  assessedRevision.body = {
    path: objectPath(assessedRevision) + "/body.md",
    sha256: hash(body),
  };
  await f.store.publish(
    [assessedRevision],
    { [key(assessedRevision)]: body },
    await f.store.current(),
    "Fixture assessment",
    f.scope,
  );
  await f.jobs.action(f.id, "rebase");
  const note = (assess: string) =>
    `---\nid: handling-checked\nrevises: knowledge:handling@2\nreaffirm: Checked against the handbook page.\nassess:\n${assess}\n---\n`;
  await assert.rejects(
    f.notes.write({
      job_id: f.id,
      notes: [note("  fidelity: {level: high}")],
    }),
    /needs a one-line why/,
  );
  await assert.rejects(
    f.notes.write({
      job_id: f.id,
      notes: [note("  fidelity: {level: strong, why: Read twice}")],
    }),
    /must be one of/,
  );
  await assert.rejects(
    f.notes.write({
      job_id: f.id,
      notes: [note("  evidence: {level: moderate, why: The handbook says so}")],
    }),
    /needs a basis/,
  );
  // One source family cannot carry "high" on a worked case, however often it is repeated.
  await assert.rejects(
    f.notes.write({
      job_id: f.id,
      notes: [
        note(
          "  evidence: {level: high, basis: worked_case, why: One workshop example}",
        ),
      ],
    }),
    /at least two independent source families, and this note rests on 1/,
  );
  await f.notes.write({
    job_id: f.id,
    notes: [
      note(
        "  fidelity: {level: high, why: Checked word for word against the handbook page}",
      ),
    ],
  });
  const batch = await readJson<any>(
    path.join(f.jobs.jobPath(f.id), "staged.json"),
  );
  const revised: RecordData = batch.records.find(
    (r: RecordData) => r.id === "knowledge:handling",
  );
  assert.equal(revised.assessments.fidelity.level, "high");
  assert.equal(revised.assessments.evidence.level, "moderate");
  assert.equal(
    revised.assessments.evidence.rationale,
    "Two workshop inspections agree.",
  );
  assert.equal(revised.assessments.applicability.level, "not_assessed");
});

test("facets say what a mechanism or procedure does, in its own terms and in domain-free words", async () => {
  const f = await converted("notes-facets");
  const procedure = (facets: string) => `---
id: vent-first
type: knowledge
form: procedure
title: Vent before moving in a humid workshop
cites: [${f.unit}]
${facets}---
Run the vent for ten minutes before moving the lantern.`;
  await assert.rejects(
    f.notes.write({ job_id: f.id, notes: [procedure("")], dry_run: true }),
    /says what it does: add facets/,
  );
  await assert.rejects(
    f.notes.write({
      job_id: f.id,
      notes: [
        procedure(
          "facets:\n  purpose:\n    - text: Move the lantern safely\n  mechanism:\n    - text: Run the vent first\n      abstract: Clear the hazard before acting\n",
        ),
      ],
      dry_run: true,
    }),
    /needs an abstract wording/,
  );
  await assert.rejects(
    f.notes.write({
      job_id: f.id,
      notes: [
        procedure(
          "facets:\n  purpose:\n    - text: Move the lantern safely\n      abstract: Move the lantern safely\n  mechanism:\n    - text: Run the vent first\n      abstract: Clear the hazard before acting\n",
        ),
      ],
      dry_run: true,
    }),
    /repeats the text/,
  );
  await assert.rejects(
    f.notes.write({
      job_id: f.id,
      notes: [
        procedure(
          "facets:\n  purpose:\n    - text: Move the lantern safely\n      abstract: Make a transfer safe under a risky ambient condition that keeps on changing through the day\n  mechanism:\n    - text: Run the vent first\n      abstract: Clear the hazard before acting\n",
        ),
      ],
      dry_run: true,
    }),
    /15 words or fewer/,
  );
  await assert.rejects(
    f.notes.write({
      job_id: f.id,
      notes: [procedure("facets:\n  goal:\n    - text: Move it\n")],
      dry_run: true,
    }),
    /isn't a facet slot/,
  );
  await f.notes.write({
    job_id: f.id,
    notes: [
      procedure(
        "facets:\n  purpose:\n    - text: Move the lantern safely in humid air\n      abstract: Make a transfer safe under a risky ambient condition\n  mechanism:\n    - text: Run the vent for ten minutes first\n      abstract: Clear the hazard for a fixed time before acting\n  failure_modes:\n    - Moving before the vent has run\n",
      ),
    ],
  });
  const batch = await readJson<any>(
    path.join(f.jobs.jobPath(f.id), "staged.json"),
  );
  const staged: RecordData = batch.records.find(
    (r: RecordData) => r.title === "Vent before moving in a humid workshop",
  );
  const facets = (staged.extensions as any).functional_facets;
  assert.equal(
    facets.purpose[0].abstract,
    "Make a transfer safe under a risky ambient condition",
  );
  assert.equal(facets.purpose[0].basis, "source_stated");
  assert.deepEqual(facets.failure_modes[0], {
    text: "Moving before the vent has run",
    basis: "source_stated",
    evidence_refs: [],
  });

  // A one-line reaffirmation of an older procedure needs no facets, and the brief counts the gap.
  await f.notes.write({
    job_id: f.id,
    notes: [
      `---\nid: handling-still-holds\nrevises: knowledge:handling@1\nreaffirm: The notice leaves the dry-room procedure unchanged.\n---\n`,
    ],
  });
  const brief: any = await new Brief(f.store).brief({});
  assert.match(
    brief.briefing,
    /Facets: \d+ of \d+ mechanism and procedure accounts don't yet say what they do/,
  );
});

test("adding facets to an existing account reopens nothing and doesn't make the primer stale", async () => {
  const f = await published("notes-facets-only");
  const old = (await f.store.records()).get("knowledge:handling")!;
  const body = await f.store.body(old);
  const withFacets: any = structuredClone(old);
  withFacets.revision = old.revision + 1;
  withFacets.change_reason = "Added functional facets";
  withFacets.extensions = {
    ...(old.extensions ?? {}),
    functional_facets: facetsFrom(
      {
        purpose: [
          {
            text: "Decide when a lantern may be moved",
            abstract: "Decide when a transfer is safe",
          },
        ],
        mechanism: [
          {
            text: "Check badge colour and valve state together",
            abstract: "Require two independent conditions before acting",
          },
        ],
      },
      "test",
      old.epistemic,
    ),
  };
  withFacets.body = {
    path: objectPath(withFacets) + "/body.md",
    sha256: hash(body),
  };
  assert(facetsOnlyRevision(old, withFacets));
  const result = await f.store.publish(
    [withFacets],
    { [key(withFacets)]: body },
    await f.store.current(),
    "Add facets",
    f.scope,
  );
  assert.deepEqual(result.impacts, []);
  const brief: any = await new Brief(f.store).brief({});
  assert.match(brief.briefing, /learning:primer@1 · current/);
  // A change of meaning is still material, and so is a reaffirmation that changes nothing.
  const changed = { ...structuredClone(withFacets), title: "A new claim" };
  assert(!facetsOnlyRevision(old, changed));
  assert(
    !facetsOnlyRevision(old, {
      ...structuredClone(old),
      revision: old.revision + 1,
    }),
  );
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { published } from "./helpers.js";
import { Recall } from "../src/recall.js";
import { Brief } from "../src/brief.js";
import { Ideas } from "../src/ideas.js";
import { Governance } from "../src/governance.js";
import { hash, key, objectPath } from "../src/core.js";
import type { RecordData } from "../src/core.js";

const noIndex = { fresh: async () => false, receipt: async () => null } as any;
type Library = Awaited<ReturnType<typeof published>>;

/** Publishes a new record cloned from an existing one of the same family. */
async function plant(
  f: Library,
  from: string,
  id: string,
  change: (r: RecordData) => void,
  body?: string,
) {
  const record = structuredClone((await f.store.records()).get(from)!);
  record.id = id;
  record.revision = 1;
  record.supersedes = [];
  record.change_reason = "Planted for the test";
  change(record);
  const bodies: Record<string, string> = {};
  if (record.body) {
    const text =
      body ?? (await f.store.body((await f.store.records()).get(from)!));
    record.body = { path: objectPath(record) + "/body.md", sha256: hash(text) };
    bodies[key(record)] = text;
  }
  await f.store.publish(
    [record],
    bodies,
    await f.store.current(),
    "Planted",
    f.scope,
  );
  return record;
}

/** A second topic with one account linked to the workshop and one that only does the same job. */
async function twoTopics(label: string) {
  const f = await published(label);
  await new Governance(f.store).configure({
    domains: [{ domain_id: "garden", title: "Garden" }],
    authorization: "Add a garden topic for the test",
  });
  await plant(
    f,
    "knowledge:qualified-permission",
    "knowledge:garden-linked",
    (r) => {
      r.title = "Seed trays sprout only when warm and moist together";
      r.scope.domains = ["garden"];
      r.extensions = {};
      (r.payload as any).summary =
        "Warmth alone or moisture alone does nothing.";
    },
    "Seed trays sprout only when warmth and moisture arrive together.",
  );
  await plant(
    f,
    "knowledge:qualified-permission",
    "knowledge:garden-function",
    (r) => {
      r.title = "Germination gate";
      r.scope.domains = ["garden"];
      r.epistemic = "source_account";
      r.provenance.input_refs = [];
      r.depends_on = [...r.provenance.source_refs];
      (r.payload as any).summary = "Seeds wait for the season.";
      (r.payload as any).concept_refs = [];
      r.extensions = {
        functional_facets: {
          purpose: [
            {
              text: "Hold seeds dormant until spring",
              abstract:
                "Allow an action only when every necessary condition holds",
              basis: "source_stated",
              evidence_refs: [],
            },
          ],
          mechanism: [
            {
              text: "Seed coats soften with warmth and moisture",
              abstract: "Several independent conditions must each be met",
              basis: "source_stated",
              evidence_refs: [],
            },
          ],
        },
      };
    },
    "Seeds stay dormant until the season turns.",
  );
  return f;
}

test("invent stays inside named topics unless cross_domain asks for bridges", async () => {
  const f = await twoTopics("invent-bridges");
  const recall = new Recall(f.store, noIndex);
  const query = "a permission that depends on several necessary conditions";
  const inside: any = await recall.recall({
    query,
    purpose: "invent",
    domains: ["fictional_workshop"],
  });
  assert.doesNotMatch(inside.briefing, /Seed trays|Germination gate/);
  assert.match(
    inside.briefing,
    /2 account\(s\) in other topics connect to these .* cross_domain:true/,
  );
  assert.match(inside.briefing, /no other topics \(cross_domain off\)/);
  const across: any = await recall.recall({
    query,
    purpose: "invent",
    domains: ["fictional_workshop"],
    cross_domain: true,
    graph: false,
  });
  assert.match(across.briefing, /## From other topics: possible bridges/);
  assert.match(
    across.briefing,
    /knowledge:garden-linked@1 · Seed trays[^\n]*\n  linked: How the handbook permits moving a lantern → feeds → Seed trays/,
  );
  assert.match(
    across.briefing,
    /knowledge:garden-function@1 · Germination gate\n  matched by what it does: Allow an action only when every necessary condition holds/,
  );
  assert.deepEqual(across.slate.bridges.map(key).sort(), [
    "knowledge:garden-function@1",
    "knowledge:garden-linked@1",
  ]);
  // Facets show in domain-free words, so the agent can carry a mechanism across.
  assert.match(
    across.briefing,
    /\nDoes: Identify whether a stated permission follows from all its prerequisites\.\nSources: /,
  );
  // Explain never shows the slate.
  const explain: any = await recall.recall({ query, purpose: "explain" });
  assert.doesNotMatch(
    explain.briefing,
    /possible bridges|Ideas on file|cross_domain/,
  );
});

test("invent lists ideas on file, failures with their reason, and keeps room for them", async () => {
  const f = await published("invent-ideas");
  const ideas = new Ideas(f.store);
  const proposed: any = await ideas.call({
    action: "propose",
    title: "Two-sensor gate",
    statement:
      "Gate lantern moves on a second, independent valve sensor instead of the badge colour alone.",
    kill_test: "Two sensors fail together as often as one.",
    premises: ["knowledge:handling", "knowledge:qualified-permission"],
    pass_rule: "Failed moves fall by half over 1,000 simulated moves",
    authorization: "save it",
  });
  await ideas.call({
    action: "result",
    idea: proposed.ideas[0].id,
    tool: "lantern-sim",
    version: "0.4",
    outcome: "fail",
    trials: 8,
    failure: {
      kind: "idea",
      reason: "Humidity fools both sensors at once",
    },
    authorization: "record it",
  });
  const result: any = await new Recall(f.store, noIndex).recall({
    query: "necessary conditions before a lantern may move",
    purpose: "invent",
  });
  assert.match(
    result.briefing,
    /## Ideas on file[^\n]*\n- idea:[^\n]*· refuted · Two-sensor gate\n  Idea: Gate lantern moves[^\n]*\n  Failed because: Humidity fools both sensors at once/,
  );
  assert.equal(result.slate.ideas.length, 1);
  assert.ok(result.budget.used <= result.budget.requested);
});

test("the brief and investigate suggest unweighed challenges, thin foundations and unbounded mechanisms", async () => {
  const f = await published("gaps");
  // A challenge nobody has weighed.
  await plant(
    f,
    "relationship:challenge",
    "relationship:courier-challenge",
    (r) => {
      const p = r.payload as any;
      p.subject = { id: "knowledge:courier", revision: 1 };
      p.object = { id: "knowledge:qualified-permission", revision: 1 };
      p.rationale = "Courier readiness needs one scan, not several conditions.";
      r.provenance.input_refs = [p.subject, p.object];
      r.depends_on = [...r.provenance.source_refs, p.subject, p.object];
    },
  );
  // A second account building on the handbook's READY concept.
  await plant(
    f,
    "relationship:prerequisite",
    "relationship:second-builder",
    (r) => {
      const p = r.payload as any;
      p.subject = { id: "knowledge:courier", revision: 1 };
      r.provenance.input_refs = [p.subject, p.object];
      r.depends_on = [...r.provenance.source_refs, p.subject, p.object];
    },
  );
  // A central mechanism with no stated limits.
  await plant(
    f,
    "knowledge:qualified-permission",
    "knowledge:boundless",
    (r) => {
      r.title = "Every gate needs two keys";
      r.scope.conditions = [];
      r.scope.exclusions = [];
      r.extensions = {};
      (r.payload as any).concept_refs = [
        { id: "concept:ready-handbook", revision: 1 },
      ];
      r.depends_on = [
        ...r.depends_on,
        { id: "concept:ready-handbook", revision: 1 },
      ];
    },
  );
  const brief: any = await new Brief(f.store).brief({ budget_tokens: 6000 });
  const section = brief.briefing.split("### Questions worth answering next")[1];
  assert.match(section, /What would resolve the valve disagreement\?/);
  assert.match(section, /Suggested by gaps in the library, not yet recorded:/);
  assert.match(
    section,
    /Which holds, and when: "Courier readiness uses a different meaning" or "A permission can depend on several necessary conditions"\? \(one challenges the other and no judgment weighs them/,
  );
  assert.match(
    section,
    /Does "READY in the handling handbook" hold up\? \(2 accounts build on it and it rests on one source/,
  );
  assert.match(
    section,
    /Where does "Every gate needs two keys" stop working\? \(nothing records its conditions, limits or failure modes/,
  );
  // The recorded question about the handbook pair suppresses a suggestion about that pair.
  assert.doesNotMatch(
    section,
    /Which holds, and when: "The alternative handbook/,
  );
  const investigate: any = await new Recall(f.store, noIndex).recall({
    query: "courier readiness scan permission conditions",
    purpose: "investigate",
  });
  assert.match(
    investigate.briefing,
    /## Gaps around these accounts, not yet recorded as questions\n- Which holds, and when: "Courier readiness/,
  );
});

import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import { published } from "./helpers.js";
import { Store } from "../src/store.js";
import { Lifecycle } from "../src/lifecycle.js";
import { Maintenance } from "../src/maintenance.js";
import {
  atomic,
  json,
  key,
  ref,
  uid,
  VERSION,
  type RecordData,
  type ProposalData,
} from "../src/core.js";

async function bind(
  store: Store,
  project: string,
  read: string[],
  write: string[],
) {
  const config = await store.config();
  if (!config.modules.some((m) => m.module_id === "public"))
    config.modules.push({
      module_id: "public",
      title: "Public",
      description: "Isolated module",
    });
  config.project_bindings = config.project_bindings.filter(
    (b) => b.project_id !== project,
  );
  config.project_bindings.push({
    project_id: project,
    read_modules: read,
    write_modules: write,
  });
  await atomic(store.p("corpus.json"), json(config));
  return new Store(store.root, project, store.ledgerRoot);
}

async function edit(store: Store, old: RecordData): Promise<ProposalData> {
  return {
    schema_version: VERSION,
    proposal_id: uid("proposal-"),
    job_id: "audit-test",
    base_release: await store.current(),
    scope_policy: await store.scope(),
    items: [
      {
        local_id: "edit",
        existing_ref: ref(old),
        record_type: old.record_type,
        title: old.title + " clarified",
        maintenance_module: old.maintenance_module,
        epistemic: old.epistemic,
        scope: old.scope,
        source_refs: old.provenance.source_refs,
        input_refs: old.provenance.input_refs,
        payload: old.payload,
        body_markdown: (await store.body(old)) || null,
        change_reason: "Clarify wording only",
      },
    ],
  };
}

test("failed release cannot be selected or supply an exact revision; committed history remains readable", async () => {
  const f = await published("audit-publication");
  const old = f.records.find((r) => r.id === "concept:ready-handbook")!;
  const revised = { ...old, revision: 2, title: "Uncommitted definition" };
  process.env.KB_TEST_FAULT = "before_pointer";
  try {
    await assert.rejects(
      () =>
        f.store.publish(
          [revised],
          {},
          f.publication.release_id,
          "Interrupted",
          f.scope,
        ),
      { code: "SIMULATED_CRASH" },
    );
  } finally {
    delete process.env.KB_TEST_FAULT;
  }
  const journal = JSON.parse(
    await fs.readFile(f.store.p("publication.json"), "utf8"),
  );
  assert.equal(await f.store.current(), f.publication.release_id);
  const fresh = new Store(f.store.root, f.store.project, f.store.ledgerRoot);
  await assert.rejects(() => fresh.read(ref(revised)), {
    code: "VALIDATION_FAILED",
  });
  await assert.rejects(() => fresh.records(journal.release.release_id), {
    code: "VALIDATION_FAILED",
  });
  await fresh.publish(
    [revised],
    {},
    f.publication.release_id,
    "Committed revision",
    f.scope,
  );
  assert.equal((await fresh.read(ref(revised))).record.title, revised.title);
  assert.equal((await fresh.read(ref(old))).record.title, old.title);
  assert.equal(
    (await fresh.records(f.publication.release_id)).get(old.id)?.revision,
    1,
  );
});

for (const state of ["withdrawn", "superseded", "archived"] as const)
  test(`ordinary compile preserves ${state} state and supersession history`, async () => {
    const f = await published("audit-lifecycle");
    const old = structuredClone(
      f.records.find((r) => r.id === "concept:ready-handbook")!,
    );
    old.revision++;
    old.lifecycle = state === "archived" ? "active" : state;
    old.archived = state === "archived";
    old.supersedes = [{ id: "concept:ready-courier", revision: 1 }];
    await f.store.publish(
      [old],
      {},
      await f.store.current(),
      "Lifecycle fixture",
      f.scope,
    );
    const proposal = await edit(f.store, old);
    const compiled = await f.store.compile(proposal);
    assert.equal(compiled.records[0].lifecycle, old.lifecycle);
    assert.equal(compiled.records[0].archived, old.archived);
    assert.deepEqual(compiled.records[0].supersedes, old.supersedes);
    await f.store.publish(
      compiled.records,
      compiled.bodies,
      proposal.base_release,
      "Ordinary edit",
      f.scope,
    );
    assert.equal(
      (await f.store.records()).get(old.id)?.lifecycle,
      old.lifecycle,
    );
  });

test("replacement checks existing ownership at compile and direct publication", async () => {
  const f = await published("audit-ownership");
  const old = f.records.find((r) => r.id === "concept:ready-handbook")!;
  const restricted = await bind(
    f.store,
    "public-writer",
    ["public"],
    ["public"],
  );
  const proposal = await edit(f.store, old);
  proposal.scope_policy = await restricted.scope();
  const item = proposal.items[0];
  item.maintenance_module = "public";
  item.source_refs = [];
  item.input_refs = [];
  item.epistemic = "synthesis";
  item.payload = {
    definition: "A public replacement",
    aliases: [],
    meaning_scope: "Independent",
  };
  await assert.rejects(() => restricted.compile(proposal), {
    code: "SCOPE_DENIED",
  });
  const changed = {
    ...old,
    revision: 2,
    maintenance_module: "public",
    depends_on: [],
    provenance: { ...old.provenance, source_refs: [], input_refs: [] },
    payload: item.payload,
  };
  await assert.rejects(
    () =>
      restricted.publish(
        [changed],
        {},
        proposal.base_release,
        "Replace private identity",
        proposal.scope_policy,
      ),
    { code: "SCOPE_DENIED" },
  );
  assert.equal(
    (await f.store.records()).get(old.id)?.maintenance_module,
    "workshop",
  );
});

test("even a full owner cannot silently transfer a record identity to a different module", async () => {
  const f = await published("audit-transfer");
  const owner = await bind(
    f.store,
    "owner",
    ["workshop", "public"],
    ["workshop", "public"],
  );
  const old = f.records.find((r) => r.id === "concept:ready-handbook")!;
  const proposal = await edit(owner, old);
  proposal.items[0].maintenance_module = "public";
  await assert.rejects(() => owner.compile(proposal), {
    code: "VALIDATION_FAILED",
  });
});

test("purge execution rechecks the executing project and revoked permissions before writing receipts or ledger", async () => {
  const f = await published("audit-purge-authority");
  const projections = {
    graph: async () => ({
      graph: { query: async () => ({}) },
      db: { close: async () => {} },
    }),
    indexName: async () => "audit-isolated-purge",
  } as any;
  const owner = new Lifecycle(f.store, projections);
  const plan = await owner.plan(
    "purge",
    [{ id: "source:handbook", revision: 1 }],
    "Delete fixture",
  );
  const readOnly = await bind(f.store, "readonly", ["workshop"], []);
  const auth = {
    action: "purge",
    targets: plan.targets,
    user_instruction: "Delete the isolated fixture",
  };
  await assert.rejects(
    () => new Lifecycle(readOnly, projections).execute(plan.plan_id, auth),
    { code: "SCOPE_DENIED" },
  );
  assert.equal((await f.store.ledger()).generation, 0);
  await assert.rejects(() =>
    fs.access(f.store.p(`lifecycle/authorizations/${plan.plan_id}.json`)),
  );
  await bind(f.store, f.store.project, ["workshop"], []);
  await assert.rejects(() => owner.execute(plan.plan_id, auth), {
    code: "SCOPE_DENIED",
  });
});

test("whole-library exports deny restricted or unbound callers; wiki edits enforce record visibility", async () => {
  const f = await published("audit-export-authority");
  const restricted = await bind(f.store, "public-reader", ["public"], []);
  for (const store of [
    restricted,
    new Store(f.store.root, "unbound", f.store.ledgerRoot),
  ]) {
    const maintenance = new Maintenance(store);
    await assert.rejects(() => maintenance.exportBundle(), {
      code: "SCOPE_DENIED",
    });
    await assert.rejects(() => maintenance.exportFormats(), {
      code: "SCOPE_DENIED",
    });
    await assert.rejects(
      () => maintenance.wikiEdit({ id: "knowledge:handling", revision: 1 }),
      { code: "SCOPE_DENIED" },
    );
  }
  const owner = await bind(
    f.store,
    "owner",
    ["public", "workshop"],
    ["public", "workshop"],
  );
  assert(
    (await new Maintenance(owner).exportBundle()).manifest.record_ids.includes(
      "knowledge:handling",
    ),
  );
});

test("source-restricted callers cannot export a whole corpus", async () => {
  const f = await published("audit-export-sources");
  const config = await f.store.config();
  config.default_scope.source_refs = [{ id: "source:handbook", revision: 1 }];
  await atomic(f.store.p("corpus.json"), json(config));
  await assert.rejects(() => new Maintenance(f.store).exportBundle(), {
    code: "SCOPE_DENIED",
  });
});

test("a partial purge cannot resume after its executor loses write permission", async () => {
  const f = await published("audit-purge-resume-authority");
  let fail = true;
  const life = new Lifecycle(f.store, {
    graph: async () => {
      if (fail) throw Error("Simulated stopped projection");
      return {
        graph: { query: async () => ({}) },
        db: { close: async () => {} },
      };
    },
    indexName: async () => "audit-purge-resume-authority",
  } as any);
  const plan = await life.plan(
    "purge",
    [{ id: "source:handbook", revision: 1 }],
    "Delete fixture",
  );
  const authorization = {
    action: "purge",
    targets: plan.targets,
    user_instruction: "Delete this exact isolated fixture",
  };
  assert.equal(
    (await life.execute(plan.plan_id, authorization)).plan.state,
    "incomplete",
  );
  await bind(f.store, f.store.project, ["workshop"], []);
  fail = false;
  await assert.rejects(() => life.execute(plan.plan_id, authorization), {
    code: "SCOPE_DENIED",
  });
  assert.equal((await f.store.ledger()).generation, 1);
  await bind(f.store, f.store.project, ["workshop"], ["workshop"]);
  assert.equal(
    (await life.execute(plan.plan_id, authorization)).plan.state,
    "complete",
  );
});

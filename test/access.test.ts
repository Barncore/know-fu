import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import { published } from "./helpers.js";
import { Store } from "../src/store.js";
import { KnowledgeSystem, idleReleaseMs } from "../src/api.js";
import { Filing } from "../src/filing.js";
import { Jobs } from "../src/jobs.js";
import { Lifecycle } from "../src/lifecycle.js";
import { Maintenance } from "../src/maintenance.js";
import { Governance } from "../src/governance.js";
import { LibraryIndex } from "../src/library-index.js";
import { resolveAccess } from "../src/access.js";
import {
  atomic,
  json,
  projectContains,
  readJson,
  sameProject,
} from "../src/core.js";
import type { CorpusData } from "../src/core.js";

const HOME = "C:/Library/Home";
const CLIENT = "C:/Clients/Acme";
const ELSEWHERE = "D:/Code/app";
const answer =
  "Move the lantern only when the badge is amber and the valve is closed; READY never permits opening the valve, and the alternative handbook disagrees about an open valve.";
const cites = ["knowledge:handling@1", "knowledge:alternative@1"];
const idea = {
  action: "propose",
  statement:
    "Gate lantern moves on a second, independent valve sensor instead of the badge colour alone.",
  kill_test:
    "Moves gated by two sensors fail as often as moves gated by the badge alone.",
  premises: ["knowledge:handling@1"],
  authorization: "Save the idea we just worked out",
};
const denied = (pattern?: RegExp) => (e: any) =>
  e.code === "SCOPE_DENIED" && (!pattern || pattern.test(e.message));

type Policy = NonNullable<CorpusData["access"]>;
const personal: Policy["any_project"] = {
  read_modules: ["workshop"],
  save_modules: ["workshop"],
  author_modules: [],
};

/**
 * A library with the owner's decided defaults: a home folder that does everything, a client
 * folder fenced to its own module, and any other folder reading and saving the personal
 * module ("workshop") but never ingesting.
 */
async function library(
  label: string,
  any: Policy["any_project"] | null = personal,
  client = true,
) {
  const f = await published(label);
  const config = await f.store.config();
  if (client) {
    config.modules.push({
      module_id: "client",
      title: "Client",
      description: "Fenced client work",
    });
    config.project_bindings.push({
      project_id: CLIENT,
      read_modules: ["client"],
      write_modules: ["client"],
    });
  }
  const modules = config.modules.map((m) => m.module_id);
  config.project_bindings.push({
    project_id: HOME,
    read_modules: modules,
    write_modules: modules,
  });
  config.access = {
    home_project: HOME,
    ...(any ? { any_project: any } : {}),
  };
  await atomic(f.store.p("corpus.json"), json(config));
  const as = (project: string) =>
    new Store(f.store.root, project, f.store.ledgerRoot);
  return {
    ...f,
    as,
    system: (project: string) => new KnowledgeSystem(as(project)),
  };
}

test("project folders contain their subfolders, compared like bindings", () => {
  assert(projectContains("C:/Library/Home", "c:\\library\\home\\notes"));
  assert(projectContains("P:\\", "P:/anything"));
  assert(projectContains("/home/a", "/home/a/b"));
  assert(!projectContains("C:/Library/Home", "C:/Library/Home"));
  assert(!projectContains("C:/Library/Home", "C:/Library/Homework"));
  assert(!projectContains("/home/a", "/home/ab"));
  assert(!projectContains("specification_review", "specification_review/x"));
  assert(!projectContains("C:/Library", "/Library/x"));
});

test("an unbound folder reads under the default, and its receipt names the real folder", async () => {
  const f = await library("access-read");
  const elsewhere = f.system(ELSEWHERE);
  const result: any = await elsewhere.call("kb_recall", {
    query: "may I move the lantern with an amber badge and closed valve",
  });
  assert(
    result.items.some((i: any) => i.record_ref.id === "knowledge:handling"),
  );
  const receipt = await readJson(
    f.store.p(`retrieval-receipts/${result.request_id}.json`),
  );
  assert.equal(receipt.project, ELSEWHERE);
  assert.equal(receipt.access_via, "any_project");
  assert.equal(typeof receipt.agent, "string");
  // KB_PROJECT stays the caller's folder: the engine never borrows the home identity.
  assert.equal(elsewhere.store.project, ELSEWHERE);
  const brief: any = await elsewhere.call("kb_brief", {});
  assert(brief.briefing.length > 0);
  const read: any = await elsewhere.call("kb_read", {
    record_ref: { id: "knowledge:handling", revision: 1 },
  });
  assert.equal(read.record.id, "knowledge:handling");
  // Progressive reading and the packet route write receipts that name the folder too.
  const catalogue: any = await elsewhere.call("kb_read", { kind: "catalogue" });
  const packet: any = await elsewhere.call("kb_retrieve", {
    query: "lantern valve",
  });
  for (const id of [catalogue.request_id, packet.request_id])
    assert.equal(
      (await readJson(f.store.p(`retrieval-receipts/${id}.json`))).project,
      ELSEWHERE,
    );
});

test("an unbound folder saves answers and ideas when the library allows it", async () => {
  const f = await library("access-save");
  const elsewhere = f.system(ELSEWHERE);
  const filed: any = await elsewhere.call("kb_file", {
    title: "When a lantern may move",
    answer_markdown: answer,
    cites,
    authorization: "File this answer",
  });
  assert.equal(filed.status, "published");
  const record = (await f.store.records()).get(filed.record_ref.id)!;
  assert.equal(record.maintenance_module, "workshop");
  const proposed: any = await elsewhere.call("kb_idea", idea);
  assert.equal(proposed.status, "published");
  // The audit trail says which folder filed it.
  const events = (await fs.readFile(f.store.p("audit/events.jsonl"), "utf8"))
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  const publish = events.find(
    (e) =>
      e.operation === "publish" &&
      e.record_refs.some((r: any) => r.id === filed.record_ref.id),
  );
  assert.equal(publish.project, ELSEWHERE);
  assert.equal(typeof publish.agent, "string");
});

test("saving from an unbound folder is refused when the library doesn't allow it, naming the home folder", async () => {
  const f = await library("access-no-save", {
    read_modules: ["workshop"],
    save_modules: [],
    author_modules: [],
  });
  const before = await f.store.current();
  const homeAndRead = new RegExp(
    `can read the library.*Save them from the library's home folder, ${HOME}`,
  );

  await assert.rejects(
    () =>
      f.system(ELSEWHERE).call("kb_file", {
        title: "When a lantern may move",
        answer_markdown: answer,
        cites,
        authorization: "File this answer",
      }),
    (e: any) => denied(homeAndRead)(e) && e.details.needs === "save",
  );
  // The operation refuses on its own too, not only behind the tool gate.
  await assert.rejects(
    () =>
      new Filing(f.as(ELSEWHERE)).file({
        title: "When a lantern may move",
        answer_markdown: answer,
        cites,
        authorization: "File this answer",
      }),
    denied(new RegExp(HOME)),
  );
  await assert.rejects(
    () => f.system(ELSEWHERE).call("kb_idea", idea),
    denied(new RegExp(HOME)),
  );
  // Rebuilding views needs some write access too.
  await assert.rejects(
    () => f.system(ELSEWHERE).call("kb_maintain", { action: "reindex" }),
    denied(/Rebuilding the library's views/),
  );
  assert.equal(await f.store.current(), before);
  // Reading still works.
  const listed: any = await f
    .system(ELSEWHERE)
    .call("kb_idea", { action: "list" });
  assert(listed);
});

test("ingest is refused outside the home folder with a message naming it, and works at home and below it", async () => {
  const f = await library("access-ingest");
  const source = f.store.p("access-source.txt");
  await fs.writeFile(source, "A short source about lantern valves.");
  const request = (key: string) => ({
    paths: [source],
    module: "workshop",
    domains: ["fictional_workshop"],
    idempotency_key: key,
    authorization: "Ingest this source",
  });
  await assert.rejects(
    () => f.system(ELSEWHERE).call("kb_ingest", request("elsewhere")),
    (e: any) =>
      denied(new RegExp(`Ingest from the library's home folder, ${HOME}`))(e) &&
      e.details.home_project === HOME,
  );
  // Behind the tool gate, the job code refuses with the same message.
  await assert.rejects(
    () => new Jobs(f.as(ELSEWHERE)).ingest(request("direct")),
    denied(new RegExp(`home folder, ${HOME}`)),
  );
  await assert.rejects(
    () => f.system(ELSEWHERE).call("kb_write", { job_id: "job-x", notes: [] }),
    denied(new RegExp(HOME)),
  );
  const home: any = await f.system(HOME).call("kb_ingest", request("home"));
  assert.equal(home.job.stage, "convert");
  // A subfolder of the home folder works under the home folder's binding.
  const below: any = await f
    .system(HOME + "/notes")
    .call("kb_ingest", request("below"));
  assert.equal(below.job.stage, "convert");
  // The job can't be continued from another folder either.
  await assert.rejects(
    () =>
      f.system(ELSEWHERE).call("kb_job", {
        job_id: home.job.job_id,
        action: "convert",
      }),
    denied(new RegExp(HOME)),
  );
});

test("a folder's own binding beats the any-folder default: a fenced folder can't read the personal module", async () => {
  const f = await library("access-fence");
  for (const project of [CLIENT, CLIENT + "/frontend"]) {
    const store = f.as(project);
    assert.deepEqual((await store.scope()).read_modules, ["client"]);
    await assert.rejects(
      () => store.read({ id: "knowledge:handling", revision: 1 }),
      { code: "SCOPE_DENIED" },
    );
    await assert.rejects(
      () =>
        f.system(project).call("kb_recall", {
          query: "lantern valve",
          scope: {
            read_modules: ["workshop"],
            write_modules: [],
            source_refs: [],
          },
        }),
      denied(/own binding limits it/),
    );
    const recall: any = await f
      .system(project)
      .call("kb_recall", { query: "may I move the lantern" })
      .catch((e: any) => e);
    assert(
      recall.code === "NO_KNOWLEDGE" ||
        !(recall.items ?? []).some((i: any) =>
          i.record_ref.id.startsWith("knowledge:"),
        ),
      "a fenced folder sees nothing from the personal module",
    );
    await assert.rejects(
      () =>
        f.system(project).call("kb_file", {
          title: "Leak",
          answer_markdown: answer,
          cites,
          authorization: "File this answer",
        }),
      { code: "VALIDATION_FAILED" },
    );
  }
  // Without the fence, the same subfolder would have read it.
  const config = await f.store.config();
  config.project_bindings = config.project_bindings.filter(
    (b) => !sameProject(b.project_id, CLIENT),
  );
  await atomic(f.store.p("corpus.json"), json(config));
  assert.deepEqual((await f.as(CLIENT).scope()).read_modules, ["workshop"]);
});

test("a legacy corpus.json without an access setting behaves exactly as before", async () => {
  const f = await published("access-legacy");
  const config = await f.store.config();
  assert.equal(config.access, undefined);
  config.modules.push({
    module_id: "public",
    title: "Public",
    description: "Second module",
  });
  config.project_bindings.push(
    {
      project_id: "C:/Legacy/Reader",
      read_modules: ["workshop", "public"],
      write_modules: [],
    },
    {
      project_id: "C:/Legacy/Writer",
      read_modules: ["workshop"],
      write_modules: ["workshop"],
    },
  );
  // The fixture's own project stays a full owner of both modules.
  config.project_bindings[0].read_modules.push("public");
  config.project_bindings[0].write_modules.push("public");
  await atomic(f.store.p("corpus.json"), json(config));
  const as = (project: string) =>
    new Store(f.store.root, project, f.store.ledgerRoot);
  // Unbound folders, including subfolders of a bound one, are refused.
  for (const project of ["unbound", "C:/Legacy/Reader/sub", ELSEWHERE])
    await assert.rejects(
      () =>
        new KnowledgeSystem(as(project)).call("kb_recall", { query: "valve" }),
      denied(/Project is not bound to this corpus/),
    );
  // write_modules still means save plus author.
  const writer = as("C:/Legacy/Writer");
  assert.deepEqual(await writer.scope(), {
    read_modules: ["workshop"],
    write_modules: ["workshop"],
    source_refs: [],
  });
  const access = await writer.access();
  assert.deepEqual(
    [access.save, access.author, access.administer],
    [["workshop"], ["workshop"], ["workshop"]],
  );
  const filed: any = await new Filing(writer).file({
    title: "When a lantern may move",
    answer_markdown: answer,
    cites,
    authorization: "File this answer",
  });
  assert.equal(filed.status, "published");
  // Lifecycle on its own module is allowed with write access, as before, though it can't write every module.
  const projections = { indexName: async () => "access-legacy" } as any;
  const plan = await new Lifecycle(writer, projections).plan(
    "archive",
    [filed.record_ref],
    "Archive the filed answer",
  );
  assert.equal(plan.action, "archive");
  // A reader of every module still verifies and exports, as before.
  const reader = as("C:/Legacy/Reader");
  assert.equal((await new Maintenance(reader).verify()).errors.length, 0);
  assert(await new Maintenance(reader).exportBundle());
  await assert.rejects(
    () =>
      new Filing(reader).file({
        title: "Not allowed",
        answer_markdown: answer,
        cites,
        authorization: "File this answer",
      }),
    { code: "SCOPE_DENIED" },
  );
  await assert.rejects(
    () =>
      new Governance(writer).configure({
        authorization: "Add a domain",
        domains: [{ domain_id: "extra", title: "Extra" }],
      }),
    { code: "SCOPE_DENIED" },
  );
  // The full owner still sees the whole configuration.
  const owner: any = await new KnowledgeSystem(f.store).call("kb_status");
  assert.deepEqual(owner.corpus, await f.store.config());
  assert.deepEqual(owner.scope, await f.store.scope());
});

test("kb_status hides other projects' bindings from a folder that doesn't administer the library", async () => {
  const f = await library("access-status");
  const status = async (project: string) =>
    (await f.system(project).call("kb_status")) as any;
  const elsewhere = await status(ELSEWHERE);
  assert.equal(elsewhere.corpus.project_bindings, undefined);
  assert.equal(elsewhere.corpus.default_scope, undefined);
  assert.deepEqual(elsewhere.corpus.access, { home_project: HOME });
  assert.deepEqual(
    elsewhere.corpus.modules.map((m: any) => m.module_id),
    ["workshop"],
  );
  assert.equal(elsewhere.access.via, "any_project");
  assert.deepEqual(elsewhere.access.save, ["workshop"]);
  assert.deepEqual(elsewhere.access.author, []);
  assert.doesNotMatch(JSON.stringify(elsewhere), /Clients|specification/);
  const client = await status(CLIENT);
  assert.equal(client.corpus.project_bindings, undefined);
  assert.deepEqual(
    client.corpus.modules.map((m: any) => m.module_id),
    ["client"],
  );
  assert.doesNotMatch(JSON.stringify(client), /D:\/Code|specification/);
  const home = await status(HOME);
  assert.equal(home.corpus.project_bindings.length, 3);
  assert.deepEqual(home.corpus.access.any_project, personal);
  assert.match(home.access.summary, /administer the library/);
});

test("administering stays with the home folder, even where any folder may read every module", async () => {
  const f = await library("access-administer", personal, false);
  const elsewhere = f.system(ELSEWHERE);
  for (const [tool, input] of [
    ["kb_maintain", { action: "export" }],
    ["kb_maintain", { action: "verify" }],
    ["kb_maintain", { action: "configure", authorization: "x", domains: [] }],
    [
      "kb_lifecycle",
      {
        mode: "plan",
        action: "archive",
        targets: [{ id: "knowledge:handling", revision: 1 }],
        reason: "x",
      },
    ],
    ["kb_evaluate", { action: "report", run_id: "eval-x" }],
  ] as const)
    await assert.rejects(
      () => elsewhere.call(tool, input),
      denied(
        new RegExp(`Administer it from the library's home folder, ${HOME}`),
      ),
    );
  // The operations refuse on their own as well.
  await assert.rejects(() => new Maintenance(f.as(ELSEWHERE)).exportBundle(), {
    code: "SCOPE_DENIED",
  });
  await assert.rejects(
    () =>
      new Lifecycle(f.as(ELSEWHERE)).plan(
        "archive",
        [{ id: "knowledge:handling", revision: 1 }],
        "x",
      ),
    { code: "SCOPE_DENIED" },
  );
  assert((await new Maintenance(f.as(HOME)).exportBundle()).manifest);
});

test("binding capability lists split saving, authoring and administering", async () => {
  const f = await library("access-lists", null);
  const config = await f.store.config();
  config.project_bindings.push(
    {
      project_id: "C:/Saver",
      read_modules: ["workshop"],
      write_modules: [],
      save_modules: ["workshop"],
    },
    {
      project_id: "C:/Author",
      read_modules: ["workshop", "client"],
      write_modules: ["workshop", "client"],
      administer_modules: [],
    },
  );
  await atomic(f.store.p("corpus.json"), json(config));
  const saver = f.system("C:/Saver");
  assert.equal(
    (
      (await saver.call("kb_file", {
        title: "When a lantern may move",
        answer_markdown: answer,
        cites,
        authorization: "File this answer",
      })) as any
    ).status,
    "published",
  );
  await assert.rejects(
    () =>
      saver.call("kb_ingest", {
        paths: [f.store.p("missing.txt")],
        module: "workshop",
        domains: ["fictional_workshop"],
        idempotency_key: "saver",
        authorization: "x",
      }),
    denied(new RegExp(HOME)),
  );
  const author = f.system("C:/Author");
  const source = f.store.p("author-source.txt");
  await fs.writeFile(source, "Another short source.");
  const job: any = await author.call("kb_ingest", {
    paths: [source],
    module: "workshop",
    domains: ["fictional_workshop"],
    idempotency_key: "author",
    authorization: "Ingest this",
  });
  assert.equal(job.job.stage, "convert");
  await assert.rejects(
    () =>
      author.call("kb_lifecycle", {
        mode: "plan",
        action: "archive",
        targets: [{ id: "knowledge:handling", revision: 1 }],
        reason: "x",
      }),
    denied(/Administering the library/),
  );
  // Without an any-folder default, a folder with no binding is refused as before.
  await assert.rejects(
    () => f.system(ELSEWHERE).call("kb_status"),
    denied(new RegExp(`Use the library from its home folder, ${HOME}`)),
  );
});

test("kb_maintain configure sets, checks and removes the access policy", async () => {
  const f = await published("access-configure");
  const owner = new Governance(f.store);
  const policy = {
    home_project: HOME,
    any_project: personal,
  };
  await assert.rejects(
    () => owner.configure({ authorization: "Open reads", access: policy }),
    { code: "VALIDATION_FAILED" },
  );
  await assert.rejects(
    () =>
      owner.configure({
        authorization: "Open reads",
        binding: {
          project_id: HOME,
          read_modules: ["workshop"],
          write_modules: ["workshop"],
        },
        access: {
          home_project: HOME,
          any_project: {
            read_modules: [],
            save_modules: ["workshop"],
            author_modules: [],
          },
        },
      }),
    { code: "SCOPE_DENIED" },
  );
  const done: any = await owner.configure({
    authorization: "Open reads and saves to every folder",
    binding: {
      project_id: HOME,
      read_modules: ["workshop"],
      write_modules: ["workshop"],
    },
    access: policy,
  });
  assert.deepEqual(done.config.access, policy);
  assert.deepEqual((await f.store.config()).access, policy);
  const elsewhere = new Store(f.store.root, ELSEWHERE, f.store.ledgerRoot);
  assert.deepEqual((await elsewhere.access()).save, ["workshop"]);
  // A new module stays private to its administrator: the any-folder default doesn't gain it.
  await new Governance(
    new Store(f.store.root, HOME, f.store.ledgerRoot),
  ).configure({
    authorization: "Add a client module",
    module: {
      module_id: "client",
      title: "Client",
      description: "Private client work",
    },
  });
  const after = await f.store.config();
  assert.deepEqual(after.access?.any_project?.read_modules, ["workshop"]);
  assert.deepEqual((await elsewhere.access()).read, ["workshop"]);
  // Only an administrator changes it, and the refusal names the home folder.
  await assert.rejects(
    () =>
      new Governance(elsewhere).configure({
        authorization: "x",
        access: null,
      }),
    denied(new RegExp(HOME)),
  );
  await new Governance(
    new Store(f.store.root, HOME, f.store.ledgerRoot),
  ).configure({ authorization: "Close it again", access: null });
  assert.equal((await f.store.config()).access, undefined);
  await assert.rejects(() => elsewhere.access(), denied());
});

test("idle release drops the recall index and file cache, and the next call rebuilds them", async () => {
  assert.equal(idleReleaseMs({}), 600000);
  assert.equal(idleReleaseMs({ KB_IDLE_RELEASE_MINUTES: "2.5" }), 150000);
  assert.equal(idleReleaseMs({ KB_IDLE_RELEASE_MINUTES: "0" }), 0);
  assert.equal(idleReleaseMs({ KB_IDLE_RELEASE_MINUTES: "off" }), 0);
  assert.equal(idleReleaseMs({ KB_IDLE_RELEASE_MINUTES: "soon" }), 600000);
  const f = await published("access-idle");
  const system = new KnowledgeSystem(f.store, { idleReleaseMs: 40 });
  const query = { query: "may I move the lantern with an amber badge" };
  const first: any = await system.call("kb_recall", query);
  assert.equal(LibraryIndex.cached(f.store), 1);
  assert(f.store.cacheStats().entries > 0);
  // Never while a call is running.
  const running = system.call("kb_recall", query);
  assert.equal(system.releaseMemory(), false);
  await running;
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.equal(system.releases, 1);
  assert.equal(LibraryIndex.cached(f.store), 0);
  assert.equal(f.store.cacheStats().entries, 0);
  const again: any = await system.call("kb_recall", query);
  assert.equal(LibraryIndex.cached(f.store), 1);
  assert.deepEqual(
    again.items.map((i: any) => i.record_ref),
    first.items.map((i: any) => i.record_ref),
  );
  // Without a release period, nothing is scheduled.
  const store = new Store(f.store.root, f.store.project, f.store.ledgerRoot);
  const quiet = new KnowledgeSystem(store);
  await quiet.call("kb_recall", query);
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(quiet.releases, 0);
  assert.equal(LibraryIndex.cached(store), 1);
});

test("access resolution picks the folder's own binding, then the closest containing one, then the default", () => {
  const config = {
    modules: [{ module_id: "a" }, { module_id: "b" }],
    project_bindings: [
      { project_id: "C:/Work", read_modules: ["a"], write_modules: ["a"] },
      { project_id: "C:/Work/Client", read_modules: ["b"], write_modules: [] },
    ],
    access: {
      home_project: "C:/Work",
      any_project: {
        read_modules: ["a"],
        save_modules: ["a", "b"],
        author_modules: [],
      },
    },
  } as unknown as CorpusData;
  assert.equal(resolveAccess(config, "c:\\work")!.via, "binding");
  const deep = resolveAccess(
    config,
    "C:/Work/Client/repo/.claude/worktrees/x",
  )!;
  assert.equal(deep.via, "inherited_binding");
  assert.equal(deep.binding, "C:/Work/Client");
  assert.deepEqual(deep.read, ["b"]);
  const other = resolveAccess(config, "E:/Elsewhere")!;
  assert.equal(other.via, "any_project");
  // Saving needs reading: a hand-edited default can't save where it can't read.
  assert.deepEqual(other.save, ["a"]);
  assert.deepEqual(other.administer, []);
  delete (config as any).access;
  assert.equal(resolveAccess(config, "C:/Work/Client/repo"), null);
});

test("create-library takes the access choices as flags, defaulting to the decided defaults", async () => {
  // @ts-ignore The script is plain JavaScript run by node.
  const { libraryConfig } = await import("../scripts/create-library.mjs");
  const base = { home: "C:/Library/Home", id: "lib-test", agent: "claude" };
  const decided = libraryConfig(base);
  assert.deepEqual(decided.access, {
    home_project: "C:/Library/Home",
    any_project: {
      read_modules: ["research"],
      save_modules: ["research"],
      author_modules: [],
    },
  });
  assert.deepEqual(decided.project_bindings, [
    {
      project_id: "C:/Library/Home",
      read_modules: ["research"],
      write_modules: ["research"],
    },
  ]);
  assert.deepEqual(
    libraryConfig({ ...base, "save-from-any-folder": false }).access
      .any_project,
    { read_modules: ["research"], save_modules: [], author_modules: [] },
  );
  assert.deepEqual(
    libraryConfig({ ...base, "ingest-from-any-folder": true }).access
      .any_project.author_modules,
    ["research"],
  );
  assert.deepEqual(
    libraryConfig({
      ...base,
      "read-from-any-folder": false,
      "save-from-any-folder": false,
    }).access,
    { home_project: "C:/Library/Home" },
  );
  assert.throws(
    () => libraryConfig({ ...base, "read-from-any-folder": false }),
    /needs reading from any folder/,
  );
  assert.throws(
    () => libraryConfig({ id: "lib-test", agent: "claude" }),
    /--home needs an absolute path/,
  );
  // --project still works as the older spelling.
  assert.equal(
    libraryConfig({ project: "C:/Library/Home", id: "lib-test", agent: "mcp" })
      .access.home_project,
    "C:/Library/Home",
  );
});

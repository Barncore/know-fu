import * as fs from "node:fs/promises";
import path from "node:path";
import { FalkorDB } from "falkordb";
import {
  APP,
  VERSION,
  ensure,
  readJson,
  atomic,
  hash,
  json,
  now,
  ref,
  key,
  recordRefs,
  withLock,
  exists,
  STATE,
} from "./core.js";
import type { RecordData } from "./core.js";
import { Store } from "./store.js";
import { run } from "./process.js";
import { writeGraph } from "./graph-projection.js";
import { QmdSearch } from "./qmd-search.js";
import {
  isAccount,
  navigationEntry,
  summary as authoredSummary,
} from "./navigation.js";

export async function runtime() {
  return readJson(path.join(STATE, "config.json"));
}
export class Projections {
  private searchWorker = new QmdSearch();
  closeSearch() {
    this.searchWorker.close();
  }
  constructor(public store: Store) {}
  async indexName() {
    return "kb_" + hash((await this.store.config()).corpus_id).slice(0, 24);
  }
  async graph() {
    const c = await runtime();
    ensure(
      ["ubuntu-wsl2-direct", "falkordb-external"].includes(c.deployment) &&
        c.graph,
      "GRAPH_UNAVAILABLE",
      "Configure the regular FalkorDB server deployment",
    );
    ensure(
      c.deployment !== "falkordb-external" || c.graph.auto_start !== true,
      "GRAPH_UNAVAILABLE",
      "External FalkorDB is managed by its chosen service, not the WSL helper",
    );
    const password = (await fs.readFile(c.graph.password_file, "utf8")).trim();
    const connect = () =>
      FalkorDB.connect({
        socket: {
          host: c.graph.host,
          port: c.graph.port,
          connectTimeout: 5000,
          reconnectStrategy: false,
          ...(c.graph.tls ? { tls: true } : {}),
        } as any,
        password,
      });
    let db;
    try {
      db = await connect();
    } catch (e) {
      if (c.graph.auto_start !== true) throw e;
      await run(
        "powershell.exe",
        [
          "-NoProfile",
          "-File",
          path.join(APP, "scripts/graph-service.ps1"),
          "-Action",
          "start",
        ],
        { timeout: 30000 },
      );
      db = await connect();
    }
    return { db, graph: db.selectGraph(await this.indexName()) };
  }
  async qmd(args: string[], timeout = 120000) {
    return run(
      process.execPath,
      [
        path.join(APP, "node_modules/@tobilu/qmd/dist/cli/qmd.js"),
        "--index",
        await this.indexName(),
        ...args,
      ],
      {
        cwd: APP,
        timeout,
        env: {
          XDG_CACHE_HOME: path.join(STATE, "cache"),
          XDG_CONFIG_HOME: path.join(STATE, "qmd-config"),
          QMD_FORCE_CPU: "1",
          QMD_EMBED_PARALLELISM: "1",
        },
      },
    );
  }
  async receipt() {
    return readJson(this.store.p("views/receipt.json")).catch(() => null);
  }
  async fresh(release: string, kind: "graph" | "search" | "wiki") {
    const r = await this.receipt();
    if (!(
      r &&
      r.release_id === release &&
      r[kind]?.state === "ready" &&
      !(await exists(this.store.p(".projection.lock")))
    ))
      return false;
    if (kind === "graph") {
      let c;
      try {
        c = await this.graph();
        const q = await c.graph.query(
          "MATCH (n:Projection) RETURN n.release AS release",
        );
        return (q.data?.[0] as any)?.release === release;
      } catch {
        return false;
      } finally {
        await c?.db.close();
      }
    }
    return true;
  }
  async build(options: { semantic?: boolean } = {}) {
    return withLock(this.store.root, "projection", async () => {
      this.closeSearch();
      const release = await this.store.release();
      ensure(release, "VALIDATION_FAILED", "Nothing has been published");
      const previous = await this.receipt();
      if (previous?.release_id === release.release_id) {
        const files = await readJson<Record<string, string>>(
          this.store.p(`views/${release.release_id}/file-hashes.json`),
        ).catch(() => ({}));
        const changed = [];
        for (const [p, digest] of Object.entries(files))
          if (
            p.includes("/wiki/") &&
            !p.endsWith("/_index.md") &&
            !p.includes("/wiki/_topics/") &&
            !p.endsWith("/_records.md") &&
            (await exists(this.store.p(p))) &&
            hash(await fs.readFile(this.store.p(p))) !== digest
          )
            changed.push(p);
        ensure(
          !changed.length,
          "WIKI_EDIT_PENDING",
          "Generated prose was edited. Import it with wiki_edit and publish a reviewed revision before rebuilding.",
          { changed },
        );
      }
      const records = await this.store.records(release.release_id);
      const receipt: any = {
        schema_version: 1,
        release_id: release.release_id,
        started_at: now(),
        manifest_sha256: hash(json(release)),
        graph: { state: "pending" },
        wiki: { state: "pending" },
        search: { state: "pending" },
        semantic_requested: options.semantic !== false,
      };
      await atomic(this.store.p("views/receipt.json"), json(receipt));
      const fileHashes: Record<string, string> = {},
        searchMap: Record<string, any> = {},
        pages: string[] = [];
      for (const r of records.values()) {
        const body = await this.store.body(r),
          p = r.payload as any;
        const summary =
          authoredSummary(r) ?? "Navigation summary not authored.";
        const content = `---\nid: ${JSON.stringify(r.id)}\nrevision: ${r.revision}\ntitle: ${JSON.stringify(r.title)}\nsummary: ${JSON.stringify(summary)}\ndomains: ${JSON.stringify(r.scope.domains)}\ncreated_at: ${r.created_at}\nepistemic: ${r.epistemic}\nlifecycle: ${r.lifecycle}\narchived: ${r.archived}\n---\n\n# ${r.title}\n\n${body || p.text || p.definition || p.rationale || p.unknown || summary}\n\n## Provenance\n\n${r.provenance.source_refs.map((x) => `- ${key(x)}`).join("\n") || "Source registration / no independent source supplied."}\n\n## Qualification\n\n${[...r.scope.conditions, ...r.scope.exclusions].join("\n") || "Applicability has not been formalized."}\n\nAssessment: ${JSON.stringify(r.assessments)}\n`;
        const name = hash(r.id).slice(0, 24) + ".md",
          wiki = `views/${release.release_id}/wiki/${name}`;
        await atomic(this.store.p(wiki), content);
        fileHashes[wiki] = hash(content);
        if (!r.archived && r.lifecycle === "active") {
          pages.push(
            `- [${r.title}](${name}) — ${r.record_type} (${r.epistemic})`,
          );
          const module = "m" + hash(r.maintenance_module).slice(0, 16);
          const searchPath = `views/${release.release_id}/search/${module}/${name}`;
          await atomic(this.store.p(searchPath), content);
          fileHashes[searchPath] = hash(content);
          searchMap[`${module}/${name}`] = {
            record_ref: ref(r),
            level: "account",
            source_refs: r.provenance.source_refs,
            generated:
              r.record_type !== "source" && r.record_type !== "passage",
            locator: p.locator ?? null,
          };
          if (authoredSummary(r)) {
            const summaryName = name.replace(".md", "-summary.md");
            const summaryPath = `views/${release.release_id}/search/${module}/${summaryName}`;
            const summaryContent = `# ${r.title}\n\n${authoredSummary(r)}\n\nExact account: ${key(r)}\nDomains: ${r.scope.domains.join(", ")}\n`;
            await atomic(this.store.p(summaryPath), summaryContent);
            fileHashes[summaryPath] = hash(summaryContent);
            searchMap[`${module}/${summaryName}`] = {
              ...searchMap[`${module}/${name}`],
              level: "summary",
            };
          }
        }
      }
      const config = await this.store.config();
      const impacts = await readJson<any[]>(
        this.store.p(`releases/${release.release_id}.impacts.json`),
      ).catch(() => []);
      const pending = new Set(
        impacts
          .filter((x) => x.status === "pending_reassessment")
          .map((x) => x.record_ref.id),
      );
      const active = [...records.values()].filter(
        (r) => !r.archived && r.lifecycle === "active",
      );
      const accounts = active.filter(isAccount);
      const catalogue = accounts.map((r) => ({
        ...navigationEntry(r),
        freshness: pending.has(r.id) ? "pending_reassessment" : "current",
      }));
      const cataloguePath = `views/${release.release_id}/catalogue.json`;
      const catalogueText = json({
        interface_version: "1.0.0",
        release_id: release.release_id,
        manifest_sha256: receipt.manifest_sha256,
        entries: catalogue,
      });
      await atomic(this.store.p(cataloguePath), catalogueText);
      fileHashes[cataloguePath] = hash(catalogueText);
      const topics: string[] = [];
      const link = (r: RecordData, prefix = "../") =>
        `[${r.title}](${prefix}${hash(r.id).slice(0, 24)}.md)`;
      for (const domain of [
        ...new Set(accounts.flatMap((r) => r.scope.domains)),
      ].sort()) {
        const members = accounts.filter((r) =>
          r.scope.domains.includes(domain),
        );
        const title =
          config.domains.find((d) => d.domain_id === domain)?.title ?? domain;
        const topicName = hash(domain).slice(0, 24) + ".md";
        const primers = members.filter(
          (r) => (r.payload as any).form === "primer",
        );
        const describe = (r: RecordData) =>
          `- ${link(r)} — ${(r.payload as any).form ?? r.record_type}. ${authoredSummary(r) ?? "Summary not authored; open the account."}${pending.has(r.id) ? " **Pending reassessment.**" : ""}`;
        const memberIds = new Set(members.map((r) => r.id));
        const connections = active
          .filter(
            (r) =>
              r.record_type === "relationship" &&
              (memberIds.has((r.payload as any).subject.id) ||
                memberIds.has((r.payload as any).object.id)),
          )
          .map((r) => {
            const p = r.payload as any;
            const subject = records.get(p.subject.id),
              object = records.get(p.object.id);
            return `- ${subject ? link(subject) : key(p.subject)} (${key(p.subject)}) **${p.predicate}** ${object ? link(object) : key(p.object)} (${key(p.object)}): ${p.rationale} ([relationship](../${hash(r.id).slice(0, 24)}.md)). Conditions: ${r.scope.conditions.join("; ") || "inspect the account"}.`;
          });
        const topicText = `# ${title}\n\nRelease: ${release.release_id}\n\n## Primers\n\n${primers.map(describe).join("\n") || "No authored primer yet."}\n\n## Accounts and questions\n\n${members
          .filter((r) => !primers.includes(r))
          .map(describe)
          .join(
            "\n",
          )}\n\n## Connections and disagreements\n\n${connections.join("\n") || "No explicit relationships yet."}\n`;
        const topicPath = `views/${release.release_id}/wiki/_topics/${topicName}`;
        await atomic(this.store.p(topicPath), topicText);
        fileHashes[topicPath] = hash(topicText);
        topics.push(
          `- [${title}](_topics/${topicName}) — ${members.length} accounts${primers.length ? "; " + primers.map((r) => `${link(r, "")}: ${authoredSummary(r) ?? "summary missing"}${pending.has(r.id) ? " (pending reassessment)" : ""}`).join("; ") : "; no authored primer yet"}`,
        );
      }
      const recordsPath = `views/${release.release_id}/wiki/_records.md`;
      const recordsText = `# All records\n\nSources, evidence, relationships and authored accounts for release ${release.release_id}.\n\n${pages.join("\n")}\n`;
      await atomic(this.store.p(recordsPath), recordsText);
      fileHashes[recordsPath] = hash(recordsText);
      const index = `# ${config.title}\n\nRelease: ${release.release_id}\n\nChoose a topic, or search directly for a precise question. Summaries guide reading; complete accounts and their material context establish the reasoning.\n\n${topics.join("\n")}\n\n[All records and supporting evidence](_records.md)\n\nThis owner-level projection contains the library's records. Scoped tool access filters metadata before exposure; do not serve these raw files as a scoped catalogue.\n`;
      const indexPath = `views/${release.release_id}/wiki/_index.md`;
      await atomic(this.store.p(indexPath), index);
      fileHashes[indexPath] = hash(index);
      await atomic(
        this.store.p(`views/${release.release_id}/search-map.json`),
        json(searchMap),
      );
      await atomic(
        this.store.p(`views/${release.release_id}/file-hashes.json`),
        json(fileHashes),
      );
      receipt.wiki = { state: "ready", pages: pages.length };
      await atomic(this.store.p("views/receipt.json"), json(receipt));
      let connection: Awaited<ReturnType<Projections["graph"]>> | null = null;
      try {
        connection = await this.graph();
        const metrics = await writeGraph(
          connection.graph,
          records,
          release.release_id,
        );
        receipt.graph = {
          state: "ready",
          ...metrics,
          client: (
            await readJson(path.join(APP, "node_modules/falkordb/package.json"))
          ).version,
        };
      } catch (e: any) {
        receipt.graph = { state: "failed", error: e.message };
      } finally {
        await connection?.db.close();
      }
      await atomic(this.store.p("views/receipt.json"), json(receipt));
      try {
        for (const m of (await this.store.config()).modules) {
          const name = "m" + hash(m.module_id).slice(0, 16),
            folder = this.store.p(`views/${release.release_id}/search/${name}`);
          await fs.mkdir(folder, { recursive: true });
          await this.qmd(["collection", "remove", name]).catch(() => {});
          await this.qmd([
            "collection",
            "add",
            folder,
            "--name",
            name,
            "--mask",
            "**/*.md",
          ]);
        }
        await this.qmd(["update"]);
        if (options.semantic !== false)
          await this.qmd(
            ["embed", "--max-docs-per-batch", "8", "--max-batch-mb", "8"],
            1800000,
          );
        receipt.search = {
          state: "ready",
          semantic: options.semantic !== false,
          version: (
            await readJson(
              path.join(APP, "node_modules/@tobilu/qmd/package.json"),
            )
          ).version,
          status: (await this.qmd(["status"])).stdout,
        };
      } catch (e: any) {
        receipt.search = {
          state: "failed",
          error: e.message,
          details: e.details,
        };
      }
      receipt.completed_at = now();
      await atomic(this.store.p("views/receipt.json"), json(receipt));
      await this.store.audit(
        "reindex",
        "Rebuilt canonical knowledge views",
        [],
        release.release_id,
        receipt.graph.state === "ready" && receipt.search.state === "ready"
          ? "completed"
          : "incomplete",
      );
      return receipt;
    });
  }
  async search(
    query: string,
    modules: string[],
    semantic: boolean,
    limit: number,
    rerank = false,
  ) {
    return this.searchWorker.search({
      index: await this.indexName(),
      query,
      collections: modules.map((module) => "m" + hash(module).slice(0, 16)),
      semantic,
      limit,
      rerank,
    });
  }
  async adjacent(ids: string[], modules: string[], limit: number) {
    const { db, graph } = await this.graph();
    try {
      const result = await graph.query(
        "MATCH (s:Record)-[:SUBJECT_OF]->(a:Record)-[:OBJECT]->(o:Record) WHERE (s.id IN $ids OR o.id IN $ids) AND a.module IN $modules AND s.module IN $modules AND o.module IN $modules RETURN a.id AS id LIMIT $limit",
        { params: { ids, modules, limit } },
      );
      return (result.data ?? []).map((r: any) => r.id as string);
    } finally {
      await db.close();
    }
  }
  async verifyViews() {
    const release = await this.store.release();
    ensure(release, "VALIDATION_FAILED", "No release");
    const files = await readJson<Record<string, string>>(
      this.store.p(`views/${release.release_id}/file-hashes.json`),
    );
    const changed = [];
    for (const [p, digest] of Object.entries(files))
      if (
        !(await exists(this.store.p(p))) ||
        hash(await fs.readFile(this.store.p(p))) !== digest
      )
        changed.push(p);
    return {
      release_id: release.release_id,
      changed,
      valid: changed.length === 0,
    };
  }
}

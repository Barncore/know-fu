import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
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
import { QmdSearch } from "./qmd-search.js";
import {
  VectorStore,
  embedTexts,
  embedderConfig,
  embedderLabel,
  similarity,
  type EmbedderConfig,
} from "./embedder.js";
import {
  isAccount,
  navigationEntry,
  summary as authoredSummary,
} from "./navigation.js";

/**
 * QMD contexts to embed with in parallel on this machine. One context already uses most
 * cores; on a 16-core machine four were 18% faster and eight were slower (20 October 2026).
 */
function localParallelism() {
  const set = Number(process.env.KB_EMBED_PARALLELISM);
  if (Number.isInteger(set) && set >= 1) return String(Math.min(set, 8));
  // A "16 GB" machine reports a little under 16 GiB.
  return os.cpus().length >= 8 && os.totalmem() >= 15 * 1024 ** 3 ? "4" : "1";
}

/** The text an API embedder sees for a search document: what a reader would search for. */
function embeddingText(r: RecordData, body: string) {
  const p = r.payload as any;
  return [
    r.title,
    authoredSummary(r) ?? "",
    body || p.text || p.definition || p.rationale || p.unknown || "",
    [...r.scope.conditions, ...r.scope.exclusions].join("\n"),
  ]
    .filter((part) => part && part.trim())
    .join("\n\n");
}

export class Projections {
  private searchWorker = new QmdSearch();
  private vectorStore?: VectorStore;
  /** The background embedding this engine is running, if any. */
  private embedding?: Promise<void>;
  /** Stops this engine's running embedding at once. */
  private stopEmbeddingNow?: () => void;
  closeSearch() {
    this.searchWorker.close();
    this.vectorStore?.forget();
  }
  constructor(
    public store: Store,
    private options: {
      /** Run semantic embedding after reindex returns (MCP), or wait for it (CLI, tests). */
      background?: boolean;
      /** Tests: an embedder instead of the state folder's setting, and where vectors go. */
      embedder?: EmbedderConfig;
      vectorRoot?: string;
    } = {},
  ) {}
  private embedderConfig() {
    return this.options.embedder
      ? Promise.resolve(this.options.embedder)
      : embedderConfig();
  }
  /** Waits for a background embedding started by this engine, if one is running. */
  async settled() {
    await this.embedding;
  }
  async indexName() {
    return "kb_" + hash((await this.store.config()).corpus_id).slice(0, 24);
  }
  async qmd(args: string[], timeout = 120000, signal?: AbortSignal) {
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
          QMD_EMBED_PARALLELISM: localParallelism(),
        },
        signal,
      },
    );
  }
  /** Writes the views receipt whole, taking turns with embedding progress updates. */
  private writeReceipt(receipt: unknown) {
    return withLock(this.store.root, "receipt", () =>
      atomic(this.store.p("views/receipt.json"), json(receipt)),
    );
  }
  async receipt() {
    const receipt = await readJson(this.store.p("views/receipt.json")).catch(
      () => null,
    );
    // An embedding run whose engine has gone (the chat closed) stopped part-way.
    const semantic = receipt?.semantic;
    if (semantic?.state === "running" && semantic.pid !== process.pid) {
      let alive = true;
      try {
        process.kill(semantic.pid, 0);
      } catch {
        alive = false;
      }
      if (!alive) {
        semantic.state = "interrupted";
        semantic.next =
          'Run kb_maintain {action:"reindex"} again; it resumes where the last run stopped.';
      }
    }
    return receipt;
  }
  async fresh(release: string, kind: "search" | "wiki") {
    const r = await this.receipt();
    return Boolean(
      r &&
      r.release_id === release &&
      r[kind]?.state === "ready" &&
      !(await exists(this.store.p(".projection.lock"))),
    );
  }
  async build(options: { semantic?: boolean; background?: boolean } = {}) {
    // Rebuilding views needs some write access; libraries without an access policy keep their old rule.
    await this.store.requireAccess("write", {
      operation: "kb_maintain reindex",
      policyOnly: true,
    });
    const embedder = await this.embedderConfig();
    const wanted = options.semantic !== false && embedder.provider !== "off";
    const built = await withLock(this.store.root, "projection", async () => {
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
            !p.includes("/wiki/_domains/") &&
            // Views built before 0.3.2 kept domain pages in _topics.
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
        wiki: { state: "pending" },
        search: { state: "pending" },
        semantic_requested: options.semantic !== false,
        semantic: {
          state: wanted ? "pending" : "off",
          embedder: embedderLabel(embedder),
        },
      };
      await this.writeReceipt(receipt);
      const fileHashes: Record<string, string> = {},
        searchMap: Record<string, any> = {},
        pages: string[] = [],
        // Accounts and text passages are what recall can return, so only they get embedded.
        semanticDocs: { file: string; hash: string; text: string }[] = [];
      for (const r of records.values()) {
        const body = await this.store.body(r),
          p = r.payload as any;
        const summary =
          authoredSummary(r) ?? "Navigation summary not authored.";
        const content = `---\nid: ${JSON.stringify(r.id)}\nrevision: ${r.revision}\ntitle: ${JSON.stringify(r.title)}\nsummary: ${JSON.stringify(summary)}\ndomains: ${JSON.stringify(r.scope.domains)}\ncreated_at: ${r.created_at}\nepistemic: ${r.epistemic}\nlifecycle: ${r.lifecycle}\narchived: ${r.archived}\n---\n\n# ${r.title}\n\n${body || p.text || p.definition || p.rationale || p.unknown || p.statement || summary}\n\n## Provenance\n\n${r.provenance.source_refs.map((x) => `- ${key(x)}`).join("\n") || "Source registration / no independent source supplied."}\n\n## Qualification\n\n${[...r.scope.conditions, ...r.scope.exclusions].join("\n") || "Applicability has not been formalized."}\n\nAssessment: ${JSON.stringify(r.assessments)}\n`;
        const name = hash(r.id).slice(0, 24) + ".md",
          wiki = `views/${release.release_id}/wiki/${name}`;
        await atomic(this.store.p(wiki), content);
        fileHashes[wiki] = hash(content);
        if (!r.archived && r.lifecycle === "active") {
          pages.push(
            `- [${r.title}](${name}) — ${r.record_type} (${r.epistemic})`,
          );
          // Ideas get a wiki page but stay out of search, so no search route can serve one as an account.
          if (r.record_type === "idea") continue;
          const main = "m" + hash(r.maintenance_module).slice(0, 16);
          // Relationship, source and figure-locator records stay keyword-searchable for
          // the older routes, in a second collection that is never embedded.
          const embedded =
            isAccount(r) ||
            (r.record_type === "passage" && (p.kind ?? "text") === "text");
          const module = embedded ? main : main + "x";
          const searchPath = `views/${release.release_id}/search/${module}/${name}`;
          await atomic(this.store.p(searchPath), content);
          fileHashes[searchPath] = hash(content);
          if (embedded) {
            const text = embeddingText(r, body);
            semanticDocs.push({
              file: `${module}/${name}`,
              hash: hash(text),
              text,
            });
          }
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
            const summaryPath = `views/${release.release_id}/search/${main}x/${summaryName}`;
            const summaryContent = `# ${r.title}\n\n${authoredSummary(r)}\n\nExact account: ${key(r)}\nDomains: ${r.scope.domains.join(", ")}\n`;
            await atomic(this.store.p(summaryPath), summaryContent);
            fileHashes[summaryPath] = hash(summaryContent);
            searchMap[`${main}x/${summaryName}`] = {
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
      const domainLines: string[] = [];
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
        const pageName = hash(domain).slice(0, 24) + ".md";
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
        const pageText = `# ${title}\n\nRelease: ${release.release_id}\n\n## Primers\n\n${primers.map(describe).join("\n") || "No authored primer yet."}\n\n## Accounts and questions\n\n${members
          .filter((r) => !primers.includes(r))
          .map(describe)
          .join(
            "\n",
          )}\n\n## Connections and disagreements\n\n${connections.join("\n") || "No explicit relationships yet."}\n`;
        const pagePath = `views/${release.release_id}/wiki/_domains/${pageName}`;
        await atomic(this.store.p(pagePath), pageText);
        fileHashes[pagePath] = hash(pageText);
        domainLines.push(
          `- [${title}](_domains/${pageName}) — ${members.length} accounts${primers.length ? "; " + primers.map((r) => `${link(r, "")}: ${authoredSummary(r) ?? "summary missing"}${pending.has(r.id) ? " (pending reassessment)" : ""}`).join("; ") : "; no authored primer yet"}`,
        );
      }
      const recordsPath = `views/${release.release_id}/wiki/_records.md`;
      const recordsText = `# All records\n\nSources, evidence, relationships and authored accounts for release ${release.release_id}.\n\n${pages.join("\n")}\n`;
      await atomic(this.store.p(recordsPath), recordsText);
      fileHashes[recordsPath] = hash(recordsText);
      const index = `# ${config.title}\n\nRelease: ${release.release_id}\n\nChoose a domain, or search directly for a precise question. Summaries guide reading; complete accounts and their material context establish the reasoning.\n\n${domainLines.join("\n")}\n\n[All records and supporting evidence](_records.md)\n\nThis owner-level projection contains the library's records. Scoped tool access filters metadata before exposure; do not serve these raw files as a scoped catalogue.\n`;
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
      await this.writeReceipt(receipt);
      const collections: string[] = [];
      try {
        for (const m of (await this.store.config()).modules) {
          const main = "m" + hash(m.module_id).slice(0, 16);
          for (const name of [main, main + "x"]) {
            const folder = this.store.p(
              `views/${release.release_id}/search/${name}`,
            );
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
          collections.push(main);
        }
        // Keyword search is ready in seconds; embedding comes after, on its own lock.
        await this.qmd(["update"]);
        receipt.search = {
          state: "ready",
          semantic: false,
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
        if (wanted) receipt.semantic.state = "failed";
      }
      // Embedding reads its documents from here, so a later run can resume the same set.
      await atomic(
        this.store.p(`views/${release.release_id}/semantic-map.json`),
        json(Object.fromEntries(semanticDocs.map((d) => [d.file, d.hash]))),
      );
      receipt.completed_at = now();
      receipt.collected_views = await this.collectOldViews(release.release_id);
      await this.writeReceipt(receipt);
      await this.store.audit(
        "reindex",
        "Rebuilt canonical knowledge views",
        [],
        release.release_id,
        receipt.search.state === "ready" ? "completed" : "incomplete",
      );
      return {
        receipt,
        release_id: release.release_id as string,
        semanticDocs,
        collections,
      };
    });
    if (!wanted || built.receipt.search.state !== "ready") return built.receipt;
    const previous = this.embedding ?? Promise.resolve();
    const embedding = previous.then(() =>
      this.embed(
        built.release_id,
        built.semanticDocs,
        built.collections,
        embedder,
      ),
    );
    if (options.background ?? this.options.background) {
      // The call returns now; kb_status shows progress, and recall uses keywords meanwhile.
      this.embedding = embedding
        .catch(() => {})
        .finally(() => {
          if (this.embedding === tracked) this.embedding = undefined;
        });
      const tracked = this.embedding;
      return this.receipt();
    }
    await embedding;
    return this.receipt();
  }

  /**
   * Embeds the release's accounts and text passages, recording progress in the views
   * receipt. Stored vectors are kept, so an interrupted run resumes where it stopped, and
   * a newer reindex makes an older run stop at its next step.
   */
  private async embed(
    releaseId: string,
    docs: { file: string; hash: string; text: string }[],
    collections: string[],
    embedder: EmbedderConfig,
  ) {
    const receiptPath = this.store.p("views/receipt.json");
    const abort = new AbortController();
    this.stopEmbeddingNow = () => abort.abort();
    // False when a newer reindex took over or a purge stopped this run.
    const update = (patch: Record<string, unknown>) =>
      withLock(this.store.root, "receipt", async () => {
        const r = await readJson(receiptPath).catch(() => null);
        if (!r || r.release_id !== releaseId || r.semantic?.state === "stopped")
          return false;
        r.semantic = { ...r.semantic, ...patch, updated_at: now() };
        if (patch.state === "ready") r.search = { ...r.search, semantic: true };
        await atomic(receiptPath, json(r));
        return true;
      });
    const current = async () => {
      const r = await readJson(receiptPath).catch(() => null);
      return (
        !abort.signal.aborted &&
        r?.release_id === releaseId &&
        r.semantic?.state === "running" &&
        r.semantic.pid === process.pid
      );
    };
    try {
      // A run for an older release stops at its next step once this one has started, so
      // waiting for its lock (at most one five-minute QMD slice) beats failing.
      await withLock(
        this.store.root,
        "semantic",
        async () => {
          if (
            !(await update({
              state: "running",
              pid: process.pid,
              started_at: now(),
              documents: docs.length,
              embedded: 0,
              error: null,
              next: null,
            }))
          )
            return;
          if (embedder.provider === "api") {
            const store = await this.vectors(embedder);
            const have = await store.load();
            const todo = [
              ...new Map(
                docs.filter((d) => !have.has(d.hash)).map((d) => [d.hash, d]),
              ).values(),
            ];
            let done = docs.length - todo.length;
            await update({ embedded: done });
            for (let i = 0; i < todo.length; i += embedder.batch_size) {
              const slice = todo.slice(i, i + embedder.batch_size);
              const vectors = await embedTexts(
                embedder,
                slice.map((d) => d.text),
              );
              // Checked before writing, so a purge that ran meanwhile isn't undone.
              if (!(await current())) return;
              await store.add(
                slice.map((d, j) => ({ hash: d.hash, vector: vectors[j] })),
              );
              done += slice.length;
              if (!(await update({ embedded: Math.min(done, docs.length) })))
                return;
            }
            await update({ state: "ready", completed_at: now() });
            return;
          }
          // QMD embeds in five-minute slices, so progress shows between them and no
          // single call runs into a time limit.
          let embedded = 0;
          for (const collection of collections)
            for (let slice = 0; slice < 500; slice++) {
              if (!(await current())) return;
              const out = (
                await this.qmd(
                  [
                    "embed",
                    "-c",
                    collection,
                    "--timeout",
                    "5",
                    "--max-docs-per-batch",
                    "8",
                    "--max-batch-mb",
                    "8",
                  ],
                  8 * 60 * 1000,
                  abort.signal,
                )
              ).stdout.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "");
              if (
                /All content hashes already have embeddings|No non-empty documents/.test(
                  out,
                )
              )
                break;
              ensure(
                !/Another embed process is already running/.test(out),
                "BUSY",
                "Another QMD embedding holds this index; try again when it finishes",
              );
              embedded += Number(
                /from\s+(\d[\d,]*)\s+documents/
                  .exec(out)?.[1]
                  ?.replace(/,/g, "") ?? 0,
              );
              if (
                !(await update({ embedded: Math.min(embedded, docs.length) }))
              )
                return;
            }
          await update({
            state: "ready",
            embedded: docs.length,
            completed_at: now(),
            status: (await this.qmd(["status"])).stdout,
          });
        },
        15 * 60 * 1000,
      );
    } catch (e: any) {
      if (e?.code === "CANCELLED") return;
      await update({
        state: "failed",
        error: e.message,
        next: 'Fix the cause, then run kb_maintain {action:"reindex"} again; finished embeddings are kept.',
      }).catch(() => {});
    } finally {
      this.stopEmbeddingNow = undefined;
    }
  }

  /**
   * Stops any embedding of this library before a purge deletes stored vectors: marks the
   * run stopped (a run in another process sees that at its next step), stops this engine's
   * own run at once, and waits until no run holds the semantic lock.
   */
  async stopEmbedding(reason: string) {
    const receiptPath = this.store.p("views/receipt.json");
    await withLock(this.store.root, "receipt", async () => {
      const r = await readJson(receiptPath).catch(() => null);
      if (r?.semantic && ["running", "pending"].includes(r.semantic.state)) {
        r.semantic = {
          ...r.semantic,
          state: "stopped",
          error: reason,
          next: 'Run kb_maintain {action:"reindex"} to embed again.',
          updated_at: now(),
        };
        await atomic(receiptPath, json(r));
      }
    });
    this.stopEmbeddingNow?.();
    await withLock(this.store.root, "semantic", async () => {}, 10 * 60 * 1000);
  }

  private async vectors(
    embedder: Extract<EmbedderConfig, { provider: "api" }>,
  ) {
    const index = await this.indexName();
    const store = new VectorStore(index, embedder, this.options.vectorRoot);
    if (this.vectorStore?.dir !== store.dir) this.vectorStore = store;
    return this.vectorStore!;
  }
  /**
   * Views are rebuilt in full for each release and only the receipt's release is served.
   * Remove older view folders so a long-lived library does not keep one wiki and one search
   * copy per publication. A folder holding an unimported wiki edit is kept and reported.
   */
  async collectOldViews(keep: string) {
    const removed: string[] = [],
      kept: string[] = [];
    const entries = await fs
      .readdir(this.store.p("views"), { withFileTypes: true })
      .catch(() => []);
    for (const entry of entries) {
      if (
        !entry.isDirectory() ||
        entry.name === keep ||
        !/^release-[a-zA-Z0-9-]+$/.test(entry.name)
      )
        continue;
      const files = await readJson<Record<string, string>>(
        this.store.p(`views/${entry.name}/file-hashes.json`),
      ).catch(() => ({}));
      let edited = false;
      for (const [p, digest] of Object.entries(files))
        if (
          p.includes("/wiki/") &&
          (await exists(this.store.p(p))) &&
          hash(await fs.readFile(this.store.p(p))) !== digest
        ) {
          edited = true;
          break;
        }
      if (edited) {
        kept.push(entry.name);
        continue;
      }
      await fs.rm(this.store.p(`views/${entry.name}`), {
        recursive: true,
        force: true,
      });
      removed.push(entry.name);
    }
    return { removed: removed.length, kept_with_unimported_edits: kept };
  }
  async search(
    query: string,
    modules: string[],
    semantic: boolean,
    limit: number,
    rerank = false,
  ) {
    const main = modules.map((module) => "m" + hash(module).slice(0, 16));
    if (semantic) {
      const embedder = await this.embedderConfig();
      if (embedder.provider === "api")
        return this.vectorSearch(query, main, limit, embedder);
    }
    return this.searchWorker.search({
      index: await this.indexName(),
      query,
      // Semantic search covers what was embedded; keyword search also covers the rest.
      collections: semantic ? main : [...main, ...main.map((c) => c + "x")],
      semantic,
      limit,
      rerank,
    });
  }

  /** Nearest documents to the query by an API embedder's vectors, in the given collections. */
  private async vectorSearch(
    query: string,
    collections: string[],
    limit: number,
    embedder: Extract<EmbedderConfig, { provider: "api" }>,
  ) {
    const started = performance.now();
    if (!collections.length) return { items: [], elapsed_ms: 0 };
    const receipt = await this.receipt();
    const map = await readJson<Record<string, string>>(
      this.store.p(`views/${receipt.release_id}/semantic-map.json`),
    );
    const vectors = await (await this.vectors(embedder)).load();
    // A question is embedded while someone waits, so an unreachable embedder fails fast and
    // recall carries on with keywords.
    const [question] = await embedTexts(embedder, [query], fetch, {
      attempts: 1,
      timeout_ms: 8000,
    });
    const wanted = new Set(collections);
    const items = Object.entries(map)
      .filter(([file]) => wanted.has(file.split("/")[0]))
      .flatMap(([file, h]) => {
        const vector = vectors.get(h);
        return vector ? [{ file, score: similarity(question, vector) }] : [];
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
    return { items, elapsed_ms: performance.now() - started };
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

import * as fs from "node:fs/promises";
import path from "node:path";
import { Store, type Ledger } from "./store.js";
import { Projections } from "./projections.js";
import {
  VERSION,
  APP,
  ensure,
  uid,
  readJson,
  atomic,
  immutable,
  hash,
  json,
  now,
  ref,
  key,
  objectPath,
  recordRefs,
  refs,
  withLock,
  exists,
  validate,
  STATE,
} from "./core.js";
import type { Ref, RecordData } from "./core.js";
import type { LifecyclePlanData } from "./generated/lifecycle-plan.js";

export class Lifecycle {
  constructor(
    public store: Store,
    public projections = new Projections(store),
  ) {}
  private async authorizePlan(p: LifecyclePlanData) {
    ensure(
      p.corpus_id === (await this.store.config()).corpus_id,
      "SCOPE_DENIED",
      "Lifecycle plan belongs to another corpus",
    );
    const inventory = await readJson(
      this.store.p(`lifecycle/purge-work/${p.plan_id}.json`),
    ).catch(() => null);
    if (p.action === "purge" && inventory) {
      // The previous attempt may already have removed canonical metadata.
      // Legacy recovery inventories lacked this snapshot; only a full owner may resume those.
      if (inventory.required_scope)
        await this.store.scope(inventory.required_scope);
      else await this.store.requireFullScope(true);
      return;
    }
    const records = await this.store.records(),
      scope = await this.store.scope();
    const targets = new Set(p.targets.map((r) => r.id));
    const touched =
      p.action === "purge"
        ? p.affected_refs.map((r) => records.get(r.id))
        : [...records.values()].filter(
            (r) =>
              targets.has(r.id) ||
              (r.record_type === "passage" &&
                targets.has((r.payload as any).source_ref.id)),
          );
    for (const record of touched) {
      ensure(record, "PLAN_STALE", "Lifecycle target no longer exists");
      await this.store.requireWritable(record, scope);
    }
    for (const target of p.targets)
      ensure(
        key(records.get(target.id) ?? { id: "", revision: 0 }) === key(target),
        "PLAN_STALE",
        "Lifecycle target revision changed",
      );
  }
  async plan(
    action: LifecyclePlanData["action"],
    targets: Ref[],
    reason: string,
  ) {
    const scope = await this.store.scope(),
      records = await this.store.records(),
      release = await this.store.current();
    ensure(release, "VALIDATION_FAILED", "No release");
    ensure(
      targets.length && reason.trim(),
      "VALIDATION_FAILED",
      "Targets and reason are required",
    );
    for (const t of targets) {
      const r = records.get(t.id);
      ensure(r && key(r) === key(t), "PLAN_STALE", "Target revision changed");
      ensure(
        scope.write_modules.includes(r.maintenance_module),
        "SCOPE_DENIED",
        "Lifecycle target is outside writable modules",
      );
      await this.store.requireWritable(r, scope);
    }
    const affected = new Set(targets.map((x) => x.id));
    let changed = true;
    while (changed) {
      changed = false;
      for (const r of records.values())
        if (
          !affected.has(r.id) &&
          recordRefs(r).some((d) => affected.has(d.id))
        ) {
          affected.add(r.id);
          changed = true;
        }
    }
    if (action === "purge")
      for (const id of affected)
        ensure(
          scope.write_modules.includes(records.get(id)!.maintenance_module),
          "SCOPE_DENIED",
          "Purge affects another maintenance module; authorize its scope before deletion",
        );
    const p: LifecyclePlanData = {
      schema_version: VERSION,
      plan_id: uid("plan-"),
      corpus_id: (await this.store.config()).corpus_id,
      base_release: release,
      action,
      targets,
      reason,
      affected_refs: [...affected].map((id) => ref(records.get(id)!)),
      components:
        action === "purge"
          ? [
              "originals",
              "records",
              "extractions",
              "graph",
              "search",
              "wiki",
              "jobs",
              "audit",
              "managed_exports",
              "managed_backups",
            ]
          : ["records", "graph", "search", "wiki"],
      outside_control: [
        "Unmanaged external copies, user backups and material already sent to a model/provider are outside local deletion control.",
      ],
      authorization_ref: null,
      state: "planned",
      receipts: [],
      limitations:
        action === "purge"
          ? [
              "All dependent records in this preview are removed conservatively, including mixed-source synthesis. Preserve independently supported parts by revising them before executing this plan.",
              "Managed exports containing these records and all old derived view folders are removed; external copies remain outside this guarantee.",
            ]
          : [],
    };
    await validate("lifecycle-plan", p);
    await immutable(this.store.p(`lifecycle/plans/${p.plan_id}.json`), json(p));
    return p;
  }
  async execute(
    id: string,
    authorization: { action: string; targets: Ref[]; user_instruction: string },
    assessment?: RecordData["assessments"],
  ) {
    ensure(/^plan-[a-z0-9-]+$/.test(id), "VALIDATION_FAILED", "Invalid plan");
    const file = this.store.p(`lifecycle/plans/${id}.json`),
      p = await readJson<LifecyclePlanData>(file);
    await validate("lifecycle-plan", p);
    ensure(
      (await this.store.current()) === p.base_release,
      "PLAN_STALE",
      "Corpus changed after preview",
    );
    ensure(
      ["planned", "incomplete", "running"].includes(p.state),
      "PLAN_STALE",
      "Plan has already executed",
    );
    ensure(
      authorization.action === p.action &&
        JSON.stringify(authorization.targets) === JSON.stringify(p.targets) &&
        authorization.user_instruction.trim().length > 5,
      "AUTHORIZATION_REQUIRED",
      "Supply the actual user instruction matching this action and exact targets",
    );
    await this.authorizePlan(p);
    // This receipt records user authorization supplied by the caller. It cannot confer authority by itself.
    p.authorization_ref = `lifecycle/authorizations/${id}.json`;
    if (!(await exists(this.store.p(p.authorization_ref))))
      await immutable(
        this.store.p(p.authorization_ref),
        json({
          action: p.action,
          targets: p.targets,
          user_instruction: authorization.user_instruction,
          recorded_at: now(),
        }),
      );
    if (p.action === "purge") return this.purge(p);
    if (p.action === "reinstate")
      ensure(
        assessment,
        "VALIDATION_FAILED",
        "Reinstatement requires a current evidence assessment",
      );
    const records = await this.store.records(),
      sourceIds = new Set(
        p.targets
          .filter((t) => records.get(t.id)?.record_type === "source")
          .map((x) => x.id),
      ),
      ids = new Set(p.targets.map((x) => x.id));
    for (const r of records.values())
      if (
        r.record_type === "passage" &&
        sourceIds.has((r.payload as any).source_ref.id)
      )
        ids.add(r.id);
    const updated: RecordData[] = [],
      bodies: Record<string, string> = {};
    for (const id of ids) {
      const old = records.get(id)!,
        r = structuredClone(old);
      r.revision++;
      r.created_at = now();
      r.change_reason = p.reason;
      if (p.action === "archive" || p.action === "unarchive")
        r.archived = p.action === "archive";
      else r.lifecycle = p.action === "withdraw" ? "withdrawn" : "active";
      if (assessment) r.assessments = assessment;
      if (r.body) {
        const body = await this.store.body(old);
        r.body = { path: objectPath(r) + "/body.md", sha256: hash(body) };
        bodies[key(r)] = body;
      }
      updated.push(r);
    }
    const result = await this.store.publish(
      updated,
      bodies,
      p.base_release,
      `${p.action}: ${p.reason}`,
      await this.store.scope(),
    );
    p.state = "complete";
    await atomic(file, json(p));
    await this.store.audit(
      p.action,
      "Applied approved lifecycle operation",
      p.targets,
      result.release_id,
    );
    return { plan: p, publication: result };
  }
  async purge(p: LifecyclePlanData) {
    return withLock(this.store.root, "jobs", () =>
      withLock(this.store.root, "publish", () =>
        withLock(this.store.root, "projection", async () => {
          ensure(
            (await this.store.current()) === p.base_release,
            "PLAN_STALE",
            "Purge preview is stale",
          );
          await this.authorizePlan(p);
          const config = await this.store.config(),
            ledger = await readJson<Ledger>(
              path.join(
                this.store.ledgerRoot,
                hash(config.corpus_id) + ".json",
              ),
            );
          const ids = new Set(p.affected_refs.map((r) => r.id)),
            inventoryPath = this.store.p(
              `lifecycle/purge-work/${p.plan_id}.json`,
            );
          let inventory: any;
          if (await exists(inventoryPath))
            inventory = await readJson(inventoryPath);
          else {
            const records = await this.store.records();
            inventory = {
              required_scope: await this.store.requiredScope(
                [...records.values()].filter((r) => ids.has(r.id)),
              ),
              sources: [...records.values()]
                .filter((r) => ids.has(r.id) && r.record_type === "source")
                .map((r) => ({
                  id: r.id,
                  sha256: (r.payload as any).sha256,
                  original_path: (r.payload as any).original_path,
                  shared: [...records.values()].some(
                    (t) =>
                      t.record_type === "source" &&
                      !ids.has(t.id) &&
                      path.posix.dirname((t.payload as any).original_path) ===
                        path.posix.dirname((r.payload as any).original_path),
                  ),
                })),
            };
            await immutable(inventoryPath, json(inventory));
          }
          this.projections.closeSearch?.();
          const sources = inventory.sources;
          p.state = "running";
          await atomic(
            this.store.p(`lifecycle/plans/${p.plan_id}.json`),
            json(p),
          );
          if (!ledger.operations.some((o: any) => o.plan_id === p.plan_id)) {
            ledger.generation++;
            ledger.blocked_ids = [...new Set([...ledger.blocked_ids, ...ids])];
            ledger.purged_hashes = [
              ...new Set([
                ...ledger.purged_hashes,
                ...sources.map((s: any) => s.sha256),
              ]),
            ];
            ledger.operations.push({
              plan_id: p.plan_id,
              at: now(),
              ids: [...ids],
            });
          }
          // Block first. A crash or partial deletion cannot make affected bytes retrievable.
          await atomic(
            path.join(this.store.ledgerRoot, hash(config.corpus_id) + ".json"),
            json(ledger),
          );
          await atomic(
            this.store.p("lifecycle/ledger-generation.json"),
            json({ generation: ledger.generation }),
          );
          await atomic(
            this.store.p("views/receipt.json"),
            json({ state: "purge_pending", release_id: p.base_release }),
          );
          const failures: string[] = [],
            removed: string[] = [];
          const remove = async (relative: string) => {
            try {
              const target = path.resolve(this.store.root, relative);
              ensure(
                target.startsWith(this.store.root + path.sep),
                "VALIDATION_FAILED",
                "Deletion escaped corpus",
              );
              await fs.rm(target, { recursive: true, force: true });
              removed.push(relative);
            } catch (e: any) {
              failures.push(relative + ": " + e.message);
            }
          };
          for (const id of ids) await remove("objects/" + id.replace(":", "_"));
          for (const s of sources) {
            const original = s.original_path,
              folder = path.posix.dirname(original);
            await remove(s.shared ? original : folder);
          }
          if (await exists(this.store.p("views"))) await remove("views");
          for (const name of await fs
            .readdir(this.store.p("jobs"))
            .catch(() => [])) {
            const job = await readJson(
                this.store.p(`jobs/${name}/job.json`),
              ).catch(() => null),
              staged = await readJson(
                this.store.p(`jobs/${name}/staged.json`),
              ).catch(() => null);
            if (
              job?.source_refs.some((r: Ref) => ids.has(r.id)) ||
              staged?.records.some(
                (r: RecordData) =>
                  ids.has(r.id) || recordRefs(r).some((d) => ids.has(d.id)),
              )
            )
              await remove("jobs/" + name);
          }
          for (const name of await fs
            .readdir(path.join(STATE, "evaluations"))
            .catch(() => [])) {
            const evalPath = path.join(STATE, "evaluations", name),
              manifest = await readJson(
                path.join(evalPath, "manifest.json"),
              ).catch(() => null);
            if (manifest?.corpus_id === config.corpus_id) {
              try {
                await fs.rm(evalPath, { recursive: true, force: true });
                removed.push("managed evaluation " + name);
              } catch (e: any) {
                failures.push("evaluation " + name + ": " + e.message);
              }
            }
          }
          for (const name of await fs
            .readdir(this.store.p("exports"))
            .catch(() => [])) {
            const index = await readJson(
              this.store.p(`exports/${name}/bundle.json`),
            ).catch(() => null);
            if (!index || index.record_ids.some((id: string) => ids.has(id)))
              await remove("exports/" + name);
          }
          for (const name of await fs
            .readdir(this.store.p("retrieval-receipts"))
            .catch(() => [])) {
            const r = await readJson(
              this.store.p("retrieval-receipts/" + name),
            );
            if (refs(r).some((d) => ids.has(d.id)))
              await remove("retrieval-receipts/" + name);
          }
          for (const name of await fs
            .readdir(this.store.p("lifecycle/bulk"))
            .catch(() => [])) {
            const r = await readJson(this.store.p("lifecycle/bulk/" + name));
            if (refs(r).some((d) => ids.has(d.id)))
              await remove("lifecycle/bulk/" + name);
          }
          for (const name of await fs
            .readdir(this.store.p("lifecycle/meaning"))
            .catch(() => [])) {
            const r = await readJson(this.store.p("lifecycle/meaning/" + name));
            if (refs(r).some((d) => ids.has(d.id)))
              await remove("lifecycle/meaning/" + name);
          }
          try {
            const { db, graph } = await this.projections.graph();
            try {
              await graph.query("MATCH (n) DETACH DELETE n");
            } finally {
              await db.close();
            }
          } catch (e: any) {
            failures.push("graph: " + e.message);
          }
          try {
            const index = await this.projections.indexName(),
              cache = path.join(STATE, "cache/qmd");
            for (const suffix of [".sqlite", ".sqlite-wal", ".sqlite-shm"])
              await fs.rm(path.join(cache, index + suffix), { force: true });
          } catch (e: any) {
            failures.push("search: " + e.message);
          }
          // Audit events avoid source prose, but user-supplied reasons may contain it. Redact affected event descriptions and lifecycle authorization text.
          for (const name of await fs
            .readdir(this.store.p("audit/events"))
            .catch(() => [])) {
            const f = this.store.p("audit/events/" + name),
              e = await readJson(f);
            if (
              (e.record_refs ?? e.affected_refs)?.some((r: Ref) =>
                ids.has(r.id),
              )
            ) {
              e.description = "Content redacted by explicit purge";
              e.reason = e.description;
              await atomic(f, json(e));
            }
          }
          for (const name of await fs
            .readdir(this.store.p("releases"))
            .catch(() => [])) {
            if (!/^release-[a-z0-9-]+\.json$/.test(name)) continue;
            const f = this.store.p("releases/" + name),
              r = await readJson(f);
            if (r.records.some((e: any) => ids.has(e.record_ref.id))) {
              r.change_reason =
                "Historical description redacted by explicit purge";
              await atomic(f, json(r));
            }
          }
          for (const name of await fs
            .readdir(this.store.p("lifecycle/plans"))
            .catch(() => [])) {
            const f = this.store.p("lifecycle/plans/" + name),
              r = await readJson(f);
            if (refs(r).some((d) => ids.has(d.id))) {
              r.reason = "Description redacted by explicit purge";
              await atomic(f, json(r));
            }
          }
          for (const name of await fs
            .readdir(this.store.p("lifecycle/authorizations"))
            .catch(() => [])) {
            const f = this.store.p("lifecycle/authorizations/" + name),
              r = await readJson(f);
            if (refs(r).some((d) => ids.has(d.id))) {
              r.user_instruction = "Redacted after authorized purge";
              await atomic(f, json(r));
            }
          }
          await atomic(
            this.store.p(p.authorization_ref!),
            json({
              action: "purge",
              targets: p.targets,
              recorded_at: now(),
              user_instruction: "Redacted after authorized purge",
            }),
          );
          p.reason = "Explicitly authorized content purge";
          p.state = failures.length ? "incomplete" : "complete";
          p.receipts = [`lifecycle/receipts/${p.plan_id}.json`];
          await atomic(
            this.store.p(p.receipts[0]),
            json({
              removed,
              failures,
              completed_at: now(),
              redacted_history: true,
            }),
          );
          await atomic(
            this.store.p(`lifecycle/plans/${p.plan_id}.json`),
            json(p),
          );
          if (!failures.length) await fs.rm(inventoryPath, { force: true });
          await this.store.audit(
            "purge",
            "Purged authorized material; historical releases are redacted",
            p.targets,
            p.base_release,
            failures.length ? "incomplete" : "completed",
          );
          return { plan: p, removed, failures };
        }),
      ),
    );
  }
}

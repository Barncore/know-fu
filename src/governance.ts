import { Store } from "./store.js";
import {
  ensure,
  atomic,
  immutable,
  readJson,
  json,
  uid,
  now,
  key,
  ref,
  refs,
  hash,
  objectPath,
  validate,
  withLock,
} from "./core.js";
import type { Ref, RecordData } from "./core.js";
export class Governance {
  constructor(public store: Store) {}
  async configure(input: any) {
    return withLock(this.store.root, "publish", async () => {
      const config = await this.store.config(),
        scope = await this.store.scope();
      ensure(
        input.authorization?.trim(),
        "AUTHORIZATION_REQUIRED",
        "Configuration changes require the user task authorizing this scope",
      );
      ensure(
        config.modules.every((m) => scope.write_modules.includes(m.module_id)),
        "SCOPE_DENIED",
        "Library configuration requires the owning project with all modules writable",
      );
      if (input.module) {
        ensure(
          /^[a-z][a-z0-9_-]*$/.test(input.module.module_id),
          "VALIDATION_FAILED",
          "Invalid module ID",
        );
        ensure(
          !config.modules.some((m) => m.module_id === input.module.module_id),
          "REVISION_CONFLICT",
          "Module already exists",
        );
        config.modules.push(input.module);
        const binding = config.project_bindings.find(
          (b) => b.project_id === this.store.project,
        )!;
        binding.read_modules.push(input.module.module_id);
        binding.write_modules.push(input.module.module_id);
      }
      for (const d of input.domains ?? [])
        if (!config.domains.some((x) => x.domain_id === d.domain_id))
          config.domains.push(d);
      if (input.binding) {
        const b = input.binding;
        ensure(
          [...b.read_modules, ...b.write_modules].every((m) =>
            config.modules.some((x) => x.module_id === m),
          ) && b.write_modules.every((m: string) => b.read_modules.includes(m)),
          "SCOPE_DENIED",
          "Binding modules must exist and writes require reads",
        );
        ensure(
          !config.project_bindings.some((x) => x.project_id === b.project_id),
          "REVISION_CONFLICT",
          "Project already bound; edit requires an explicit replacement plan",
        );
        config.project_bindings.push(b);
      }
      const dimensions = await readJson(this.store.p("dimensions.json")).catch(
        () => ({}),
      );
      if (input.dimensions) {
        for (const [name, d] of Object.entries<any>(input.dimensions))
          ensure(
            /^[a-z][a-z0-9_.-]*$/.test(name) &&
              ["number", "string", "boolean"].includes(d.type) &&
              (d.unit === null || typeof d.unit === "string"),
            "VALIDATION_FAILED",
            "Invalid condition dimension",
          );
        for (const [k, v] of Object.entries(input.dimensions)) {
          ensure(
            !dimensions[k] ||
              JSON.stringify(dimensions[k]) === JSON.stringify(v),
            "REVISION_CONFLICT",
            "An existing dimension cannot change meaning; register a new named dimension",
          );
          dimensions[k] = v;
        }
      }
      await validate("corpus", config);
      const previous = await this.store.config();
      await immutable(
        this.store.p(`configuration/history/${uid()}.json`),
        json(previous),
      );
      await atomic(this.store.p("dimensions.json"), json(dimensions));
      await atomic(this.store.p("corpus.json"), json(config));
      await this.store.audit(
        "configure",
        "Registered authorized library scope or condition dimensions",
        [],
      );
      return {
        config,
        dimensions: await readJson(this.store.p("dimensions.json")).catch(
          () => ({}),
        ),
      };
    });
  }
  async plan(
    kind: "supersede" | "merge_concepts",
    target: Ref,
    replacement: Ref,
    reason: string,
  ) {
    ensure(
      ["supersede", "merge_concepts"].includes(kind),
      "VALIDATION_FAILED",
      "Unknown meaning operation",
    );
    ensure(
      reason?.trim() && target.id !== replacement.id,
      "VALIDATION_FAILED",
      "Distinct records and a reason are required",
    );
    const all = await this.store.records(),
      a = all.get(target.id),
      b = all.get(replacement.id),
      scope = await this.store.scope();
    ensure(
      a && b && key(a) === key(target) && key(b) === key(replacement),
      "REVISION_CONFLICT",
      "Select exact current revisions",
    );
    ensure(
      [a, b].every((r) => scope.write_modules.includes(r.maintenance_module)),
      "SCOPE_DENIED",
      "Both records must be writable",
    );
    ensure(
      a.record_type !== "source" && a.epistemic !== "source_account",
      "VALIDATION_FAILED",
      "Keep original sources and source-specific accounts; qualify or challenge them instead",
    );
    ensure(
      a.scope.domains.some((d) => b.scope.domains.includes(d)),
      "VALIDATION_FAILED",
      "No overlapping applicability domain",
    );
    if (kind === "merge_concepts")
      ensure(
        a.record_type === "concept" && b.record_type === "concept",
        "VALIDATION_FAILED",
        "Concept merge requires two scoped concepts",
      );
    const affected = new Set([a.id, b.id]);
    for (let i = 0; i < all.size; i++) {
      let changed = false;
      for (const r of all.values())
        if (
          !affected.has(r.id) &&
          r.depends_on.some((d) => affected.has(d.id))
        ) {
          affected.add(r.id);
          changed = true;
        }
      if (!changed) break;
    }
    const plan = {
      version: 1,
      plan_id: uid("meaning-"),
      kind,
      base_release: await this.store.current(),
      target,
      replacement,
      reason,
      affected_refs: [...affected].map((id) => ref(all.get(id)!)),
      outside_write_scope: [...affected].filter(
        (id) => !scope.write_modules.includes(all.get(id)!.maintenance_module),
      ),
      scope_warning:
        "Verify definitions, conditions, units and intended use. This preserves old accounts and marks dependents for reassessment; it does not silently rewrite them.",
      created_at: now(),
    };
    await immutable(
      this.store.p(`lifecycle/meaning/${plan.plan_id}.json`),
      json(plan),
    );
    return { ...plan, plan_hash: hash(json(plan)) };
  }
  async execute(id: string, planHash: string, authorization: string) {
    ensure(
      /^meaning-[a-z0-9-]+$/.test(id),
      "VALIDATION_FAILED",
      "Invalid meaning plan",
    );
    const p = await readJson(this.store.p(`lifecycle/meaning/${id}.json`));
    ensure(
      planHash === hash(json(p)) && authorization?.trim(),
      "AUTHORIZATION_REQUIRED",
      "Execute the reviewed plan with its hash and actual task authorization",
    );
    ensure(
      (await this.store.current()) === p.base_release,
      "PLAN_STALE",
      "Meaning plan is stale",
    );
    const a = structuredClone(await this.store.exact(p.target)),
      b = structuredClone(await this.store.exact(p.replacement)),
      bodies: Record<string, string> = {};
    for (const r of [a, b]) {
      const body = await this.store.body(r);
      r.revision++;
      r.created_at = now();
      r.change_reason = p.reason;
      if (r.body) {
        r.body = { path: objectPath(r) + "/body.md", sha256: hash(body) };
        bodies[key(r)] = body;
      }
    }
    a.lifecycle = "superseded";
    b.supersedes.push(p.target);
    if (p.kind === "merge_concepts")
      (b.payload as any).aliases = [
        ...new Set([
          ...(b.payload as any).aliases,
          a.title,
          ...(a.payload as any).aliases,
        ]),
      ];
    const out = await this.store.publish(
      [a, b],
      bodies,
      p.base_release,
      p.kind + ": " + p.reason,
      await this.store.scope(),
    );
    await this.store.audit(
      p.kind,
      "Applied reviewed meaning change; dependents require reassessment",
      [ref(a), ref(b)],
      out.release_id,
    );
    return out;
  }
}

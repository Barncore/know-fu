import { KBError, projectContains, projectKey, sameProject } from "./core.js";
import type { CorpusData } from "./core.js";

/**
 * What a caller may do with a library, held per module:
 * - read: recall, brief, connect, read and list published research;
 * - save: file worked answers (`kb_file`) and keep and update ideas (`kb_idea`);
 * - author: ingest sources, write notes, propose, and advance and publish jobs;
 * - administer: configuration, lifecycle changes including purge, imports, and
 *   whole-library verify, export, restore and evaluation.
 */
export type Capability = "read" | "save" | "author" | "administer";
/** A capability that writes; `Store.scope` puts its modules in `write_modules`. */
export type WriteCapability = Exclude<Capability, "read">;
/** A requirement an operation states: one capability, or "write" for any of save, author or administer. */
export type Need = Capability | "write";

export type Access = {
  /** The calling folder exactly as the launcher passed it (`KB_PROJECT`). Never replaced. */
  project: string;
  /** How the access was found: the folder's own binding, a binding of a folder that contains it, or the any-folder default. */
  via: "binding" | "inherited_binding" | "any_project";
  /** The project_id of the binding that applied, or null for the any-folder default. */
  binding: string | null;
  /** Whether the library has an access policy (`access` in corpus.json). Without one, every rule is as it was before policies existed. */
  policy: boolean;
  /** The library's home folder, when the policy names one. */
  home: string | null;
  read: string[];
  save: string[];
  author: string[];
  administer: string[];
};

type Binding = CorpusData["project_bindings"][number];

function fromBinding(binding: Binding) {
  return {
    read: [...binding.read_modules],
    save: [...(binding.save_modules ?? binding.write_modules)],
    author: [...(binding.author_modules ?? binding.write_modules)],
    administer: [...(binding.administer_modules ?? binding.write_modules)],
  };
}

/**
 * Finds what a calling folder may do, or null when it has no access at all.
 * 1. The folder's own binding.
 * 2. With an access policy: the binding of the closest folder that contains it.
 * 3. With an access policy that lets any folder read: the any-folder default, which never administers.
 * A folder's own binding always beats the default, so a fenced folder stays fenced.
 */
export function resolveAccess(
  config: CorpusData,
  project: string,
): Access | null {
  const policy = config.access;
  const base = {
    project,
    policy: Boolean(policy),
    home: policy?.home_project ?? null,
  };
  const own = config.project_bindings.find((b) =>
    sameProject(b.project_id, project),
  );
  if (own)
    return {
      ...base,
      via: "binding",
      binding: own.project_id,
      ...fromBinding(own),
    };
  if (policy) {
    const outer = config.project_bindings
      .filter((b) => projectContains(b.project_id, project))
      .sort(
        (a, b) =>
          projectKey(b.project_id).length - projectKey(a.project_id).length,
      )[0];
    if (outer)
      return {
        ...base,
        via: "inherited_binding",
        binding: outer.project_id,
        ...fromBinding(outer),
      };
    const any = policy.any_project;
    if (any?.read_modules.length) {
      const readable = (modules: string[]) =>
        modules.filter((m) => any.read_modules.includes(m));
      return {
        ...base,
        via: "any_project",
        binding: null,
        read: [...any.read_modules],
        save: readable(any.save_modules),
        author: readable(any.author_modules),
        administer: [],
      };
    }
  }
  return null;
}

/** The modules where the caller holds a requirement; "write" is the union of the writing capabilities. */
export function modulesFor(access: Access, need: Need) {
  return need === "write"
    ? [...new Set([...access.save, ...access.author, ...access.administer])]
    : access[need];
}

/** Whether the caller holds a requirement on one module, on every module, or on at least one. */
export function holds(
  access: Access,
  need: Need,
  modules: string[] | "any" | "all",
  config: CorpusData,
) {
  const held = modulesFor(access, need);
  if (modules === "any") return held.length > 0;
  const wanted =
    modules === "all" ? config.modules.map((m) => m.module_id) : modules;
  return wanted.every((m) => held.includes(m));
}

/** What was refused, in words: "Ingesting sources and writing notes in module "x"". */
function doing(need: Need, module?: string, whole?: boolean) {
  const named = module ? `"${module}"` : null;
  switch (need) {
    case "read":
      return named ? `Reading module ${named}` : "Reading the library";
    case "save":
      return `Saving answers and ideas${named ? ` into module ${named}` : ""}`;
    case "author":
      return `Ingesting sources and writing notes${named ? ` in module ${named}` : ""}`;
    case "administer":
      return whole
        ? "Administering the whole library"
        : named
          ? `Administering module ${named}`
          : "Administering the library";
    case "write":
      return "Rebuilding the library's views";
  }
}
const DO: Record<Need, string> = {
  read: "Read it",
  save: "Save them",
  author: "Ingest",
  administer: "Administer it",
  write: "Rebuild them",
};
const ABLE: Record<Capability, string> = {
  read: "read the library",
  save: "save answers and ideas",
  author: "ingest sources and write notes",
  administer: "administer the library",
};

function list(items: string[]) {
  return items.length < 2
    ? items.join("")
    : `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

/** One sentence saying what a folder can do, naming modules only when the library has more than one. */
export function describeAccess(
  access: Access | null,
  config: CorpusData,
  project = access?.project ?? "unknown",
) {
  const where = `This folder (${project})`;
  if (!access) return `${where} has no access to this library.`;
  const many = config.modules.length > 1;
  const parts = (["read", "save", "author", "administer"] as const)
    .filter((c) => access[c].length)
    .map((c) => {
      const all = config.modules.every((m) => access[c].includes(m.module_id));
      return many && !all
        ? `${ABLE[c]} (${access[c].map((m) => `"${m}"`).join(", ")})`
        : ABLE[c];
    });
  const how =
    access.via === "binding"
      ? "its own binding"
      : access.via === "inherited_binding"
        ? `the binding of ${access.binding}, which contains it`
        : "the library's setting for folders without a binding";
  return parts.length
    ? `${where} can ${list(parts)}, through ${how}.`
    : `${where} has no access to this library.`;
}

/**
 * A refusal that says what was refused, what the caller can do, and where the refused
 * work is done. It names the home folder but never another project's binding.
 */
export function denial(
  access: Access | null,
  config: CorpusData,
  project: string,
  need: Need,
  options: { module?: string; whole?: boolean; operation?: string } = {},
) {
  const home = config.access?.home_project ?? null;
  const opening = access
    ? `${doing(need, options.module, options.whole)}${options.operation ? ` (${options.operation})` : ""} isn't allowed from this folder.`
    : "Project is not bound to this corpus.";
  const able = describeAccess(access, config, project);
  const atHome =
    access?.binding && home ? sameProject(access.binding, home) : false;
  // A fenced folder is refused something any unbound folder may do; say why.
  const any = config.access?.any_project;
  const elsewhere =
    any && need !== "administer" && need !== "write"
      ? any[`${need}_modules`]
      : [];
  const fenced =
    !!access &&
    access.via !== "any_project" &&
    (options.module
      ? elsewhere.includes(options.module)
      : elsewhere.length > 0 && !options.whole);
  let next: string;
  if (!access)
    next = home
      ? `Use the library from its home folder, ${home}, or bind this folder there with kb_maintain configure.`
      : "Use a bound folder, or have the library's administrator bind this one with kb_maintain configure.";
  else if (home && !atHome)
    next = fenced
      ? `${DO[need]} from the library's home folder, ${home}. Folders without a binding may do this, but this folder's own binding limits it.`
      : `${DO[need]} from the library's home folder, ${home}.`;
  else if (home)
    next = `This is the library's home folder; its binding doesn't allow this here. Change the binding with kb_maintain configure if it should.`;
  else
    next =
      "Use a folder whose binding allows it, or have the library's administrator add one with kb_maintain configure.";
  return new KBError("SCOPE_DENIED", `${opening} ${able} ${next}`, {
    project,
    needs: need,
    ...(options.module ? { module: options.module } : {}),
    ...(options.whole ? { modules: "all" } : {}),
    via: access?.via ?? null,
    can: {
      read: access?.read ?? [],
      save: access?.save ?? [],
      author: access?.author ?? [],
      administer: access?.administer ?? [],
    },
    home_project: home,
  });
}

/** What each tool call needs, checked before it runs when the library has an access policy. */
export type Requirement = {
  need: Need;
  /** The requirement holds on every module rather than at least one. */
  whole?: boolean;
  operation: string;
};

const READING_TOOLS = new Set([
  "kb_brief",
  "kb_recall",
  "kb_connect",
  "kb_retrieve",
]);
const AUTHORING_TOOLS = new Set([
  "kb_ingest",
  "kb_job",
  "kb_write",
  "kb_propose",
  "kb_change",
]);
const IDEA_READS = new Set(["list", "show", "export"]);
const MAINTENANCE: Record<string, { need: Need; whole?: boolean }> = {
  configure: { need: "administer", whole: true },
  verify: { need: "administer", whole: true },
  export: { need: "administer", whole: true },
  formats: { need: "administer", whole: true },
  restore: { need: "administer", whole: true },
  import: { need: "administer" },
  reindex: { need: "write" },
  wiki_edit: { need: "read" },
  preview_bulk: { need: "author" },
  execute_bulk: { need: "author" },
  plan_meaning: { need: "author" },
  execute_meaning: { need: "author" },
};

/**
 * The one place that says which capability each tool call exercises. Module-level checks
 * still happen inside each operation; this gate refuses early with a useful message.
 */
export function requirement(tool: string, input: any = {}): Requirement | null {
  if (tool === "kb_status")
    return input.job_id
      ? { need: "author", operation: "kb_status with a job" }
      : { need: "read", operation: tool };
  if (READING_TOOLS.has(tool)) return { need: "read", operation: tool };
  if (AUTHORING_TOOLS.has(tool)) return { need: "author", operation: tool };
  if (tool === "kb_read")
    return input.kind === "unit"
      ? { need: "author", operation: "kb_read of a source unit" }
      : { need: "read", operation: tool };
  if (tool === "kb_file") return { need: "save", operation: tool };
  if (tool === "kb_idea") {
    const action = input.action ?? (input.idea ? "show" : "list");
    return IDEA_READS.has(action)
      ? { need: "read", operation: `kb_idea ${action}` }
      : { need: "save", operation: `kb_idea ${action}` };
  }
  if (tool === "kb_lifecycle")
    return { need: "administer", operation: "kb_lifecycle" };
  if (tool === "kb_evaluate")
    return { need: "administer", whole: true, operation: "kb_evaluate" };
  if (tool === "kb_maintain") {
    const rule = MAINTENANCE[input.action];
    return rule ? { ...rule, operation: `kb_maintain ${input.action}` } : null;
  }
  return null;
}

/** What `kb_status` shows a caller about its own access. */
export function accessSummary(access: Access, config: CorpusData) {
  return {
    project: access.project,
    via: access.via,
    binding: access.binding,
    home_project: access.home,
    read: access.read,
    save: access.save,
    author: access.author,
    administer: access.administer,
    summary: describeAccess(access, config),
  };
}

/**
 * The configuration a caller without administer on every module may see: no project
 * bindings, no any-folder default, and only the modules it can read.
 */
export function redactedConfig(config: CorpusData, access: Access) {
  return {
    schema_version: config.schema_version,
    corpus_id: config.corpus_id,
    title: config.title,
    integration: config.integration,
    modules: config.modules.filter((m) => access.read.includes(m.module_id)),
    domains: config.domains,
    ...(config.access
      ? { access: { home_project: config.access.home_project } }
      : {}),
    redacted:
      "Project bindings and the library's access settings are shown only to a folder that administers every module.",
  };
}

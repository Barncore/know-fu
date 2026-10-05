# Keeping code and docs together

This repository is the source of truth for the code. The plugin installed in an agent's profile, and its cache, are deployed copies. The machine-local engine state and the library itself stay out of version control.

Docs drift fast in a project like this, so here's the map of what to touch when:

| When you change | Also update |
|---|---|
| Product intent, an owner decision, or plan status | `docs/NORTH_STAR.md` for intent and decisions, `docs/ROADMAP.md` for tasks. Keep intent, proposals, implementation and evidence distinct |
| Behavior a user or agent can see, or a known limit | The README, the affected skill guide, the change log |
| Schemas, record meaning or ownership | The engine contracts, generated types (the build regenerates them), `plugin/docs/architecture.md`, the plugin's contract copies, the change log |
| Setup defaults, paths, or backend support | `plugin/docs/setup.md`, `setup-choices.md`, `setup-ai.md`, the configuration examples, the change log |
| Copied code or a new dependency | Lockfiles, `plugin/docs/lineage.md`, notices where needed, the change log |
| What has been demonstrated | `docs/VALIDATION.md`, plus any README or setup claim that leans on it |
| Retrieval or indexing performance | `docs/PERFORMANCE.md`, the architecture notes, and regression tests for the affected route |
| A lesson worth keeping | `LESSONS.md`, with the reason and what to do differently |

Regenerate the plugin's contract copies after changing an engine schema or the transcription example. `npm run check:package` checks the copies, the corpus example and local links. `npm run check:release -- --staged` checks the staged files for excluded material, private machine paths, common credential patterns and broken links, and makes sure a change log entry came along. These checks catch slips. They can't prove the meaning is right, or that no secret got through.

Every finished change gets a dated change log entry. A code-only fix with nothing for users to read can say "Documentation impact: none" with a reason, and reviewers should actually judge that reason rather than wave it through.

The docs are written in a conversational voice: the way you'd explain the project to a sharp colleague, with real names, real numbers and a view where a choice was made. The owner settled on it on 5 October 2026. [AGENTS.md](../AGENTS.md) has the details. Past change log entries and earlier validation records stay as they were written, because they're history.

The first commit summarized earlier local development rather than inventing a fake history. The repository has been public since 30 September 2026. Private evidence stays local, and no open-source license has been chosen yet.

## Where things live in `src/`

| File | Owns |
|---|---|
| `core.ts` | Hashing, atomic and immutable writes, safe paths, locks, schema validation, condition evaluation |
| `store.ts` | Releases, exact reads, scope checks, compiling and validating proposals, publication, the audit journal |
| `jobs.ts`, `source-workflow.ts`, `media.ts`, `visuals.ts` | Ingestion jobs, conversion, source review, frames, crops and paid media transcription |
| `notes.ts`, `quote.ts` | `kb_write` note compilation, assessment checks and quote matching |
| `knowledge-impact.ts` | Which accounts a change affects |
| `library-index.ts`, `text-index.ts` | The recall index: visibility and reliance rules, BM25, the link map with labels, spreading activation |
| `recall.ts`, `brief.ts`, `connect.ts`, `filing.ts` | `kb_recall`, `kb_brief`, `kb_connect`, `kb_file` |
| `navigation.ts`, `research-view.ts`, `reading.ts`, `reading-render.ts` | Progressive reading and its MCP presentation |
| `retrieval.ts` | The older packet route |
| `projections.ts`, `graph-projection.ts`, `qmd-search.ts`, `qmd-worker.ts` | Wiki, FalkorDB and QMD views, and view cleanup |
| `present.ts`, `job-render.ts`, `mcp.ts`, `api.ts`, `cli.ts` | Tool descriptions, dispatch, and what MCP clients receive |
| `lifecycle.ts`, `governance.ts`, `maintenance.ts` | Archive, withdrawal, purge, configuration, meaning changes, export and restore |
| `evaluation*.ts` | Frozen evaluations through Codex |

## Changing recall, brief or connect

These are where most future work will land, so they come with rules. Don't write a second copy of a guard rule. Reliance comes from `blockedIds` in `core.ts`, which every read path uses. What must travel with an account comes from `ResearchView.materialContext`, which recall and progressive reading both call. Any new read path has to apply exactly what the recall index applies: scope and source restrictions before anything is revealed, withdrawal anywhere in a record's exact inputs, archive state, pinned releases, and pending-reassessment flags. Caveats travel with what they qualify, regardless of rank or the graph. A summary or a filed answer never counts as an extra source. Assessment levels never touch ranking. Keep `test/recall.test.ts`, `test/connect.test.ts` and `test/audit-fixes.test.ts` passing, and add a case for every new rule. A good regression starts as a reproduction and fails on the old code before the fix goes in.

Judge a retrieval change on two things together: answer quality and tokens sent. Use the blind A/B method recorded in `docs/VALIDATION.md` on 5 October 2026. Never tune on the cases you report; write fresh ones. Local benchmark copies of real libraries go in the ignored `.bench/` folder.

## Changing progressive reading

`navigation.ts` owns authored summaries, section boundaries and purpose requirements. `research-view.ts` owns the pinned, scoped view and the material-context rules. `reading.ts` selects and opens content, and `reading-render.ts` presents it compactly to MCP clients. To change the API, change the reading schemas first, rebuild to regenerate the types, and regenerate the plugin contracts with `node scripts/package-plugin.mjs`.

Three things look alike and aren't: input provenance, assessment targets and conceptual prerequisites. A judgment's list of assessed accounts doesn't make those accounts prerequisites of each other. Keep qualification discovery independent of the graph, and keep complete explanations available even when discovery only returns summaries.

## Repeating capability checks

Use an isolated library, freeze its release and the case criteria before running anything, and keep failed attempts. Version 3 evaluations record the whole reading trajectory and the measured input. Their manifest binds the implementation, budgets, scope, cases and grader-source authorization. So a changed implementation needs a new run, and a release mismatch needs a new comparison. Never overwrite a receipt to get past either.

Check the isolation receipt against the exact runtime and state binding before any model call. If the isolation probe fails, stop there; never fall back to a looser sandbox. And permission to send a public source to a grader is not permission to send private research.

When another publication makes a job's base stale, use the job's `rebase` action and look at its next stage. Unfinished conversion, reading and integration stay required. A job that was already past reweaving goes back to it, so its consequences get reviewed against the new base. Rebasing never marks old coverage complete.

## Refreshing an installed plugin

Before refreshing, check the current plugin's file hashes and keep a local backup. Copy the package with the install script, refresh it through the agent's supported plugin command, then check tool discovery, the guides and the existing library binding in a fresh process. Machine-local configuration stays out of Git.

One trap: a plugin backup doesn't roll back the engine it points at. A real rollback has to line up the engine's Git revision, its rebuilt output and the plugin version. Keep library and ledger backups together, and check that the target engine can read any jobs or records created since the backup. The current engine reads earlier jobs and records, but an older engine rejects records that carry quote citations or an evidence `basis`.

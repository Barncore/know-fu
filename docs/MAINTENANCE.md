# Keeping code and docs together

This repository is the development source. The plugin installed in an agent's profile, and its cache, are deployed copies. The machine-local engine state and the library stay outside version control.

| When you change | Also update |
|---|---|
| Product intent, an owner decision, or plan status | `docs/NORTH_STAR.md` for intent and decisions, `docs/ROADMAP.md` for tasks and open questions. Keep intent, proposals, implementation and evidence distinct |
| Behavior a user or agent can see, or a known limit | The README, the affected skill guide, the change log |
| Schemas, record meaning or ownership | The engine contracts, generated types (the build regenerates them), `plugin/docs/architecture.md`, the plugin's contract copies, the change log |
| Setup defaults, paths, or backend support | `plugin/docs/setup.md`, `setup-choices.md`, `setup-ai.md`, the configuration examples, the change log |
| Copied code or a new dependency | Lockfiles, `plugin/docs/lineage.md`, notices where needed, the change log |
| What has been demonstrated | `docs/VALIDATION.md`, plus any README or setup claim that depends on it |
| Retrieval or indexing performance | `docs/PERFORMANCE.md`, the architecture notes, and regression tests for the affected route |
| A lesson worth keeping | `LESSONS.md`, with the reason and what to do differently |

Regenerate the plugin's contract copies after changing an engine schema or the transcription example. `npm run check:package` checks the copies, the corpus example and local links. `npm run check:release -- --staged` checks the staged files for excluded material, private machine paths, common credential patterns, broken links, and that a change log entry came with the change. These checks catch mistakes; they can't prove the meaning is right or that no secret slipped through.

Every completed change gets a dated change log entry. A code-only fix with nothing for users to read can say so with "Documentation impact: none" and a reason; reviewers should judge that reason rather than treat it as a loophole.

Repository docs follow the plainer style the owner chose on 5 October 2026: short sentences, real names of files, tools and fields, concrete numbers, and a stated view where a choice was made. Keep past change log entries and earlier validation records as they were written; they are history. The owner's personal writing voice is not the repository voice.

The first commit summarized earlier local development rather than inventing old commits. The repository has been public since 30 September 2026. Private evidence stays local, and no open-source license has been chosen yet.

## Where things live in `src/`

| File | Owns |
|---|---|
| `core.ts` | Hashing, atomic and immutable writes, safe paths, locks, schema validation, condition evaluation |
| `store.ts` | Releases, exact reads, scope checks, compilation and validation of proposals, publication, the audit journal |
| `jobs.ts`, `source-workflow.ts`, `media.ts`, `visuals.ts` | Ingestion jobs, conversion, source review, frames, crops and paid media transcription |
| `notes.ts`, `quote.ts` | `kb_write` note compilation and quote matching |
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

Any new read path must apply the same rules as the recall index: scope and source restrictions before anything is revealed, withdrawal anywhere in a record's exact inputs, archive state, pinned releases, and pending-reassessment flags. Caveats travel with what they qualify, independent of rank and of the graph. A summary or a filed answer never counts as an extra source. Keep `test/recall.test.ts` and `test/connect.test.ts` passing and add a case for each new rule.

Judge a retrieval change by answer quality and by tokens sent, using the blind A/B method recorded in `docs/VALIDATION.md` on 5 October 2026. Never tune on the cases you report; write new ones. Keep local benchmark copies of real libraries in the ignored `.bench/` folder.

## Changing progressive reading

`navigation.ts` owns authored summaries, section boundaries and purpose requirements. `research-view.ts` owns the pinned, scoped view and the material-context rules. `reading.ts` selects and opens content, and `reading-render.ts` presents it compactly to MCP clients. When changing the API, change the reading schemas first, rebuild to regenerate types, and regenerate the plugin contracts with `node scripts/package-plugin.mjs`.

Input provenance, assessment targets and conceptual prerequisites are different things. A judgment's list of assessed accounts does not make them prerequisites of each other. Keep qualification discovery independent of the graph, and keep complete explanations available even when discovery returns only summaries.

## Repeating capability checks

Use an isolated library, freeze its release and the case criteria before running, and keep failed attempts. Version 3 evaluations record the whole reading trajectory and the measured input. Their manifest binds the implementation, budgets, scope, cases and grader-source authorization, so a changed implementation needs a new run, and a release mismatch needs a new comparison. Never overwrite a receipt to get past either.

Check the isolation receipt against the exact runtime and state binding before any model call. If the isolation probe fails, stop; never fall back to a looser sandbox. Permission to send a public source to a grader is not permission to send private research.

When another publication makes a job's base stale, use the job's `rebase` action and look at its next stage. Unfinished conversion, reading and integration stay required. A job already past reweaving goes back to it so its consequences can be reviewed against the new base. Rebasing never marks old coverage complete.

## Refreshing an installed plugin

Before refreshing, check the current plugin's file hashes and keep a local backup. Copy the package with the install script, refresh it with the agent's supported plugin command, then check tool discovery, the guides and the existing library binding in a fresh process. Keep machine-local configuration out of Git.

A plugin backup does not roll back the engine it points at. A rollback has to line up the engine's Git revision, its rebuilt output and the plugin version. Keep library and ledger backups together, and check that the target engine can read any jobs or records created since the backup. Engine 1.2.0 reads earlier jobs and records; an older engine rejects records that carry quote citations.

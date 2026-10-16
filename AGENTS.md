# Working on Know Fu

Start with `docs/NORTH_STAR.md` before you change architecture, ingestion, retrieval or evaluation. It holds what the product is for and every decision the owner has made. `docs/ROADMAP.md` has the task list and the failure modes worth watching. For what the system does today, trust the schemas in `contracts/schemas/` and the code in `src/`; for what has actually been shown to work, trust `docs/VALIDATION.md`. An approved plan is not evidence that it works.

## Installing

For installation requests, follow `plugin/docs/setup-ai.md` phase by phase. Ask the choices with your question tool before initializing anything, keep choices the owner already made, and be clear about which alternatives are configurable but untested.

## Changing the engine

The contracts in `contracts/schemas/` are the authority, and `src/` validates against them. Full explanatory prose and source provenance matter as much as the links. The wiki and search index are views of the canonical records, never separate authorities, and links are read from the records themselves. Research memory and operational memory stay separate until the owner decides otherwise.

`kb_recall` is the routine way to answer. Its rules (scope filtering, withdrawal and reliance blocking, pinned releases, caveats packed with what they qualify) have to hold on every read path, including `kb_brief`, `kb_connect` and anything you add. The older packet and progressive routes stay for comparison; don't delete them without a decision.

Before migration or PDF-intake work, read the extraction policy and repair evidence in `docs/VALIDATION.md`. Keep the audit regression tests passing when you change publication, lifecycle, scope or retrieval. Engine tests don't prove source fidelity or answer quality, so check those separately before relying on a live migration.

After edits, run the relevant tests, `npm run build` when TypeScript changes, `npm run format:check`, and `npm run check:package` when contracts, docs or configuration change. Use isolated fixtures for anything destructive. Existing research must never be migrated, purged or reclassified as a side effect of other work.

## Recording changes

A change to anything under `plugin/` also bumps the version in `package.json` and both plugin manifests, then reruns `node scripts/package-plugin.mjs`; `npm run check:package` refuses the same version with different plugin files. Every finished change to behavior, schemas, setup or dependencies gets a dated `CHANGELOG.md` entry and a matching doc update, or an explicit "Documentation impact: none" with the reason. Reusable findings go in `LESSONS.md`, which is a set of lessons, not a second diary. Docs and tool text call each thing by its name in `contracts/schemas/`, never a synonym: a `domain` is never a "topic". Two words for one thing taught the owner and the agents two things (17 October 2026). `docs/MAINTENANCE.md` maps code areas to the docs they affect. Run `npm run check:release -- --staged` before committing; it checks the staged files for private paths, common credential patterns and broken links, and makes sure the change log came along.

## Branches

`main` is the official version, and `staging` is where work lands first. Commit and push to `staging` unless the owner says to push to `main`. The owner reads the change on GitHub, then merges `staging` into `main` with a pull request when it's ready. When the owner says to push to `main`, push `staging` too, so the two stay level. Git keeps every earlier version as a commit, so going back never depends on `staging` lagging behind. Merge with a merge commit, not a squash: a squash gives `main` copies of the commits under new names, and the next pull request shows the old work again.

Before starting work, bring `staging` up to date with `main` (`git fetch`, then `git merge --ff-only origin/main` on `staging`), so a pull request only ever shows new work. When two sessions work at the same time, each takes its own short-lived branch off `staging` and merges back into `staging` when done, so neither overwrites the other.

## What never goes in the repository

The library, credentials, the machine-local `plugin/.mcp.json`, runtime and model caches, private acceptance outputs, benchmark copies of real libraries, and conversation exports. The root `.gitignore` only lets release-owned areas through; keep local benchmark material in the ignored `.bench/` folder. Look at the actual staged paths and contents before pushing. The repository has been public since 30 September 2026. That covers the reusable code, not private research, transcripts or writing samples. Since 7 October 2026 the code is under the MIT licence in `LICENSE`; third-party assets such as the README animation keep their own terms.

## Influences aren't dependencies

Memory Graph, ste-bah's fork of it, Hindsight and Archon are design influences, not bundled code. Before copying any of their code, record its provenance, license, purpose and tests in `plugin/docs/lineage.md` and the change log.

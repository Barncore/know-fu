# Working on Know Fu

Read `docs/NORTH_STAR.md` before changing architecture, ingestion, retrieval or evaluation. It holds the product intent and the owner's decisions. `docs/ROADMAP.md` holds the current task list, open decisions and failure modes to watch. The schemas in `contracts/schemas/` and the code in `src/` say what the system does today, and `docs/VALIDATION.md` says what has actually been demonstrated. Approval of a plan is not evidence that it works.

## Writing docs

On 5 October 2026 the owner chose a plainer documentation style over the earlier one. Write so a tired reader understands on the first pass: short sentences, the real names of files, tools and fields, concrete numbers, and a stated view where a choice was made. Accuracy comes first. If you cannot confirm a fact, leave the existing wording rather than guess. Do not apply the owner's personal writing voice to repository docs, and keep the owner's name and personal details out of them.

## Installing

For installation requests, start with `plugin/docs/setup-ai.md`. Offer the options, ask where the library and state should live before initializing anything, keep choices the owner already made, and say clearly which alternatives are configurable but untested.

## Changing the engine

The contracts in `contracts/schemas/` are the authority; `src/` validates against them. Full explanatory prose and source provenance matter as much as links. The wiki, graph and search index are projections of the canonical records, never separate authorities. Keep research memory and operational memory separate until the owner decides otherwise.

`kb_recall` is the routine answer route. Its rules (scope filtering, withdrawal and reliance blocking, pinned releases, caveats packed with what they qualify) must hold on every read path, including `kb_brief`, `kb_connect` and anything new. The older packet and progressive routes stay for comparison; do not delete them without a decision.

Before migration or PDF-intake work, read the extraction policy and repair evidence in `docs/VALIDATION.md`. Keep the audit regression tests passing when changing publication, lifecycle, scope or retrieval. Engine tests do not establish source fidelity or answer quality; check those separately before relying on a live migration.

After edits, run the relevant tests, `npm run build` when TypeScript changes, `npm run format:check`, and `npm run check:package` when contracts, docs or configuration change. Use isolated fixtures for anything destructive. Existing research must never be migrated, purged or reclassified as a side effect.

## Recording changes

Every completed change to behavior, schemas, setup or dependencies needs a dated `CHANGELOG.md` entry and a matching doc update, or an explicit "Documentation impact: none" reason. Put reusable findings in `LESSONS.md`, not a second chronological log. `docs/MAINTENANCE.md` maps code areas to the docs they affect. Run `npm run check:release -- --staged` before committing; it checks the staged files, private paths, common credential patterns, links, and that the change log came along.

## What never goes in the repository

The library, credentials, the machine-local `plugin/.mcp.json`, runtime and model caches, private acceptance outputs, benchmark copies of real libraries, and conversation exports. The root `.gitignore` allows only release-owned areas; keep local benchmark material in the ignored `.bench/` folder. Review the actual staged paths and contents before pushing. The repository has been public since 30 September 2026; that covers the reusable code, not private research, transcripts or writing samples, and it does not grant an open-source license.

## Influences are not dependencies

Memory Graph, ste-bah's fork of it, Hindsight and Archon are design influences, not bundled code. Copying any of their code needs its provenance, license, purpose and tests recorded in `plugin/docs/lineage.md` and the change log first.

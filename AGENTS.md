# Working on Know Fu

Before material architecture, ingestion, retrieval or evaluation work, read `docs/NORTH_STAR.md`. It preserves product intent and established decisions. The owner approved its implementation and GitHub publication on 2026-10-04. `docs/IMPLEMENTATION.md` tracks that build; approval is not evidence of installed behavior. Current schemas/runtime and `docs/VALIDATION.md` remain the references for implementation and demonstrated capability. For the current task list and the decisions waiting on the owner, read `docs/ROADMAP.md`.

Preserve the established README and documentation style. The owner reviewed a writing-style replacement on 2026-10-01 and preferred the original. Do not automatically apply the owner's personal writing voice to repository documentation. Write clearly, keep technical claims within the evidence, and leave replacement drafts separate until explicitly chosen.

For installation requests, start with `plugin/docs/setup-ai.md`. Offer choices and ask for storage locations before initializing data. Preserve already accepted choices; distinguish configurable interfaces from unimplemented adapters and deployment-unverified alternatives.

For implementation work, the canonical contract is `contracts/schemas/`, with runtime validation in `src/`. Full explanatory Markdown and source provenance matter as much as graph connectivity. Graph/search/wiki are projections, not separate authorities. Keep research and operational memory separate until explicitly authorized.

Before migration or PDF-intake work, read the current repair evidence and approved extraction policy in `docs/VALIDATION.md`. Preserve the audit regressions when changing publication, lifecycle, scope or retrieval. Isolated engine checks do not establish full-source fidelity or application quality; verify those separately before relying on a live migration.

Every completed behavior, schema, setup or dependency change needs a dated entry in `CHANGELOG.md` and a matching documentation update (or an explicit no-doc-impact rationale). Add a reusable finding to `LESSONS.md` when a change reveals one; avoid turning that file into a second chronological log. `docs/MAINTENANCE.md` maps changes to the appropriate docs. Run `npm run check:release -- --staged` before committing; it checks the staged file set and change-log/documentation accompaniment.

Never commit the corpus, credentials, machine-local MCP configuration, runtime/model caches, private acceptance outputs or conversation exports. The root `.gitignore` intentionally allows only release-owned areas. Review the actual staged paths and contents before pushing. The owner made this repository public on 2026-09-30. That permission covers the reusable project, not private research, transcripts or writing samples. Public visibility does not grant an open-source license.

After edits, run relevant tests plus `npm run build` when TypeScript changes, and `npm run check:package` when contracts/docs/configuration change. Use isolated fixtures for destructive/lifecycle checks. Existing research must not be migrated, purged or reclassified as a side effect of packaging.

The Memory Graph application and ste-bah fork are design influences, not bundled code dependencies. Do not add a fork or copy its implementation without recording provenance, license, purpose and validation in the lineage doc and change log.

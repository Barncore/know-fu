# Working on Know Fu

For installation requests, start with `plugin/docs/setup-ai.md`. Offer choices and ask for storage locations before initializing data. Preserve already accepted choices; distinguish configurable interfaces from unimplemented adapters and deployment-unverified alternatives.

For implementation work, the canonical contract is `contracts/schemas/`, with runtime validation in `src/`. Full explanatory Markdown and source provenance matter as much as graph connectivity. Graph/search/wiki are projections, not separate authorities. Keep research and operational memory separate until explicitly authorized.

Every completed behavior, schema, setup or dependency change needs a dated entry in `CHANGELOG.md` and a matching documentation update (or an explicit no-doc-impact rationale). Add a reusable finding to `LESSONS.md` when a change reveals one; avoid turning that file into a second chronological log. `docs/MAINTENANCE.md` maps changes to the appropriate docs. Run `npm run check:release -- --staged` before committing; it checks the staged file set and change-log/documentation accompaniment.

Never commit the corpus, credentials, machine-local MCP configuration, runtime/model caches, private acceptance outputs or conversation exports. The root `.gitignore` intentionally allows only release-owned areas. Review the actual staged paths and contents before pushing. Keep the repository private unless the owner explicitly changes that instruction.

After edits, run relevant tests plus `npm run build` when TypeScript changes, and `npm run check:package` when contracts/docs/configuration change. Use isolated fixtures for destructive/lifecycle checks. Existing research must not be migrated, purged or reclassified as a side effect of packaging.

The Memory Graph application and ste-bah fork are design influences, not bundled code dependencies. Do not add a fork or copy its implementation without recording provenance, license, purpose and validation in the lineage doc and change log.

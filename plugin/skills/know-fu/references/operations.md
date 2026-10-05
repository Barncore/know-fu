# Operations

Start with the bundled [package README](../../../README.md), the [architecture and layout](../../../docs/architecture.md) and the [setup guide](../../../docs/setup.md). `kb_status` reports the engine and library locations, which are separate. The README at that engine path holds the deployment evidence and known limits. Local installation paths are configuration, not something the skill depends on.

## Health, views and the graph

Check health with `kb_status`, `kb_maintain {action:"reindex"}` and `kb_maintain {action:"verify"}`. Canonical files stay the authority when a view is unavailable, so never rewrite them to make an index look healthy. Reindexing also removes the view folders of older releases, except any folder holding a wiki edit that hasn't been imported yet.

`kb_recall`, `kb_brief` and `kb_connect` read the published release directly. They keep working while FalkorDB or QMD is down; recall then reports that semantic search was unavailable and suggests rewording or reindexing if keywords also matched poorly.

Use regular FalkorDB through the configured managed-WSL or external-server deployment. There is no silent fallback to a SQLite graph or FalkorDBLite. To start, check or restart the graph, run the engine's `scripts/graph-service.ps1 -Action start|status|restart`. The setup guide separates tested deployments from configurable alternatives.

## Scope and authority

Whole-library `verify`, `export` and `formats` need unrestricted read access to every module. `restore` also needs write authority over the whole library. A scoped caller gets `SCOPE_DENIED`, because these commands never produce partial backups. Exact reads expose only the ancestry of published releases. Ordinary edits keep archive, withdrawal and supersession state as it was. Lifecycle execution and purge resumption check the caller's current permissions again.

## Configuring modules and bindings

`kb_maintain {action:"configure"}` takes `module {module_id, title, description}`, `domains [{domain_id, title}]`, an optional `binding {project_id, read_modules, write_modules}`, optional `dimensions {name: {type, unit}}`, and the real task `authorization`. The owning project must be able to write every module. Bind a new Codex project only when the user asks; integration with other agents is deferred. A condition dimension's meaning never changes, so use a new name when its unit or meaning changes.

## Archive, withdrawal and purge

Archive and unarchive change navigation. Withdrawal blocks reliance. Reinstatement needs a current assessment.

Plan with `kb_lifecycle {mode:"plan", action, targets, reason}`, using exact targets. Inspect the dependents it reports. Then execute the returned `plan_id` with the user's real authorization `{action, targets, user_instruction}`.

Purge needs explicit deletion authorization. It removes the previewed content and its derivatives, including affected managed backups. It can't erase external backups or copies held by a provider. If it fails partway, access to the affected content stays blocked; fix the cause and retry the same plan.

The independent deletion ledger lives under the configured state folder's `ledgers/` (`KB_STATE_DIR`; the legacy default is the engine's `.runtime/ledgers`). Back it up separately. A missing or stale ledger blocks a restored service.

## Changing meaning: supersession and concept merges

Plan with `kb_maintain {action:"plan_meaning", kind:"supersede"|"merge_concepts", target, replacement, reason}`, then run `execute_meaning` with `plan_id`, `plan_hash` and `authorization`. Original sources and each author's account always remain. Supersession is for interpretations where replacement is justified. Reassess the affected dependents instead of silently rewriting what they mean.

## Export, restore and import

`export` writes a portable full bundle inside the library. `restore` takes `bundle_path` and `target`, and needs the matching independent deletion ledger. `import` takes `bundle_path`, `module` and `domains` for a foreign library the user explicitly chose. Imports keep each original revision's exact identity in an origin map, and historical revisions become archived records instead of collapsing into the latest one. Existing research folders are never migrated automatically.

## Formats, wiki edits and bulk work

`formats` writes JSONL, a citation CSV and Mermaid. Edits to the generated wiki are detected: `wiki_edit` with `record_ref` returns the proposed prose for review and normal publication. `preview_bulk` and `execute_bulk` stage an exact reviewed proposal. Never bulk-accept doubtful meaning just to clear a queue.

## Evaluations

An evaluation freezes its cases, model, release, scope, conditions and budget settings before it runs. Version 3 also freezes the executable implementation and supports interactive reading. Any change needs a new run. Grading must match the structured contract that applies; a malformed response leaves the run incomplete, with the raw responses and immutable attempts kept. A completed attempt is reused only when its receipts match. Version 2 keeps the fixed-packet comparison, and older legacy reports stay readable by their authorized owner.

`kb_evaluate {action:"prepare"}` takes source-grounded `cases`, a `model`, and optional `conditions` and `options`. Each case has `case_id`, `prompt`, `query`, `rubric`, `source_refs`, `source_grounding` and `held_out`, and optionally `purpose`. `run` and `report` take `run_id`.

The fixed conditions are `no_kb`, `source_passages`, `full_kb` and `prose_and_passages`. The interactive conditions are `progressive_graph` and `progressive_prose`, and both keep the material-context checks. `options.repetitions` measures variability; repeats of one case are not independent questions.

Version 3 options include `budget: {tool_calls, rendered_characters, input_tokens}`. Tool calls, delivered evidence and wall time are capped. Actual cumulative model input, including repeated context, is measured after completion, so `input_tokens` is a ceiling for comparison, not a hard stop before the call. Report budgets that were exceeded or couldn't be measured. Keep the separate grades for correctness, completeness, decisive conditions, citation support, teaching, synthesis, inference and gap recognition. Inspect decisive failures instead of averaging them away.

Fresh evaluation sessions have native file and network access denied. Interactive conditions get only a read-only MCP reader with a fixed scope and a pinned release. They can't read guides, unpublished units, hidden rubrics or other conditions. An isolation probe must match the current policy and code fingerprint before a version 3 run. These sessions measure the constrained text-reading path; inspecting ordinary source images is a separate acceptance check.

Evaluation sends selected evidence to the configured Codex service under its normal sign-in. Establish authorization for that material and that destination first. Never infer permission to send private data from a build request, and never copy authentication files. Extra original passages (`grading_refs`) or public extracts (`grading_evidence`) need `options.grading_data_authorization`, which binds the destination, the actual basis for authorization, a statement, the source references and the exact extract hashes. That is an explicit boundary per run, not automatic access to every source. Raw usage, trajectories and outcomes stay private, outside the research views. Cases exposed for repair become regressions; never relabel them as held out.

## Paid transcription

Configure it under `transcription.models[]` with `id`, an HTTPS `endpoint`, `model`, `key_env`, `estimated_cost_per_minute`, `currency`, and optionally `response_format`, `timestamp_granularities` and `prompt`. See the engine's `config/transcription.example.json` and the [video guide](video.md). `media_plan` makes no API requests.

All media and decoders share durable job reservations. The allowance can't guarantee the provider's final bill, and dollars are never inferred from subscription tokens. A paid request with an unknown outcome must be reconciled before resubmitting. Cancel and resume keep coverage and provider receipts; never start a duplicate job to get around an unresolved charge.

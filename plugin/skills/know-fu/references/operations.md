# Operations

Start with the bundled [package README](../../../README.md), the [architecture and layout](../../../docs/architecture.md) and the [setup guide](../../../docs/setup.md). `kb_status` tells you where the engine and the library are; they're separate places. The README at that engine path holds the deployment evidence and known limits. Local installation paths are configuration, not something this skill depends on.

## Health, views and the graph

To check health, use `kb_status`, `kb_maintain {action:"reindex"}` and `kb_maintain {action:"verify"}`. When a view is unavailable, the canonical files are still the authority, so never rewrite them to make an index look healthy. Reindexing also clears out the view folders of older releases, except any folder holding a wiki edit that hasn't been imported yet.

`kb_recall`, `kb_brief` and `kb_connect` read the published release directly, so they keep working while FalkorDB or QMD is down. If QMD is down, recall says semantic search was unavailable, and suggests rewording or reindexing if keywords also matched poorly.

Use regular FalkorDB through the configured managed-WSL or external-server deployment. There's no silent fallback to a SQLite graph or FalkorDBLite. To start, check or restart the graph, run the engine's `scripts/graph-service.ps1 -Action start|status|restart`. The setup guide says which deployments are tested and which are just configurable.

## Scope and authority

Whole-library `verify`, `export` and `formats` need unrestricted read access to every module, and `restore` also needs write authority over the whole library. A scoped caller gets `SCOPE_DENIED`, because these commands never produce partial backups. Exact reads only expose the ancestry of published releases. Ordinary edits leave archive, withdrawal and supersession state alone. Lifecycle execution and purge resumption check the caller's current permissions again, rather than trusting what was true when the plan was made.

## Configuring modules and bindings

`kb_maintain {action:"configure"}` takes `module {module_id, title, description}`, `domains [{domain_id, title}]`, an optional `binding {project_id, read_modules, write_modules}`, optional `dimensions {name: {type, unit}}`, and the real task `authorization`. The owning project has to be able to write every module. Only bind a new Codex project when the user asks; integration with other agents is deferred. A condition dimension's meaning never changes, so when its unit or meaning changes, give it a new name.

## Archive, withdrawal and purge

These three do different jobs. Archive and unarchive change navigation. Withdrawal blocks anything from relying on a record. Reinstatement needs a current assessment.

Plan first with `kb_lifecycle {mode:"plan", action, targets, reason}`, using exact targets. Look at the dependents it reports. Then execute the returned `plan_id` with the user's real authorization `{action, targets, user_instruction}`.

Purge needs explicit deletion authorization. It removes the previewed content and its derivatives, including affected managed backups. The plan's `affected_refs` lists accounts removed as a whole; `affected_history` lists earlier revisions removed one by one because they rest on the purged material while the account's current revision doesn't. Show both to the user before executing. It can't reach external backups or copies held by a provider. If it fails partway, access to the affected content stays blocked; fix the cause and retry the same plan.

The independent deletion ledger lives under the configured state folder's `ledgers/` (`KB_STATE_DIR`; the legacy default is the engine's `.runtime/ledgers`). Back it up separately. A missing or stale ledger blocks a restored service, which is deliberate: it stops a restore from resurrecting purged material.

## Changing meaning: supersession and concept merges

Plan with `kb_maintain {action:"plan_meaning", kind:"supersede"|"merge_concepts", target, replacement, reason}`, then run `execute_meaning` with `plan_id`, `plan_hash` and `authorization`. Original sources and each author's account always remain. Supersession is for interpretations where replacement is genuinely justified. Reassess the affected dependents rather than quietly rewriting what they mean.

## Export, restore and import

`export` writes a portable full bundle inside the library. `restore` takes `bundle_path` and `target`, and needs the matching independent deletion ledger. `import` takes `bundle_path`, `module` and `domains` for a foreign library the user explicitly chose. Imports keep each original revision's exact identity in an origin map, and historical revisions come in as archived records instead of collapsing into the latest one. Existing research folders are never migrated automatically.

## Formats, wiki edits and bulk work

`formats` writes JSONL, a citation CSV and Mermaid. Edits to the generated wiki get detected: `wiki_edit` with `record_ref` returns the proposed prose for review and normal publication. If the edit was made before a later publication, it comes from the older view that kept it (or pass `view_release`), with `edited_against` naming the revision it was written for; merge it into the current prose by hand if the record has changed since. `preview_bulk` and `execute_bulk` stage an exact reviewed proposal. Never bulk-accept doubtful meaning just to clear a queue.

## Evaluations

An evaluation freezes its cases, model, release, scope, conditions and budget settings before it runs, and version 3 also freezes the executable implementation and supports interactive reading. Change any of that and you need a new run. Grading has to match the structured contract that applies; a malformed response leaves the run incomplete, with the raw responses and immutable attempts kept. A completed attempt is only reused when its receipts match. Version 2 keeps the fixed-packet comparison, and older legacy reports stay readable by their authorized owner.

`kb_evaluate {action:"prepare"}` takes source-grounded `cases`, a `model`, and optional `conditions` and `options`. Each case has `case_id`, `prompt`, `query`, `rubric`, `source_refs`, `source_grounding` and `held_out`, and optionally `purpose`. `run` and `report` take `run_id`.

The fixed conditions are `no_kb`, `source_passages`, `full_kb` and `prose_and_passages`. The interactive ones are `progressive_graph` and `progressive_prose`, and both keep the material-context checks. `options.repetitions` measures variability, but repeats of one case aren't independent questions.

Version 3 options include `budget: {tool_calls, rendered_characters, input_tokens}`. Tool calls, delivered evidence and wall time are capped while the run happens. Actual cumulative model input, repeated context included, is measured afterwards, so `input_tokens` is a ceiling for comparison, not a hard stop before each call. Report budgets that were exceeded or couldn't be measured. Keep the separate grades for correctness, completeness, decisive conditions, citation support, teaching, synthesis, inference and gap recognition, and look at decisive failures instead of averaging them away.

Fresh evaluation sessions have native file and network access denied. Interactive conditions get only a read-only MCP reader with a fixed scope and a pinned release. They can't read guides, unpublished units, hidden rubrics or other conditions. Before a version 3 run, an isolation probe has to match the current policy and code fingerprint. These sessions measure the constrained text-reading path; inspecting ordinary source images is a separate acceptance check.

Evaluation sends selected evidence to the configured Codex service under its normal sign-in. So establish authorization for that material and that destination first. Never infer permission to send private data from a build request, and never copy authentication files. Extra original passages (`grading_refs`) or public extracts (`grading_evidence`) need `options.grading_data_authorization`, which binds the destination, the actual basis for authorization, a statement, the source references and the exact extract hashes. That's an explicit boundary per run, not blanket access to every source. Raw usage, trajectories and outcomes stay private, outside the research views. Cases that were exposed for repair become regressions; never relabel them as held out.

## Paid transcription

Configure it under `transcription.models[]` with `id`, an HTTPS `endpoint`, `model`, `key_env`, `estimated_cost_per_minute`, `currency`, and optionally `response_format`, `timestamp_granularities` and `prompt`. The engine's `config/transcription.example.json` and the [video guide](video.md) have examples. `media_plan` never makes API requests.

All media and decoders share durable job reservations. The allowance can't guarantee the provider's final bill, and dollars are never inferred from subscription tokens. A paid request with an unknown outcome has to be reconciled before anything is resubmitted. Cancel and resume keep coverage and provider receipts, so never start a duplicate job to get around an unresolved charge.

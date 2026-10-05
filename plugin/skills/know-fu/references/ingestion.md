# Ingesting a source

The goal is that after this ingest a fresh session can explain, teach and apply the source better than before, and that earlier understanding the source changes has been revised. A pile of claims, or one record per page, does not meet that goal. The engine stores, validates, links and versions; you read and understand.

All MCP calls wrap their input in `request`. The CLI fallback is `node <engine>/dist/cli.js COMMAND --input REQUEST.json`; `kb_status` reports the engine and library paths.

## The job

A job moves through fixed stages: convert, reconstruct, integrate, discover, reweave, compile, check, publish. `kb_job {action:"next", job_id}` always tells you the stage, what to do now and what is still pending. Partial receipts save progress, so long sources can span sessions. Each stage advances when its receipt is complete.

1. **Register.** `kb_ingest {paths, module, domains, idempotency_key, authorization}`. The authorization quotes or accurately summarizes the user's request. Register a new module or domain first with `kb_maintain {action:"configure"}` when the task authorizes one. Keep the returned job id.
2. **Convert.** `kb_job {action:"convert", job_id}`. PDFs take `pdf_profile` `technical` (default), `prose` or `ocr`; [books.md](books.md) says which. Media needs the paid preflight in [video.md](video.md) first. Conversion is not reading.
3. **Reconstruct.** Read every unit with `kb_read {kind:"unit", job_id, unit_id}`, following `next_offset`. Look at page images, figures and frames when they matter. Rebuild the author's argument section by section, then for the whole source: the problem, why the method should work, its premises, examples, boundary conditions and what is left to judgment. Submit read receipts as you go: `kb_job {action:"submit", job_id, receipt:{step_id, stage:"reconstruct", summary, coverage:[{unit_id, status:"complete"}]}}`. Use `status:"excluded"` with a reason for covers, blanks, indexes and duplicate representations. When every remaining unit really has been read, `coverage_all:{status:"complete"}` stands for the full list.
4. **Integrate.** Before writing, ask the library what it already holds: `kb_recall` with `purpose:"compare"` on the source's main topics. Then write the source's knowledge as notes with `kb_write` ([notes.md](notes.md)): its mechanisms and procedures as knowledge, its terms as concepts, typed links to existing accounts, a judgment where it disagrees with one, and questions it raises but cannot settle. Keep the author's account in the author's terms; synthesis across sources gets its own note marked `synthesis`. Assess evidence on the claims a decision could rest on, and fidelity where you checked the original page, each with a one-line reason ([notes.md](notes.md)). Submit the integrate receipt with coverage when done.
5. **Discover.** Look for what this source makes possible: a mechanism that transfers to another problem, a combination with existing knowledge, the next question worth asking. Record warranted ones as notes (hypotheses are `epistemic: hypothesis` with the test that could kill them). Finding none is a valid result. The receipt needs `stopping_reason` and `unfinished:[]`.
6. **Reweave.** `kb_job next` lists the existing accounts your new knowledge affects. For each, read it and decide: revise it with a note that `revises` it and changes what is wrong or missing; reaffirm it with a one-line note (`revises` plus `reaffirm: why it still holds`); or leave it pending with a reason. Revise the reasoning, not just the links. Submit `resolutions:[{record_ref, decision:"revised"|"reaffirmed"|"pending", rationale}]`.
7. **Compile.** Bring the teaching layer up to date. The domain primer must describe the domain as it now stands: `kb_brief` flags a stale primer. Add or revise lessons, worked examples and near misses where this source changed how the topic should be taught. Submit a compile receipt.
8. **Check.** Test the understanding, not the structure. Answer two or three application questions the source should now make answerable, including a tempting wrong transfer, using only the notes you staged. Fix what fails. Where a check applies a note to a concrete case, record its applicability with that case as `context`. Submit `capability:"checked"|"unresolved_failures"|"not_assessed"` with `understanding_change:{added:[], revised_refs:[], unresolved:[], checks:[]}`. If nothing new was added, set `no_new_supported_understanding` with the reason. Mark coverage checked (`coverage_all` is fine).
9. **Publish.** `kb_job {action:"publish", job_id}`, then `kb_maintain {action:"reindex"}` and `{action:"verify"}`. Recall works from canonical records the moment publication commits; reindex refreshes the wiki, graph and semantic search views.

On `REVISION_CONFLICT`, another publication landed first: `kb_job {action:"rebase"}`, then redo the reweave and checks it reopens. Never overwrite the winning release.

## What to report

Finish with what the library can now explain or do that it could not before, which earlier accounts changed and why, the disagreements and gaps that remain, the checks you actually ran, and the release id. Do not claim that ingestion retrained the model or established mastery.

## Rules that keep the library honest

- The original never changes. A correction to the source's meaning is a new revision with a reason.
- Every note cites the units or records it rests on. An ungrounded note is rejected.
- Quotes in `cites` must be the source's exact words; the engine checks them against the text.
- Fidelity, evidence and applicability are separate. A faithful account of a weak claim stays a faithful account, with an assessment that says it is weak. Assess only what you checked, and give every level its reason.
- No quotas. Write what the source warrants: a short paper may need eight notes, a dense book chapter forty.
- Exposed evaluation cases stay out of the ingestion context.

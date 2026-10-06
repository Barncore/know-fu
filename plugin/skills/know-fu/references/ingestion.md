# Ingesting a source

Here's what success looks like: after this ingest, a fresh session can explain, teach and apply the source better than before, and any earlier understanding the source changes has been revised. A pile of claims doesn't get you there, and neither does one record per page. Think of the split this way: the engine stores, validates, links and versions; you read and understand.

All MCP calls wrap their input in `request`. If MCP isn't available, the CLI fallback is `node <engine>/dist/cli.js COMMAND --input REQUEST.json`, and `kb_status` tells you the engine and library paths.

## The job

A job moves through fixed stages: convert, reconstruct, integrate, discover, reweave, compile, check, publish. Whenever you're unsure where you are, `kb_job {action:"next", job_id}` tells you the stage, what to do now and what's still pending. Partial receipts save progress, so a long source can span several sessions. Each stage moves on when its receipt is complete.

1. Register. `kb_ingest {paths, module, domains, idempotency_key, authorization}`. The authorization quotes, or accurately summarizes, the user's request. If the task authorizes a new module or domain, register it first with `kb_maintain {action:"configure"}`. Keep the job id you get back.
2. Convert. `kb_job {action:"convert", job_id}`. PDFs take `pdf_profile` `technical` (the default), `prose` or `ocr`, and [books.md](books.md) says which to pick. Media needs the paid preflight in [video.md](video.md) first. And remember: conversion is not reading.
3. Reconstruct. Read every unit with `kb_read {kind:"unit", job_id, unit_id}`, following `next_offset`, and look at page images, figures and frames when they matter. Rebuild the author's argument section by section, then for the whole source: the problem, why the method should work, its premises, examples, boundary conditions and what's left to judgment. Submit read receipts as you go: `kb_job {action:"submit", job_id, receipt:{step_id, stage:"reconstruct", summary, coverage:[{unit_id, status:"complete"}]}}`. Use `status:"excluded"` with a reason for covers, blanks, indexes and duplicate representations. Once every remaining unit really has been read, `coverage_all:{status:"complete"}` stands in for the full list.
4. Integrate. Before writing anything, ask the library what it already holds: `kb_recall` with `purpose:"compare"` on the source's main topics. Then write the source's knowledge as notes with `kb_write` ([notes.md](notes.md)): its mechanisms and procedures as knowledge, its terms as concepts, typed links to existing accounts, a judgment where it disagrees with one, and questions it raises but can't settle. Keep the author's account in the author's terms; synthesis across sources gets its own note marked `synthesis`. Every new `mechanism` or `procedure` note also says what it does, as `facets` with a purpose and a mechanism in the source's words and in domain-free words; that's what lets a later invent session find it from another field. Assess evidence on the claims a decision could rest on, and fidelity where you checked the original page, each with a one-line reason ([notes.md](notes.md)). Submit the integrate receipt with coverage when you're done.
5. Discover. Look for what this source makes possible: a mechanism that transfers to another problem, a combination with existing knowledge, the next question worth asking. Record the warranted ones as notes; a hypothesis gets `epistemic: hypothesis` plus the test that could kill it. Finding nothing is a valid result. The receipt needs `stopping_reason` and `unfinished:[]`.
6. Reweave. This is the stage that makes knowledge compound, so don't rush it. `kb_job next` lists the existing accounts your new knowledge affects. Read each one and decide: revise it with a note that `revises` it and fixes what's wrong or missing; reaffirm it with a one-line note (`revises` plus `reaffirm: why it still holds`); or leave it pending with a reason. Revise the reasoning, not just the links. Submit `resolutions:[{record_ref, decision:"revised"|"reaffirmed"|"pending", rationale}]`.
7. Compile. Bring the teaching layer up to date. The domain primer has to describe the domain as it stands now, and `kb_brief` will flag it if it's stale. Add or revise lessons, worked examples and near misses wherever this source changed how the topic should be taught. Submit a compile receipt.
8. Check. Test the understanding, not the structure. Using only the notes you staged, answer two or three application questions the source should now make answerable, including one tempting wrong transfer. Fix whatever fails. Where a check applies a note to a concrete case, record its applicability with that case as `context`. Submit `capability:"checked"|"unresolved_failures"|"not_assessed"` with `understanding_change:{added:[], revised_refs:[], unresolved:[], checks:[]}`. If nothing new was added, set `no_new_supported_understanding` with the reason. Mark coverage checked (`coverage_all` is fine).
9. Publish. `kb_job {action:"publish", job_id}`, then `kb_maintain {action:"reindex"}` and `{action:"verify"}`. Recall works from the canonical records the moment publication commits; reindexing refreshes the wiki, graph and semantic search views.

If you hit `REVISION_CONFLICT`, another publication got there first. Run `kb_job {action:"rebase"}`, then redo the reweave and checks it reopens. Never overwrite the winning release.

The check receipt is tied to exactly what was staged when you submitted it. If you write more notes after the check, the job goes back to the check stage; check the new material and submit a fresh check receipt with a new `step_id`. Publishing with a stale check fails with `CHECK_STALE`.

## What to report

Finish by telling the user what the library can now explain or do that it couldn't before, which earlier accounts changed and why, the disagreements and gaps that remain, the checks you actually ran, and the release id. Don't claim that ingestion retrained the model or established mastery.

## Rules that keep the library honest

- The original never changes. A correction to the source's meaning is a new revision with a reason.
- Every note cites the units or records it rests on. An ungrounded note gets rejected.
- Quotes in `cites` must be the source's exact words; the engine checks them against the text.
- Fidelity, evidence and applicability are separate questions. A faithful account of a weak claim stays a faithful account, with an assessment that says it's weak. Assess only what you checked, and give every level its reason.
- No quotas. Write what the source warrants: a short paper might need eight notes, a dense book chapter forty.
- Exposed evaluation cases stay out of the ingestion context.

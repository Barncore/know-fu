# Change log

Changes after this baseline belong here with their reason, affected behavior/docs, validation and migration implications. Git records exact file history; this file explains why it changed.

## Unreleased

### 2026-10-07 - Honest ingestion, a Claude Code adapter and the MIT licence

Why: before the first real ingest, the owner approved the guards from the roadmap's decision list (D3-D6, D9, D12, D13). The engine took an agent's word that it had read every page, stamped every record as written by Codex, and counted every source as its own independent family. And Know Fu only installed into Codex.

- Read receipts (D3): new jobs carry `read_receipts: true`. `kb_read` logs every unit it serves to `jobs/<job>/reads.jsonl`, and a reconstruct receipt that marks a unit complete is refused unless the served ranges cover the whole unit. The refusal names the unread units. The ingestion report gains `reading` (units, excluded, read in full, ratio). Older jobs aren't affected and report `reading: {tracked: false}`.
- Agent provenance (D4): records name the agent from `KB_ACTOR` (`codex`, `claude`, or `unspecified`) instead of a hard-coded `codex`, and jobs wait in `waiting_for_agent`. The job schema still accepts `waiting_for_codex`.
- Evidence families at registration (D5): `kb_ingest` paths can be `{path, evidence_family, independence, derived_from}`. Re-registering a published source under a different family is refused. The ingestion guide explains how to choose, including `owner` for the owner's own material.
- Claude Code adapter (D6): `plugin/.claude-plugin/plugin.json` beside the Codex manifest, sharing the skill, and a root `.claude-plugin/marketplace.json`. Claude Code asks for the library and state folders, media tools and the specialist-tools switch, and passes the session's project folder as `KB_PROJECT`. The corpus schema's `integration` field now accepts `mcp`, `codex` or `claude`, and the example uses `mcp`. `configure-plugin.mjs` writes `KB_ACTOR=codex` and gains `--advanced-tools`. `check:package` checks both manifests.
- Specialist tools (D12): MCP lists `kb_lifecycle`, `kb_evaluate`, `kb_propose`, `kb_change` and `kb_retrieve` only when `KB_ADVANCED_TOOLS` is set, saving about 550 tokens a session. The CLI keeps all of them.
- Licence (D13): MIT, in `LICENSE`, with `package.json` and the Claude Code manifest saying so. Third-party assets keep their own terms.
- Docs: setup, setup-ai and setup-choices cover both agents and recommend one module with domain tags (D9); the plugin README, README, architecture, operations, ingestion guide, maintenance, lineage, VALIDATION, NORTH_STAR and the roadmap are updated. The roadmap records D7 (pilot with both agents in separate libraries) and D11 (flat-wiki control) in task 2, moves D10 to discussion with the owner's sunset idea, and rewrites D8 with corrected facts and a design that keeps the whole book in view.
- Verification: 158 tests (155 passed, 3 Python conversion tests skipped), build, formatting, the package check, and Claude Code's strict plugin validator. Record schema stays 1.1.0; the job and corpus schemas gain values and an optional field. An older engine rejects a job created by this one, so roll engine and plugin forward together. Existing Codex installs should regenerate their launcher to get `KB_ACTOR=codex`; until then their new records say `unspecified`.

### 2026-10-06 - Narrower skill trigger, and cost-benefit notes on every decision

Why: the owner approved D1 and D2 from the roadmap's decision list, and asked for every decision to say what it costs the user against what it gains, so decisions can be weighed that way.

- D2: the skill's description now fires only when the project is bound to a Know Fu library and the task is ingesting into it or answering, teaching, applying, comparing or inventing from it, and says it isn't for general explanations. Before, it matched almost any "explain" or "teach" request.
- D1: deleted the fully merged `claude/know-fu-2` and `claude/know-fu-invention` branches.
- Every entry in the roadmap's "Waiting on the owner" list ends with a cost-benefit line, and the list's introduction says what those lines weigh. Fixed D6c's pointer to the two-agent test (D23).
- No engine, schema or library change.

### 2026-10-06 - Branch workflow, no `analogous_to`, and the decision list

Why: the invention work went to `main`, and the owner asked for one standing branch where work lands first. They also ruled out `analogous_to` after an outside review by Fable 5.1, and asked for a ranked list of what's left to decide before installing.

- AGENTS.md gains a "Branches" section: work lands on `staging`, the owner merges it into `main` with a merge commit (not a squash), and parallel sessions use short-lived branches off `staging`.
- Recorded the `analogous_to` decision in NORTH_STAR, the roadmap, the README and the skill's standing rules. An accepted analogy is an idea with both accounts as premises, or later a `concept` with `exemplifies` links.
- The roadmap gains "Waiting on the owner": 29 decisions (D1-D29) grouped by when they're needed and ranked by how strongly they're recommended, each saying what it is, why it matters and what it implies. Task 1 now depends on the agent chosen in D7, and task 15 points at D6.
- Documentation only. No runtime, schema, dependency or library change.

### 2026-10-06 - Ideas, a real invent preset, gap suggestions and decision points

Why: the owner made invention the top priority and then decided how the library should hold invented ideas. They worried about ideas misguiding the library, so ideas got their own lane with walls the engine enforces. The rest came from the same research round: a real `invent` preset, test results recorded from the owner's own tools, gaps the library can suggest, the guide changes the research supported, and decision points on procedures, which the owner has always wanted from being taught by an expert. Built on the `claude/know-fu-invention` branch.

- New record family `idea`, written only by the new `kb_idea` tool (actions `propose`, `plan`, `result`, `park`, `unpark`, `revise`, `list`, `show`, `export`). An idea holds a statement, its premises (library accounts or passages), a kill test, a pass rule, a status, optional separate originality and feasibility ratings, its parents and its results. Publish refuses any other record that references an idea, and job proposals can't contain one. Recall shows ideas only for `invent`; every other read path, the link map and the search index leave them out. Only an idea with a decisive result can parent another. Status must match the results, apart from `dormant`.
- Results come from the owner's own tools: tool, version, optional data window, outcome, trial count, metrics and a note. A result is judged by a pass rule published in an earlier revision, results are append-only, and a failure says whether the idea or the test was at fault (only the first refutes). Once an idea has results, its statement, kill test, pass rule and premises are fixed. A changed premise marks the idea pending; ingestion never has to reassess ideas, and any later revision moves the premises to their current revisions and names them. `export` writes `exports/ideas/ideas-<timestamp>.json` (`know-fu-ideas-1`).
- `invent` recall now adds a slate: ideas on file (refuted ones with their reason), bridges into other topics by links and by abstract facet wording, and loose ends. Each loaded account shows its abstract purpose and mechanism. Bridges need the new `cross_domain:true`; with `domains` set and `cross_domain` off, invent stays inside those topics. The slate gets room only when it has something to show.
- `kb_brief` lists up to three computed gap suggestions under each topic's recorded questions (an unweighed challenge, an account others build on resting on one source, a mechanism or procedure with no stated limits), and a line counting ideas. `investigate` recall lists the same signals for the accounts it loaded. New module `gaps.ts`.
- Procedure notes accept `decisions` (cue, decision, two to five options, check, cited page, and `stated: false` for choices the source skips), stored as `extensions.decision_points`. `teach` and `apply` recall show them as a tree.
- Schemas: `idea` added to the record family enum and payloads in the record and proposal schemas; `decision_points` added to the extensions in the record, proposal and reading schemas. Record schema stays 1.1.0. An older engine rejects either, so roll engine and plugin forward together.
- Guides: the retrieval guide documents every preset (budget, what it ranks up, what it adds) and a new "Inventing" section with counter-framing, generating past the obvious, separate ratings and kill tests. A new ideas guide covers the lane, testing and export. The notes guide adds decision points. The ingestion guide turns sources' open problems into question notes, records missing foundations when an advanced book arrives first, sends candidate inventions to the report instead of the library, and builds lessons around two compared examples. `kb_read` serves the new `ideas` guide.
- Measured on the frozen three-paper library: every non-invent briefing identical to `main`; invent briefings within the same range with 0.8 fewer accounts on average; 89 tokens per idea shown; 200-225 tokens for a three-point decision tree; tool descriptions +273 tokens per session. See [VALIDATION.md](docs/VALIDATION.md).
- Docs: README, architecture (new Ideas section), lineage (a row per change with its research), NORTH_STAR, roadmap (tasks 20-25 built, task 26 to test whether invent helps, two new risks) and maintenance.
- Verification: 154 tests (151 passed, 3 Python conversion tests skipped on this machine), build, formatting and package check.

### 2026-10-06 - Functional facets restored in kb_write

Why: the owner made invention the top priority. Research on how people and machines invent found that the weak step is finding a useful idea from another field, and that describing what something does (its purpose and mechanism) in domain-free words is what makes that possible. The record schema already had a `functional_facets` field for this, but the 1.2.0 note format dropped the way to write it, so no record in the acceptance library had any.

- `kb_write` notes accept a `facets` block. New `mechanism` and `procedure` notes must give at least one `purpose` and one `mechanism`, each with `text` in the source's terms and an `abstract` wording in domain-free words. `preconditions`, `failure_modes` and `evaluation_method` are optional. The engine checks lengths (30 words for text, 15 for an abstract) and that the abstract doesn't repeat the text. Revisions inherit facets, and a reaffirmation doesn't need them.
- The facet entries gain an optional `abstract` field in the record, proposal and reading schemas. Record schema stays 1.1.0; an older engine rejects a record that carries `abstract`, so roll engine and plugin forward together.
- A revision that only adds or edits facets is no longer treated as a change of meaning: it doesn't reopen dependents, clear pending flags, create reweave targets or make a primer stale. A reaffirmation that changes nothing still counts, as before.
- `kb_brief` notes how many mechanism and procedure accounts in a domain still lack facets.
- The notes guide explains how to write facets, with worked wordings; the ingestion guide points to it; the guide's own complete example now carries facets.
- Measured before release: 247-352 output tokens per procedure record, 14-20% more authored text across the acceptance library, about 720 more guide tokens per ingestion session, and no change at all to `kb_recall` output. See [VALIDATION.md](docs/VALIDATION.md).
- Recorded the owner's 6 October decisions in [NORTH_STAR.md](docs/NORTH_STAR.md) and [ROADMAP.md](docs/ROADMAP.md), and the research this change rests on in [lineage](plugin/docs/lineage.md).
- Verification: 145 tests (142 passed, 3 Python conversion tests skipped on this machine), build, formatting and package check.

### 2026-10-06 - Repairs from an independent implementation audit

Why: an independent review of commit `754329d` found twelve defects, each with a reproduction script, while all 131 existing tests passed. Every finding reproduced on this branch, so all twelve are fixed, and each reproduction is now a regression test that fails on the old code and passes on the new.

- F01, purge: a purge now also deletes earlier revisions that rest on the purged material, even when the account's current revision is independent and survives. The plan lists them in a new optional `affected_history` field, the deletion ledger blocks them by exact revision (`blocked_refs`), and reads, restores and new exports refuse them.
- F02, reliance: whether an account can be relied on is now a fixed-point calculation shared by recall and progressive reading, so a dependency cycle created by a later revision can no longer hide withdrawn support.
- F03 and F07, guards: recall now takes its guards from the same resolver as progressive reading. The premises of what it loads, their conditions, qualifications and current judgments, are packed or listed whatever the rank, graph setting or budget. That includes qualifications published after a pinned release. Premises that only repeat a boundary the loaded accounts already show stay out.
- F04, checking: a check receipt now records a digest of what was staged. Publication refuses if staging changed since (`CHECK_STALE`), and a proposal after the check sends the job back to the check stage.
- F05, impact: retargeting or removing a relationship or judgment now flags the account it used to point at, not just the new one.
- F06, notes: a note that cites or uses another note in the same batch inherits its sources, in any order, so source-restricted recall finds it. The "high from thin support" check counts those inherited families too.
- F08, brief: a primer is called "current" only when it's within its validity dates, has no structured condition and isn't pending reassessment, and its boundary is shown.
- F09, recovery: after an interrupted publication, a corrected revision with the same number now publishes. Leftover files are removed only after proving no committed release includes that revision.
- F10, evaluation: grading refuses an original whose bytes no longer match the source record's hash.
- F11, budget: `budget.used` is now the whole delivered briefing (the packing figure moves to `budget.packed`). Packing costs each account by its rendered block, optional lists are trimmed to fit, and a briefing over budget says so. The packing reserve dropped from 12% to 5%, so briefings land at 89-100% of budget.
- F12, wiki edits: `wiki_edit` finds an edit kept in an older view, or takes `view_release`, and reports which revision the edit was made against.
- Not changed: the `braces` advisory reached through QMD's file-matching dependencies. Know Fu passes only generated paths, and npm's suggested forced QMD downgrade would break the current API. It's tracked in the roadmap.
- Effect on recall size: on the ten frozen cases, briefings now carry roughly 5-10% less material than the ones blind-tested on 5 October, because the earlier figures undercounted. The blind result was not rerun. See [VALIDATION.md](docs/VALIDATION.md).
- Verification: 143 tests (140 passed, 3 Python conversion tests skipped on this machine), build, formatting and package check with 14 schema copies. The lifecycle-plan schema gains an optional field; record schema stays 1.1.0. An older engine ignores `blocked_refs` in the ledger, so reading a revision purged this way gives it a missing-file error instead of a clear "purged" refusal; roll engine and plugin forward together.

### 2026-10-05 - Docs in a conversational voice

Why: the owner read the plain rewrite below and found it a little dull and robotic next to the audit report and the chat explanations it was based on. The docs were rewritten again in that voice: conversational, specific, with a view where a choice was made and a little personality.

- Rewrote the README, AGENTS.md, north star, roadmap, maintenance, implementation, acceptance and performance docs, the lessons, the architecture, lineage and three setup docs, the plugin, contract and asset READMEs, and the skill with its ingestion, notes, retrieval, operations, books and video guides. Facts, numbers and links are unchanged. Roadmap tasks are now numbered subheadings, and the setup guide's two graph deployments have their own subheadings.
- AGENTS.md and MAINTENANCE.md now describe this voice for future doc work, and say it isn't the owner's personal writing voice.
- Past change log entries and earlier validation records are unchanged.
- Documentation only. No runtime, schema, dependency or library change.

### 2026-10-05 - `kb_connect`, assessments that get used, and plainer docs

Why: connecting distant ideas is what the project is for, and recall found connected accounts without ever showing the path. Assessment fields existed on every record, but all 235 revisions in the acceptance library were `not_assessed`, because the guide discouraged them and nothing read them. The owner approved building `kb_connect`, keeping FalkorDB as an optional view, and a plan for assessments, and asked for a plainer documentation style.

- Added `kb_connect`. With `from` and `to`, it returns up to `paths` (default 3, at most 8) of the strongest chains of recorded links within `max_hops` (default 4, at most 6). Each hop names the link in its direction, such as "qualifies" or "is a prerequisite for", with the reason written for it. With `from` alone, it lists ideas two or more hops away, ideas in other topics first as possible bridges. `from` and `to` take a record id, `id@revision` or a few words. The search is best-first over simple paths, costs each hop by its link weight plus a penalty for passing through highly connected hubs, stops after 60,000 expansions, and applies the same scope, withdrawal and pinned-release rules as recall. It runs in process; FalkorDB is not needed.
- The recall index now keeps a label in each direction and the rationale for every link, which `kb_connect` prints.
- Recall shows assessed levels on each account's identity line, with an `Assessed:` line giving the basis and reason. Where a challenge link or a judgment joins two accounts, both sides appear on one "Side by side" line with their levels, the kind of support behind the evidence level, and their count of independent sources, followed by a note that a level never settles a conflict. `kb_brief` does the same for live disagreements. Levels never change ranking; a test checks the order is identical with and without them.
- Added an optional `basis` to evidence assessments in the record, proposal and reading schemas: `review_of_studies`, `controlled_comparison`, `measured_observation`, `worked_case`, `reasoned_argument`, `bare_assertion` or `our_inference`. `kb_write` now refuses a level without a reason, an evidence level without a basis, and `high` from a worked case, a bare assertion or an inference unless at least two independent source families stand behind the note. A revision keeps any dimension it doesn't mention.
- The notes, ingestion, books and retrieval guides now say when an assessment is worth making and how to read levels in a conflict. The skill and retrieval guide describe `kb_connect`, including that a chain is a lead and not a causal argument.
- The basis and the side-by-side display came from a review of how eight tools in the lineage score confidence. Two further ideas from it are roadmap tasks 17 and 18. The review's findings are summarized in [lineage](plugin/docs/lineage.md).
- Rewrote the README, AGENTS.md, the north star, roadmap, maintenance, implementation, acceptance and performance docs, the lessons, the architecture, lineage and setup docs, the plugin and contract READMEs, and the operations, books and video guides in the plainer style. Facts were kept; past change log entries and earlier validation records stay as written. Recorded the owner's later 5 October decisions in [NORTH_STAR.md](docs/NORTH_STAR.md) and updated [ROADMAP.md](docs/ROADMAP.md): tasks 3 and 4 are built, their remaining real-library checks moved into task 2, and nothing waits on the owner except the go-ahead to install.
- Measured `kb_connect` on the acceptance library copy: 146 ms for the first call including the index build, then 1-9 ms. See [PERFORMANCE.md](docs/PERFORMANCE.md) and [VALIDATION.md](docs/VALIDATION.md).
- Verification: 131 tests (128 passed, 3 Python conversion tests skipped on this machine), TypeScript build, formatting and package check with 14 schema copies. Record schema stays 1.1.0 and `basis` is optional, so existing libraries need no migration. An older engine rejects a record that carries `basis`, so roll the engine and plugin forward together, and refresh the installed plugin to load `kb_connect`.

### 2026-10-05 - Version 1.2.0: budgeted recall, session briefs, filed answers and note authoring

Why: answers cost 55,000-80,000 input tokens through the packet route and more through progressive reading, while the whole synthesized understanding of the three-paper acceptance library is about 11,000 tokens of prose. Retrieval was expanding knowledge instead of compressing it. Ingestion also spent most of its output on bookkeeping: hand-written proposal JSON, page text copied into passages, and every unit id listed in three receipts.

- Added `kb_recall`: one call returns a Markdown briefing packed to a token budget. Ranking fuses in-process BM25, the QMD semantic index (run automatically only when keywords look weak) and personalized PageRank over typed relationships, structural references and citations. Qualifying and challenging accounts, qualifying passages and current judgments are packed with what they qualify; conceptual prerequisites and a foundations-first reading order are added for explain and teach. Sources carry page labels, an independent-source count and verified quotes. Whatever does not fit is listed rather than cut. The scope, withdrawal, pinned-release and pending-reassessment rules match the canonical reading view.
- Added `kb_brief`: a session-start orientation per domain with the current primer (flagged stale when accounts in its domain were published or revised in a later release), the most connected ideas, live disagreements, questions ranked by impact and effort, and what recent ingestion reports added.
- Added `kb_file`: publishes a worked answer as a cited synthesis or lesson. It pins the exact revisions it cites, ranks at 0.9 of an equally relevant primary account, and becomes pending reassessment when any cited revision changes. `dry_run` previews it.
- Added `kb_write`: Markdown notes with short frontmatter compile into normal proposals. Cited unit ids become located passages built from the extraction (reusing an existing passage for the same unit); `links` become relationship records; slugs resolve within and across batches of a job; a `revises` note inherits every field it omits, so a reaffirmation is one line with a reason. Ungrounded notes are rejected.
- Added the optional `extensions.citations` record field. Each quote must appear in the cited passage (typography- and whitespace-folded match), checked at staging and publication; a failed quote returns the closest source wording.
- Added `coverage_all` to job receipts, which marks every remaining unit of the current stage with one status instead of listing each id.
- MCP responses for jobs now render compactly (stage, instruction, coverage counts, the first 40 pending units, reweave targets). A 121-unit job response fell from 117,069 to 3,633 characters. `detail:"full"` returns the raw JSON; the API and CLI are unchanged.
- The audit journal appends one entry per event and rebuilds fully only when it is out of step, instead of rereading every event file on each write. Reindexing removes view folders of older releases, keeping any folder that holds an unimported wiki edit.
- Rewrote the skill and its ingestion and retrieval guides around these tools, and added a notes guide. Packet and progressive retrieval remain available for comparison.
- Added [ROADMAP.md](docs/ROADMAP.md) with the task list, open decisions and failure modes to watch, and recorded the owner's 5 October decisions in [NORTH_STAR.md](docs/NORTH_STAR.md): 1.2.0 is the line going forward, and a Claude Code adapter follows once the system is judged finished.
- Added `yaml` 2.9.0 as a direct dependency; it was already installed through QMD at the same version, so the lockfile tree is unchanged.
- Measured on a copy of the three-paper acceptance library with the ten frozen 2026-10-04 cases: recall briefings of 5,800-11,900 estimated tokens against 52,000-80,000 for the packet route, in about 10 ms per call with semantic search skipped as unnecessary. In a blind comparison on those cases recall passed 10 of 10 and the packet 9 of 10, with no decisive failures and rubric points of 74 and 75 out of 80; details and limits are in [VALIDATION.md](docs/VALIDATION.md).
- Verification: 125 tests (122 passed, 3 Python conversion tests skipped on this machine), TypeScript build and package check. Record schema stays 1.1.0; the citations field is optional, so existing corpora need no migration. An older 1.1.0 engine rejects a record that carries citations, so roll the engine and plugin forward together. Refresh the installed plugin to load the new tools.

### 2026-10-04 — Version 1.1.0: connected reading and cumulative understanding

- Implemented summary-led wiki/topic navigation, authored navigation metadata, summary/body search identities and the versioned progressive reading interface. Complete accounts, batches, sections, exact support and mandatory material context remain available; optional graph exploration is separate from qualification checks.
- Added compact MCP presentation without shortening explanatory bodies, and corrected passage-body ranking and the distinction between assessment targets and conceptual prerequisites. The established packet route remains available; the default-adoption decision follows the measured acceptance criteria rather than response size alone.
- Added workflow-version-2 reweaving, including impact from new or revised material relationships, revision-backed reassessment decisions, stale-decision rejection and recoverable understanding-change reports. Rebasing preserves unfinished source stages and reopens later reassessment.
- Added version-3 interactive evaluations through a constrained native Codex MCP reader, immutable run/resume checks, runtime-bound isolation receipts, explicit grader-source authorization, complete reading traces, separate quality dimensions and honest reporting of cumulative token overruns.
- Documented the approved north star, acceptance contract, component responsibilities, reading guidance and cumulative-ingestion workflow. Existing source identities and the production binding are preserved; this release does not authorize a historical corpus migration or a new service.
- Validation and rollout evidence are recorded in [VALIDATION.md](docs/VALIDATION.md); total reading-cost boundaries are in [PERFORMANCE.md](docs/PERFORMANCE.md). Private source corpora, cases, raw runs and installation backups remain excluded from Git.
- Verification: 107 tests passed without skips; build, formatting, 14 packaged schema copies and live installed MCP checks passed. The source/graph/search/image and recovered-publication paths were checked in an isolated three-source library. The production binding and its empty published state were preserved.

### 2026-10-02 — Product intent and implementation plan

- Added a [north star and implementation plan](docs/NORTH_STAR.md), reconstructed from the original design conversations and checked against later accepted decisions, current runtime behavior and primary research references.
- Described the remaining work on summary-led navigation, selective reading, cumulative reweaving, teaching/application/invention and interactive capability evaluation. Proposed changes remain unimplemented and subject to plan review.
- Linked the document from contributor instructions and README so future work can recover the purpose without relying on a conversation summary. Private conversation evidence remains outside this repository.
- Documentation-only update. No runtime, schema, installed-plugin, corpus, binding or dependency change.
- Validation: package check passed (11 schema copies, valid example, 54 plugin links); all 38 local links across the new documents and edited entry points resolve; `git diff --check` passed. This verifies the documentation package, not the proposed behavior.

### 2026-10-01 — Representative technical-paper pilot

- Completed a supervised end-to-end pilot on a complete 30-page public paper in an isolated library. Verified preserved bytes, original-page reading, coverage accounting, publication, real MCP image delivery and live FalkorDB/QMD retrieval.
- Recorded parser omissions and separately qualified source inconsistencies. All six frozen-release application checks passed: five cases designed after publication and one disclosed regression. The coordinator verified decisive answers against original images and arithmetic.
- Documented the limits: one full-library condition, large answer inputs, no independent blind case designer, no equal-budget comparison and no claim of graph superiority or unattended migration readiness. See [validation](docs/VALIDATION.md) and [lessons](LESSONS.md).
- Documentation-only update; no engine/schema/plugin change, production ingestion or migration. Private pilot evidence remains outside Git.

### 2026-10-01 — Version 1.0.2: audit repairs and complementary PDF extraction

- Repaired all twelve reproduced audit groups: committed-only historical visibility, lifecycle-preserving edits, old-owner checks, current lifecycle/maintenance permissions, PDF page ownership, judgment/date/direction semantics, frozen structured evaluations, initial-registration recovery and EPUB visual readability.
- Implemented the approved PDF policy: technical (default), prose and forced-OCR profiles; complementary Poppler output, retained Docling JSON/Markdown/settings, original-page images and honest approximate ranges for ambiguous multi-page items. Formula enrichment stays off. Added pinned resvg-js 2.6.2 for SVG previews, with original assets retained; BMP/GIF previews are PNGs too. The PDF path also avoids Windows Poppler long-path file creation failures.
- Streamed original-file hashing and preservation, and reused verified source snapshots within requested frame/page batches. Existing performance measurements remain dated; no new throughput claim.
- Retained the original README/documentation style. Updated the book/retrieval/operations guides, architecture, setup dependencies, lineage, performance boundaries, validation and engineering lessons. The alternate README draft was not adopted.
- Validation: 80 automated tests with none skipped on the development installation, including the three Python provenance assertions; real technical/prose/forced-OCR PDF conversions, EPUB image reads, TypeScript build, formatting and package/release checks. Full-source fidelity, fresh-machine setup and an equal-budget graph comparison remain separate checks.
- Record schema stays 1.1.0; new evaluation manifests use version 2, with legacy reports preserved. No production migration, storage move, paid transcription or new hosted service. Refresh the installed plugin/server to load the release.

### 2026-09-30 - Public repository and documentation voice

- Made the repository public at the owner's request. Reviewed all three existing commits and scanned their 201 distinct blobs for private paths and common credential patterns. The scan found no matches. Research files, comparison outputs and credentials remain outside the release.
- Added the owner's writing preference to the contributor and maintenance instructions. Use `my-writing-style` when available, keep technical claims accurate, and keep the private skill out of the repository. A replacement README is a local draft awaiting review.
- Documented a targeted PDF comparison. The current Docling route can lose table structure, omit formula text and mix text from different pages. AI image transcription also introduced a wording error. Existing visual-review requirements remain necessary. No parser has been replaced.
- Validation: package and staged-release checks. Documentation impact: README visibility, contributor instructions, maintenance, validation and lessons. No runtime, dependency, schema or corpus changes. Migration remains a plan for review.

### 2026-09-29 — Version 1.0.1: faster verified retrieval and real-source acceptance

- Added bounded reuse of verified canonical contents and request-scoped deduplication. Mutable access/deletion controls are reread and compared before returning; file identity/timestamp changes trigger revalidation. Existing scope, revision, withdrawal and purge behavior is retained.
- Batched FalkorDB projection writes, verified node/edge counts and retained the final readiness marker. Added failure tests so an incomplete rebuild cannot report readiness.
- Switched repeated QMD lookups to a reusable local worker using the official SDK. Database/model handles close between requests; reindex, purge, timeout and crash terminate stale workers. Fixed QMD URL suffix mapping that previously discarded indexed hits while fallback answers hid the defect.
- Fixed document-conversion JSON output under Windows legacy console encodings. Applied pinned Prettier 3.9.9 to handwritten engine/test files and added format/check commands. Engine-version receipts now come from package metadata instead of repeated literals.
- Measured unchanged canonical packets and live graph parity at 25/250/1,000 records, plus separate lexical/CPU-semantic search timings. Ran a public NIST technical-source acceptance in an isolated corpus; detailed scope and outcomes belong in the validation report, not a blanket mastery claim.
- Corrected a mistaken source-reader note and evaluator rubric that had penalized correct table readings and prompted an incorrect test-library revision. Retained original answers and failed evaluation history, regraded against the original image and restored the correct knowledge. No production knowledge was affected.
- Validation: 54 automated tests, TypeScript build, formatting and release/package checks; see [validation](docs/VALIDATION.md) and [performance](docs/PERFORMANCE.md). Schema remains 1.1.0. No corpus migration, production research import, storage move, added hosted service or paid transcription.
- Documentation impact: README, architecture, validation, performance, maintenance, lineage tooling note and engineering lessons updated. Refresh the installed plugin and start a fresh host session to load the rebuilt engine.

### 2026-09-29 — README animation and attribution

- Replaced the incorrect scene still with the owner's supplied knowledge-upload GIF, centred below the title at an 800-pixel requested width (2× the original). Preserved the animation bytes and updated image provenance.
- Standardized current repository attribution to **ste-bah**. Updated the bundled lineage reference and recorded the lesson that a named component substitution must be explained explicitly during design review.
- Validation: byte-for-byte GIF hash comparison, package/manifest validation and staged release checks. No runtime code, research schema, dependencies or library data changed; no migration required.

## 2026-09-29 — Private repository baseline and configurable setup

- Packaged the engine, Codex adapter, formal contracts, configuration examples and synthetic tests together. Real libraries, runtime credentials, private conversations and historical acceptance material are excluded.
- Added the GitHub landing README and subtitle-free Neo still, with separate image provenance. Added the design lineage crediting **ste-bah**, distinguishing influences from actual dependencies and clarifying that no Memory Graph fork is bundled.
- Added an AI-assisted setup interview and decision matrix. Setup must ask where code, canonical knowledge, runtime/ledger, graph persistence and backups should live. Documented Docker/external FalkorDB, native/WSL FFmpeg and local versus hosted transcription without presenting unbuilt adapters as available.
- Added `KB_STATE_DIR`, `KB_MEDIA_RUNTIME`, `KB_WSL_DISTRO` and an external FalkorDB connection mode. Existing installations keep their original paths and WSL defaults when overrides are absent. No existing library/ledger was moved.
- Added a machine-local MCP configuration generator that records explicit path/media choices and refuses overwrite. Its output is excluded from Git.
- Bundled the synthetic Lumen fixture instead of depending on a private sibling research directory. Added setup/media/state contract checks; 39 automated tests passed and TypeScript built successfully. Live external-server and release-package checks are recorded in `docs/VALIDATION.md`.
- Added `AGENTS.md`, a maintenance/doc-impact map, lessons and a staged-release check so future changes carry their explanation and documentation with them.

Docs: [setup](plugin/docs/setup-ai.md), [choices](plugin/docs/setup-choices.md), [lineage](plugin/docs/lineage.md), [maintenance](docs/MAINTENANCE.md).

## Earlier local build — summarized, not reconstructed commit history

The initial build established immutable originals, source locators, rich research records, canonical publication, FalkorDB/QMD/wiki projections, scoped retrieval, lifecycle operations and evaluation. Later local work renamed the adapter to Know Fu and integrated the book/video workflows. The package documentation follow-up added schema/layout/setup references. These predate the first Git commit; private development transcripts and acceptance artifacts are not part of the repository.

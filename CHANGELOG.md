# Change log

Changes after this baseline belong here with their reason, affected behavior/docs, validation and migration implications. Git records exact file history; this file explains why it changed.

## Unreleased

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

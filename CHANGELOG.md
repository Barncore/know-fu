# Change log

Changes after this baseline belong here with their reason, affected behavior/docs, validation and migration implications. Git records exact file history; this file explains why it changed.

## Unreleased

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

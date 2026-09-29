# Change log

Changes after this baseline belong here with their reason, affected behavior/docs, validation and migration implications. Git records exact file history; this file explains why it changed.

## Unreleased

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

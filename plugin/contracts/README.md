# Formal contracts

These are byte-for-byte copies of the engine's `contracts/schemas/*.schema.json`. The engine remains the schema authority. The packaging script copies them, records SHA-256 hashes in [engine-contracts.json](../engine-contracts.json), and can check for drift before installation. Edit engine contracts first, then regenerate the bundle.

| Schema | Defines |
|---|---|
| [corpus](schemas/corpus.schema.json) | Library configuration and project/module scope |
| [record](schemas/record.schema.json) | All eight record families and their common metadata |
| [proposal](schemas/proposal.schema.json) | Proposed records/prose before canonical publication |
| [job](schemas/job.schema.json) | Resumable ingestion state |
| [release](schemas/release.schema.json) | Published exact revisions and their integrity hashes |
| [retrieval](schemas/retrieval.schema.json) | Retrieved evidence packet, scope, freshness and gaps |
| [reading-request](schemas/reading-request.schema.json) | Versioned progressive discovery and selected-reading inputs |
| [reading](schemas/reading.schema.json) | Summaries, full/partial reading, material context and provenance |
| [lifecycle-plan](schemas/lifecycle-plan.schema.json) | Reviewed archive, withdrawal or purge operation plan |
| [audit-event](schemas/audit-event.schema.json) | Operation event |
| [evaluation-case](schemas/evaluation-case.schema.json) | Source-grounded application/checking case |
| [evaluation-run](schemas/evaluation-run.schema.json) | Evaluation run state and results |
| [evaluation-grade](schemas/evaluation-grade.schema.json) / [evaluation-grade-v2](schemas/evaluation-grade-v2.schema.json) | Fixed-packet grading and separate capability dimensions with decisive failures |

The JSON schemas use draft 2020-12. Their `local.invalid` identifiers are stable schema identifiers, not websites to visit or services to deploy. Runtime validation also checks referential integrity, hashes, scope and other conditions that a JSON schema alone cannot establish.

For a readable explanation, start with [architecture and layout](../docs/architecture.md).

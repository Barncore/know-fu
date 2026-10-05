# Formal contracts

These are byte-for-byte copies of the engine's `contracts/schemas/*.schema.json`. The engine's copies are the authority. The packaging script copies them here, records their SHA-256 hashes in [engine-contracts.json](../engine-contracts.json) and can check for drift before installation. Change the engine's schemas first, then regenerate this bundle.

| Schema | Defines |
|---|---|
| [corpus](schemas/corpus.schema.json) | Library configuration and project and module scope |
| [record](schemas/record.schema.json) | All eight record families, their shared metadata, and optional extensions such as navigation summaries and verified quote citations |
| [proposal](schemas/proposal.schema.json) | Records and prose staged before publication; `kb_write` notes compile into this |
| [job](schemas/job.schema.json) | Resumable ingestion state |
| [release](schemas/release.schema.json) | The exact revisions in a published release, with integrity hashes |
| [retrieval](schemas/retrieval.schema.json) | The older packet route's evidence packet |
| [reading-request](schemas/reading-request.schema.json) | Inputs for progressive discovery and selected reading |
| [reading](schemas/reading.schema.json) | Progressive reading responses: summaries, full and partial reads, material context and provenance |
| [lifecycle-plan](schemas/lifecycle-plan.schema.json) | A reviewed archive, withdrawal or purge plan |
| [audit-event](schemas/audit-event.schema.json) | One operation event |
| [evaluation-case](schemas/evaluation-case.schema.json) | A source-grounded test case |
| [evaluation-run](schemas/evaluation-run.schema.json) | An evaluation run's state and results |
| [evaluation-grade](schemas/evaluation-grade.schema.json) / [evaluation-grade-v2](schemas/evaluation-grade-v2.schema.json) | Fixed-packet grading, and separate capability dimensions with decisive failures |

The schemas use JSON Schema draft 2020-12. Their `local.invalid` identifiers are stable names, not websites or services. The engine also checks things a schema can't: references, hashes, scope, quotes against source text, and more.

For a readable explanation, start with the [architecture](../docs/architecture.md).

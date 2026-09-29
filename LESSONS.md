# Engineering lessons

## 2026-09-29 — An adapter folder is not the whole product

The initial plugin worked by pointing at an external engine but did not carry enough documentation to explain that boundary. Keep engine, adapter and corpus ownership explicit. Ship formal contracts and setup references with the adapter; check copied contracts against the engine rather than maintaining two schemas.

## 2026-09-29 — Preferences must not masquerade as architectural requirements

WSL, hosted transcription and a particular drive layout were choices for one installation. Preserve the research contracts while making environmental choices explicit. Label local transcript ingestion separately from fully integrated video ingestion, and external-server connectivity separately from a tested Docker deployment.

## 2026-09-29 — Ask about data locations before initialization

A convenient developer-relative data folder is not automatically the owner's preferred permanent home. Discuss original-media growth, graph persistence, independent deletion history and backups together. A runtime state move is a migration; losing its ledger can invalidate recovery even when the corpus files remain.

## 2026-09-29 — Influence, fork and dependency are different relationships

Borrowing Memory Graph's design reasoning does not make the product a Memory Graph fork. Record actual code/package provenance separately from conceptual lineage. Unused forks create unnecessary maintenance obligations.

## 2026-09-29 — Release checkout bytes matter

Git's newline normalization can invalidate stored hashes even when a working-directory test passes. Synthetic evidence fixtures preserve exact bytes through `.gitattributes`; schema files use normalized LF and their bundled manifests are regenerated. Check the actual staged checkout, not only the original development folder.

## 2026-09-29 — Make component substitutions explicit

Keeping the same database and architectural purpose does not make a custom adapter equivalent to a previously discussed upstream application. A technical specification can describe that substitution accurately while still leaving the owner with the wrong understanding. Call out the named component being replaced, what is gained and lost, and what remains unverified before treating the replacement as an understood decision. Broad design approval is not evidence that the tradeoff was communicated clearly.

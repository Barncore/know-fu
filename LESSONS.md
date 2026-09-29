# Engineering lessons

## 2026-09-29 — Check the evaluator before repairing the evidence

The NIST check initially penalized a correct table reading because a source-reader note put a value in the wrong column. An attempted repair then introduced that evaluator error into the compiled account. Reopening the original page exposed the mistake: extraction and original answers had been right about the cell. A reported visual review is not proof of a correct reading. Reinspect the decisive source region when answer evidence and a rubric disagree, before revising knowledge. Preserve the erroneous evaluation and revision, issue a corrected assessment, and separate citation mistakes from application errors. Byte integrity, source fidelity and grader validity are different checks.

## 2026-09-29 — Plausible fallback answers do not prove an index contributed

QMD returned document URLs with an index suffix that the adapter failed to map. Canonical keyword fallback still produced plausible answers. Test a hit that only the intended route can supply and inspect its contribution to ranking. Likewise, an application comparison that starts while embeddings are still being built measures fallback behavior; preserve that attempt separately and rerun the affected conditions after checking projection readiness.

## 2026-09-29 — Cache evidence, reread authority

Performance gains came from eliminating repeated file parsing and duplicate request work, not from skipping scope, lifecycle or provenance checks. Keep mutable access/deletion controls outside the content cache, compare controls again before returning and test corrections and policy changes in the same long-lived process. State the filesystem assumptions behind cache invalidation instead of implying every cache hit is a fresh byte-level cryptographic audit.

## 2026-09-29 — A rendered PDF can still contain broken mathematics

The real-source check found missing glyphs in both extracted text and rendered pages, plus a table whose categories depend on column placement. Preserve raw bytes, inspect the layout and retain a traceable alternate official presentation when needed. Two presentations of the same publication are one evidence family. Never silently replace damaged extraction with remembered mathematics and call it a verbatim source passage.

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

## 2026-09-30 - Compare extraction against the page, not another extraction

A PDF can have a bad text layer even when its page looks readable. Two parsers repeating the same error are not two independent confirmations. The comparison also found a table cell left blank, formula placeholders and multi-page text presented under a single-page locator. Preserve parser settings and original-page references, flag missing content, and check consequential details against the pixels. AI can repair the reading, but its output needs its own fidelity checks: the image-reading run changed one source noun while otherwise looking convincing.

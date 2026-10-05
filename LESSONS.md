# Engineering lessons

## 2026-10-05 - A field nothing reads stays empty

Every record carried fidelity, evidence and applicability assessments from the start. In the three-paper acceptance library, all 235 record revisions had all three set to `not_assessed`. The guide told agents not to manufacture confidence scores and never said when an assessment was worth making, and no tool showed the levels anywhere. Agents did the sensible thing and skipped them. The same pattern turned up across the tools reviewed for confidence scoring: counters nobody writes and scores nobody reads. Before adding a field, name the reader that will use it and the moment the writer has the facts to fill it. Then make the engine check what it can count (here, a level needs a reason, and `high` from thin support needs two independent source families), so that filling the field honestly is cheaper than faking it.

## 2026-10-05 - Compiling should compress

The three-paper acceptance library held about 11,000 tokens of authored explanation, 50,000 of verbatim passages and 157,000 of record metadata. A single packet answer sent 52,000-80,000 tokens. The packet route followed every input and dependency of every match, so each explanation arrived with all the pages it cited. A dependency closure is the right tool for invalidation and scope checks, and the wrong tool for deciding what to read. Rank, then pack to a budget: explanations first, their qualifications and judgments carried with them, sources as labels and verified quotes, and an explicit list of what was left out. Measure the compiled layer against what retrieval sends. If one answer costs more than the whole understanding, the design is expanding knowledge instead of compressing it.

## 2026-10-05 - Freshness follows publication order

Records written in one batch get different `created_at` times, so comparing timestamps marked a primer stale against accounts published in the same release. Decide "newer than" by the published release in which a revision first appeared.

## 2026-10-05 - Make the right action the cheap action

Agents spent most of their ingestion output on bookkeeping: proposal JSON with every default spelled out, full page text copied into passages the engine already held, and the same unit ids listed for three stages. When the honest action is expensive, it gets skipped or faked. Let the engine fill in identities, defaults and passages from what it already has, verify what the agent asserts (quotes against source text), and keep the agent's output for meaning.

## 2026-10-04 - Count the whole reading conversation

A smaller evidence response doesn't guarantee less model input. Interactive reading can resend earlier context, tool definitions and metadata on every turn. Measure actual cumulative usage, keep budget overruns in the results, and compare quality task by task. Compact repeated scope and assessment definitions, but never cut complete explanations or hide conditions to do it. An optional reading interface can be useful without earning the default.

## 2026-10-04 - Assessment targets are not premises

A judgment can assess several unrelated procedures. Following all its issue targets as if they were prerequisites made reading one procedure require the others. Keep the roles explicit: assessment targets, provenance inputs and conceptual prerequisites are different relationships. Keep the full dependency closure for scope and withdrawal, and let the reading obligation follow the actual reasoning dependencies.

## 2026-10-04 - New links can change old knowledge

An incoming qualification can change an existing explanation even when the explanation's own input list didn't change. Calculate impact from both revised inputs and the endpoints of material relationships. Reconsider dependent primers, examples and questions, and bind each reassessment to the staged meaning. A new link or a higher source count is not evidence that practical understanding improved; test changed applications and unaffected knowledge separately.

## 2026-10-01 - Faithful extraction can preserve a wrong source claim

The paper pilot found a printed test cutoff that disagreed with exact arithmetic, and a worked-table header that conflicted with the procedure's formula. The original pages confirmed both were errors in the source, not extraction defects. Keep the author's account, store the independent check as a separate qualification, and retrieve both when applying the method. Never silently repair the source, and never grade an application correct just because it repeats the source. Source fidelity, mathematical validity and empirical support are separate, and each needs its own evidence.

## 2026-10-01 - Test authority across operations

A passing publication test didn't cover exact reads of an interrupted candidate. A scoped read test didn't cover full exports or running somebody else's lifecycle plan. Express authority as shared invariants, and test alternate entry points, historical reads, ordinary edits, interruption and resumption. A saved receipt of a user's instruction records intent; it can't grant permissions the caller no longer has.

## 2026-10-01 - Where text came from and whether it is faithful are separate questions

A multi-page text item's provenance doesn't mean that exporting its first page isolates that page's text. Split it only when you can show which characters belong to which page; otherwise keep the item with an honest page range. Complementary parsers, raw outputs and original-page images help comparison, but neither parser agreement nor an exact physical locator certifies faithful wording or table alignment.

## 2026-09-30 - Compare extraction against the page, not another extraction

A PDF can have a bad text layer even when its page looks readable. Two parsers repeating the same error are not two independent confirmations. The comparison also found a table cell left blank, formula placeholders, and multi-page text presented under a single-page locator. Keep parser settings and original-page references, flag missing content, and check consequential details against the pixels. AI can repair the reading, but its output needs its own fidelity check: the image-reading run changed one source noun while otherwise looking convincing.

## 2026-09-29 - Check the evaluator before repairing the evidence

The NIST check first penalized a correct table reading, because a source-reader note put a value in the wrong column. An attempted repair then wrote that evaluator error into the compiled account. Reopening the original page exposed the mistake: the extraction and the original answers had read the cell correctly. A reported visual review is not proof of a correct reading. When answer evidence and a rubric disagree, look at the decisive source region again before revising knowledge. Keep the wrong evaluation and the revision, issue a corrected assessment, and separate citation mistakes from application errors. Byte integrity, source fidelity and grader validity are different checks.

## 2026-09-29 - Plausible fallback answers don't prove an index contributed

QMD returned document URLs with an index suffix that the adapter failed to map, and canonical keyword fallback still produced plausible answers. Test a hit that only the intended route can supply, and look at its contribution to ranking. In the same way, an application comparison that starts while embeddings are still building measures fallback behavior. Keep that attempt separately and rerun the affected conditions once the view is ready.

## 2026-09-29 - Cache evidence, reread authority

The speedup came from removing repeated file parsing and duplicate work within a request, not from skipping scope, lifecycle or provenance checks. Keep mutable access and deletion controls out of the content cache, compare controls again before returning, and test corrections and policy changes in the same long-lived process. State the filesystem assumptions behind cache invalidation instead of implying that every cache hit is a fresh cryptographic audit of the bytes.

## 2026-09-29 - A rendered PDF can still contain broken mathematics

The real-source check found missing glyphs in both the extracted text and the rendered pages, plus a table whose categories depend on column placement. Keep the raw bytes, inspect the layout, and keep a traceable alternative official presentation when needed. Two presentations of the same publication are one evidence family. Never silently replace damaged extraction with remembered mathematics and call it a verbatim source passage.

## 2026-09-29 - An adapter folder is not the whole product

The first plugin worked by pointing at an external engine, but didn't carry enough documentation to explain that boundary. Keep engine, adapter and library ownership explicit. Ship formal contracts and setup references with the adapter, and check the copied contracts against the engine rather than maintaining two schemas.

## 2026-09-29 - Preferences must not pose as architectural requirements

WSL, hosted transcription and a particular drive layout were choices for one installation. Keep the research contracts and make environmental choices explicit. Label local transcript ingestion separately from fully integrated video ingestion, and connecting to an external server separately from a tested Docker deployment.

## 2026-09-29 - Ask about data locations before initialization

A convenient data folder next to the code is not automatically the owner's preferred permanent home. Discuss original-media growth, graph persistence, independent deletion history and backups together. Moving runtime state is a migration, and losing its ledger can break recovery even when the library files remain.

## 2026-09-29 - Influence, fork and dependency are different relationships

Borrowing Memory Graph's design reasoning doesn't make the product a Memory Graph fork. Record actual code and package provenance separately from conceptual lineage. An unused fork creates maintenance work for nothing.

## 2026-09-29 - Release checkout bytes matter

Git's newline normalization can invalidate stored hashes even when a test passes in the working folder. Synthetic evidence fixtures keep exact bytes through `.gitattributes`; schema files use normalized LF and their bundled manifests are regenerated. Check the actual staged checkout, not only the original development folder.

## 2026-09-29 - Make component substitutions explicit

Keeping the same database and architectural purpose doesn't make a custom adapter equivalent to an upstream application discussed earlier. A technical specification can describe that substitution accurately and still leave the owner with the wrong picture. Name the component being replaced, what is gained and lost, and what remains unverified, before treating the replacement as an understood decision. Broad design approval is not evidence that the trade-off was communicated clearly.

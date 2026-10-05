# Engineering lessons

Things this project learned the hard way, newest first. Each one says what happened and what to do differently.

## 2026-10-05 - A field nothing reads stays empty

Every record carried fidelity, evidence and applicability assessments from day one. In the three-paper test library, all 235 record revisions had all three set to `not_assessed`. Not one was filled in. The guide told agents not to manufacture confidence scores, never said when an assessment *was* worth making, and nothing anywhere showed the levels to anyone. So agents did the sensible thing and skipped them. The review of eight other tools found the same pattern everywhere: counters nobody writes, scores nobody reads.

Before adding a field, name who will read it and the moment the writer actually has the facts to fill it in. Then have the engine check what it can count (here: a level needs a reason, and `high` from thin support needs two independent source families), so that filling the field honestly is cheaper than faking it.

## 2026-10-05 - Compiling should compress

The numbers told the story. The three-paper test library held about 11,000 tokens of authored explanation, 50,000 of verbatim passages and 157,000 of record metadata, yet a single packet answer sent 52,000-80,000 tokens. The packet route followed every input and dependency of every match, so each explanation arrived dragging every page it cited.

A dependency closure is the right tool for invalidation and scope checks, and the wrong tool for deciding what to read. Rank first, then pack to a budget: explanations first, their qualifications and judgments carried along, sources as labels and verified quotes, and an honest list of what got left out. Keep measuring the compiled layer against what retrieval sends. If one answer costs more than the whole understanding, the design is inflating knowledge instead of compressing it.

## 2026-10-05 - Freshness follows publication order

Records written in one batch get slightly different `created_at` times. Comparing those timestamps marked a primer "stale" against accounts published in the very same release, which was nonsense. Decide "newer than" by the release in which a revision first appeared.

## 2026-10-05 - Make the right action the cheap action

Agents were spending most of their ingestion output on bookkeeping: proposal JSON with every default spelled out, full page text copied into passages the engine already had, and the same unit ids listed for three different stages. When the honest action is expensive, it gets skipped or faked. Let the engine fill in identities, defaults and passages from what it already knows, verify what the agent claims (quotes against source text), and save the agent's output for meaning.

## 2026-10-04 - Count the whole reading conversation

A smaller response doesn't mean less model input. Interactive reading can resend earlier context, tool definitions and metadata on every single turn, and that adds up fast. Measure actual cumulative usage, keep budget overruns in the results, and compare quality task by task. By all means compact repeated scope and assessment definitions, but never cut complete explanations or hide conditions to get there. An optional reading interface can be genuinely useful without earning the default.

## 2026-10-04 - Assessment targets are not premises

A judgment can assess several unrelated procedures at once. Treating all its targets as prerequisites of each other meant that reading one procedure suddenly required reading the others. Keep the three roles straight: assessment targets, provenance inputs and conceptual prerequisites are different relationships. Keep the full dependency closure for scope and withdrawal, and let the reading obligation follow the actual reasoning.

## 2026-10-04 - New links can change old knowledge

An incoming qualification can change an existing explanation even when that explanation's own inputs didn't change at all. So calculate impact from both revised inputs and the endpoints of material relationships. Reconsider the primers, examples and questions that depend on the change, and tie each reassessment to the staged meaning. And remember that a new link or a higher source count isn't evidence that practical understanding improved; test changed applications and untouched knowledge separately.

## 2026-10-01 - Faithful extraction can preserve a wrong source claim

The paper pilot found a printed test cutoff that disagreed with exact arithmetic, and a worked-table header that contradicted the procedure's own formula. The original pages confirmed both were errors in the source itself, not extraction mistakes.

Keep the author's account as written, store the independent check as a separate qualification, and retrieve both when applying the method. Never quietly repair the source, and never grade an application correct just because it faithfully repeats the source. Source fidelity, mathematical validity and empirical support are three separate questions, and each needs its own evidence.

## 2026-10-01 - Test authority across every way in

A passing publication test didn't cover exact reads of an interrupted candidate. A scoped read test didn't cover full exports, or running somebody else's lifecycle plan. Authority has to hold no matter which door you come through, so express it as shared invariants and test the alternate entry points, historical reads, ordinary edits, interruption and resumption. A saved receipt of a user's instruction records what they wanted; it can't grant permissions the caller no longer has.

## 2026-10-01 - Where text came from and whether it's faithful are separate questions

Knowing that a text item spans several pages doesn't mean exporting its first page isolates that page's text. Only split it when you can show which characters belong to which page; otherwise keep the item whole with an honest page range. Complementary parsers, raw outputs and original-page images all help the comparison, but neither parsers agreeing nor an exact physical locator certifies faithful wording or table alignment.

## 2026-09-30 - Compare extraction against the page, not against another extraction

A PDF can have a bad text layer even when the page looks perfectly readable, and two parsers repeating the same error are not two independent confirmations. The same comparison turned up a table cell left blank, formula placeholders, and multi-page text filed under a single-page locator. Keep parser settings and original-page references, flag missing content, and check the details that matter against the pixels. AI can repair the reading, but its output needs its own fidelity check: the image-reading run changed one source noun while looking entirely convincing.

## 2026-09-29 - Check the evaluator before repairing the evidence

This one stung. The NIST check penalized a correct table reading, because a source-reader note had put a value in the wrong column. An attempted "repair" then wrote that evaluator error into the compiled account. Reopening the original page showed the extraction and the original answers had read the cell correctly all along.

A reported visual review is not proof of a correct reading. When answer evidence and a rubric disagree, look at the decisive source region again before revising any knowledge. Keep the wrong evaluation and the revision on record, issue a corrected assessment, and separate citation mistakes from application errors. Byte integrity, source fidelity and grader validity are three different checks.

## 2026-09-29 - A plausible fallback answer doesn't prove the index helped

QMD returned document URLs with an index suffix the adapter failed to map, and canonical keyword fallback kept producing plausible answers, so nothing looked wrong. Test with a hit that only the intended route can supply, and look at what it contributes to ranking. Likewise, an application comparison that starts while embeddings are still building is really measuring fallback behavior. Keep that attempt separate and rerun the affected conditions once the view is ready.

## 2026-09-29 - Cache the evidence, reread the authority

The speedup came from cutting repeated file parsing and duplicate work within a request, never from skipping scope, lifecycle or provenance checks. Keep mutable access and deletion controls out of the content cache, compare controls again before returning, and test corrections and policy changes inside the same long-lived process. Be upfront about the filesystem assumptions behind cache invalidation, rather than implying every cache hit is a fresh cryptographic audit of the bytes.

## 2026-09-29 - A rendered PDF can still have broken mathematics

The real-source check found missing glyphs in both the extracted text and the rendered pages, plus a table whose categories depend on column placement. Keep the raw bytes, inspect the layout, and keep a traceable alternative official presentation when you need one. Two presentations of the same publication are still one evidence family. Never quietly swap damaged extraction for remembered mathematics and call it a verbatim passage.

## 2026-09-29 - An adapter folder isn't the whole product

The first plugin worked by pointing at an external engine, but didn't carry enough documentation to explain that it was only half the system. Keep engine, adapter and library ownership explicit. Ship formal contracts and setup references with the adapter, and check the copied contracts against the engine instead of maintaining two sets of schemas.

## 2026-09-29 - Preferences shouldn't pose as requirements

WSL, hosted transcription and a particular drive layout were choices for one installation, not laws of the system. Keep the research contracts and make environmental choices explicit. Label local transcript ingestion separately from fully integrated video ingestion, and connecting to an external server separately from a tested Docker deployment.

## 2026-09-29 - Ask about data locations before initializing

A handy data folder next to the code isn't automatically where the owner wants their library to live forever. Talk through original-media growth, graph persistence, independent deletion history and backups together, up front. Moving runtime state later is a migration, and losing its ledger can break recovery even when every library file survives.

## 2026-09-29 - Influence, fork and dependency are different relationships

Borrowing Memory Graph's design thinking doesn't make Know Fu a Memory Graph fork. Record actual code and package provenance separately from conceptual lineage. An unused fork is just maintenance work for nothing.

## 2026-09-29 - Release checkout bytes matter

Git's newline normalization can invalidate stored hashes even when every test passes in the working folder. Synthetic evidence fixtures keep exact bytes through `.gitattributes`; schema files use normalized LF and their bundled manifests get regenerated. Check the actual staged checkout, not just the folder you developed in.

## 2026-09-29 - Make component substitutions explicit

Keeping the same database and the same architectural purpose doesn't make a custom adapter equivalent to an upstream application that was discussed earlier. A technical spec can describe the substitution accurately and still leave the owner with the wrong picture. Say plainly which component is being replaced, what's gained and lost, and what's unverified, before treating the swap as an understood decision. Broad approval of a design isn't evidence that the trade-off was ever communicated.

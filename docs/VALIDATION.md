# Validation status

The local development installation is Windows with Ubuntu WSL2, regular FalkorDB and CPU QMD. This repository is a reusable source baseline; not every deployment option has been provisioned on a fresh machine.

## 2026-10-05: version 1.2.0 recall against the packet route

The question was whether a budgeted `kb_recall` briefing answers as well as the 1.1.0 packet while sending far less. Both routes ran against a byte-for-byte copy of the three-source acceptance library (release `release-6eabd081`, 182 records), using the ten cases frozen on 2026-10-04 (seven access cases and three cumulative cases) with their original queries, purposes and rubrics. The FalkorDB service was not used: the packet route ran without graph expansion and recall used its in-process link-following, so the packet is, if anything, slightly smaller than the 1.1.0 graph route would produce.

| Measure | Packet | Recall |
|---|---:|---:|
| Library material per answer, median (characters ÷ 4) | 69,700 | 8,400 |
| Range | 18,400-80,100 | 6,100-11,900 |
| Material across all ten answers | 2,368,000 characters | 339,000 characters |
| Retrieval time per call | 2.9-3.7 s (semantic search every call) | 7-180 ms (semantic search skipped as unnecessary on all ten) |
| Overall grades | 9 pass, 1 partial | 10 pass |
| Decisive failures | 0 | 0 |
| Rubric points (four dimensions, 0-2 each) | 75 of 80 | 74 of 80 |
| Grader preference | 5 | 5 |

Method: each case's material went to a fresh solver subagent (Claude Sonnet 5.5) that saw only the question and that material, with the same 1,000-word instruction for both routes; the packet was rendered as readable text carrying all of its fields, and long lines in both conditions were wrapped identically so a file reader could not truncate them. Answers were 785-1,033 words in both conditions. A separate grader (Claude Opus 5.5) per case saw the question, the original rubric, the source grounding and the cited source pages, and the two answers under random X/Y labels. Graders never saw which route produced which answer; the unblinding key stayed outside their files.

Where the routes differed: the packet answer to the commensurability case dropped the condition that Wilcoxon needs comparable difference magnitudes (partial). The packet transfer answer did not justify that its twelve problems were independent. The recall teaching answer did not explain why the critical difference depends on the comparison family, although the account that explains it was in its briefing. The recall synthesis answer left the paired-mean branch and per-test commensurability implicit: the two accounts that cover them did not fit the 12,000-token synthesis budget and were listed under "Also relevant, not loaded", which a one-shot solver cannot open.

Limits: ten cases on one small library of public papers the models may already know; one solver run per condition, so answer-to-answer variance is unmeasured; same-family models for solving and grading; graders worked from text and could not inspect page images; the cases were designed by the coordinator who wrote the library. Recall was tested as a single call; in real use the agent can follow the not-loaded list, which this setup does not credit. The cosmetic separator in the "Also relevant" list changed after the briefings were generated; content did not. An earlier attempt with ten parallel Opus solvers was stopped by a usage limit; its one completed answer was set aside unread and the run was repeated with Sonnet throughout. Raw prompts, answers and grades remain private under the engine's `.bench/` folder.

Reading: on these cases, recall holds answer quality at about one-eighth of the material and without the semantic-search delay. It does not show that recall is better, and broad synthesis is where its budget bites first.

## 2026-10-04: version 1.1.0 capability build

The [approved architecture](NORTH_STAR.md) now has summary-led navigation, complete-account and section reading, canonical material-context checks, cumulative reassessment and interactive evaluation. The build passes **107 automated tests with none skipped**, including the existing authority, lifecycle, recovery and document-conversion regressions. TypeScript compilation, formatting and packaged-contract checks pass. Engineering correctness is separate from the application evidence below.

### Controlled access-structure comparison

The foundational 109-record release was frozen before the new cases were written. Every canonical record and body hash was checked again after the final comparison: unchanged. The seven task groups were explanation, teaching, application, comparison, invention, synthesis and investigation. Two additional answers repeated application and a known source-error check; these are nine answers, not nine independent task groups. The source-reading coordinator designed the cases and reviewed the evidence. Separate solver and grader sessions do not make this an independent blind benchmark.

The final fixed-packet and progressive conditions used the same frozen release, implementation, model alias (`gpt-6-astra`), medium reasoning setting, 1,000-word answer instruction and 300,000-token cumulative answer-input ceiling. Progressive runs also had limits of 24 tool calls, 240,000 delivered characters and ten minutes. The token ceiling is measured after completion; it is not a hard context cutoff. Reported input sums the model's input across reading turns, including cached and repeated context. Grader usage is recorded separately.

| Task | Fixed packet input | Progressive with graph | Progressive without optional graph |
|---|---:|---:|---:|
| Explain comparison targets | 53,394 | 204,197 | 183,496 |
| Teach omnibus and pairwise claims | 61,323 | 144,983 | 140,992 |
| Apply an unfamiliar Holm family | 58,572 | 109,659 | 146,241 |
| Compare replicability measures | 62,685 | 100,258 | 127,086 |
| Propose a teaching evaluation | 75,553 | 181,676 | 177,453 |
| Synthesize the comparison pipeline | 57,199 | 269,929 | 346,006 |
| Prioritize an evidence gap | 63,398 | 212,795 | 212,870 |
| Repeat the Holm application | 58,569 | 111,080 | 109,827 |
| Repeat the source-error check | 76,182 | 67,702 | 67,753 |
| **Median per answer** | **61,323** | **144,983** | **146,241** |

All final answers passed the correctness dimension and none received a decisive-failure finding. Overall grades were seven pass/two partial for the fixed route, seven pass/two partial with progressive graph, and eight pass/one partial without optional graph. These grades are not interchangeable with complete reading:

- All three explanation answers left distributional conditions insufficiently explicit, especially symmetry for standard signed-rank location inference. The foundational source itself did not supply that condition explicitly; the later qualifying source does.
- The fixed investigation answer lacked an effort budget or stopping criterion. The graph invention answer did not fully connect its benefit, error and cost thresholds to the final decision rule.
- One graph teaching answer left two recorded material reads unmet: the sign-test qualification and hypothesis-family account. Its final prose was graded correct, but the reading protocol was incomplete.
- The progressive-prose synthesis exceeded the common input ceiling. It remains descriptive evidence, not a matched-budget success.

The predefined [default-adoption gate](ACCEPTANCE.md) was **not met**. Only the source-error task used less input through progressive reading; the requirement was two narrow task groups without quality loss. Packet retrieval therefore remains the API and routine-answer default. Progressive reading ships as an additional navigation/selected-reading capability. The comparison does not establish optional graph superiority, a universal token-saving policy or a reason to discard full explanatory prose.

Earlier runs remain preserved, including budget overruns and a missed Holm stopping condition in intermediate answers. Their feedback prompted generic ranking, material-context and presentation repairs, so the final cases are exposed regression/acceptance evidence rather than untouched holdouts. Repetition also showed answer variability. Compacting a response did not remove the cost of resending prior context.

### Source sequence and backward revision

After the unchanged-release comparison, the isolated library added the complete 17-page [Bengio and Grandvalet (2004) paper](https://www.jmlr.org/papers/volume5/grandvalet04a/grandvalet04a.pdf), followed by the complete 10-page [Benavoli, Corani and Mangili (2016) paper](https://www.jmlr.org/papers/volume17/benavoli16a/benavoli16a.pdf). Primary text, complementary extraction and every original page image were read before publication. Original files and locators were preserved. Cited works were not thereby independently reviewed.

The complementary account distinguishes fixed-model error from expected algorithm error, the cross-validation training-size target, covariance among losses and the scope of the no-universal-unbiased-variance-estimator result. A synthetic covariance calculation reproduced variance .105 versus the independence approximation .05, with the covariance eigenvalues checked. This is an arithmetic illustration, not a replication of training experiments.

The qualifying account explains how a fixed pair's mean-rank statistic can change when other competitors change, even at fixed pool size. All 54 printed table rows were checked against the original image and layout extraction. Recalculation reproduced the reported subset counts and two fixed-four-classifier statistics, 3.05596 and 2.45967, on opposite sides of the same cutoff. Raw-pair alternatives retain their assumptions and multiplicity requirements. The printed tail convention and an unread cited proof remain explicit qualifications; Monte Carlo power and the reported Wilcoxon p-value were not independently reproduced.

Both publications revised the earlier primer, near-miss guidance, methodological-currency question and proposed knowledge-system evaluation. Historical source accounts and unaffected calculations were explicitly reconsidered and reaffirmed without rewriting the author's position. New connected explanations and a three-source procedure preserve where the later evidence qualifies practical use. Publication reports had no unassessed affected targets left pending. Source checking and later capability evaluation retain distinct statuses.

One ingestion-only repair occurred between the before/after capability runs: rebasing now preserves unfinished source stages instead of jumping ahead to reassessment. File hashes confirm that only `jobs.js` changed; all reading, search, graph and evaluation modules were byte-identical. The complete implementation fingerprints therefore differ, and this is recorded rather than presenting them as identical builds.

The cumulative prompts and criteria were frozen before the two sources were authored into the library. The same coordinator read the sources, designed the cases and authored the accounts; this remains an exposed, supervised demonstration. Original-passages-only and no-library controls received the same three new questions. A further fixed-packet run checked the policy actually being shipped. That default-route verification was added after the adoption decision; it is not a matched fixed-packet before/after experiment.

Each cell below gives the overall grade and cumulative answer-input tokens. An asterisk marks an overrun of the shared 300,000-token ceiling.

| New task | Before: progressive | After: progressive | After: fixed packet | Original passages | No library |
|---|---|---|---|---|---|
| Cross-validation uncertainty and estimands | Partial / 313,286* | Pass / 184,590 | Pass / 97,891 | Partial / 37,929 | Pass / 13,677 |
| Fixed-size comparator-pool effect | Partial / 298,344 | Pass / 154,168 | Pass / 108,530 | Pass / 40,467 | Partial / 13,680 |
| Transfer into an AI-workflow evaluation | Partial / 624,877* | Partial / 344,274* | Pass / 124,057 | Partial / 38,976 | Partial / 13,677 |

The later library supplied explicit signed-rank conditions, connected the three error/performance targets, preserved the historical disagreement and supported a practical transfer with separate critical-failure reporting in the fixed answer. The progressive transfer answer still left protection against averaging away decisive failures insufficiently explicit and exceeded the budget. The before/after cost reductions are descriptive where the before or after answer exceeded the ceiling; they are not matched-budget victories.

The pool-effect repeat changed from partial before ingestion to pass after ingestion through both reading routes. Both earlier retention cases—the Holm stopping rule and the exact source-error correction—passed before and after. The final progressive cumulative run had five passes and one partial; the final fixed route passed all six checks within budget. This supports usable cumulative revision and retention in this demonstration. It does not establish universal expertise, an optional graph advantage, or that the model needs a library for these public-paper questions. The no-library condition already solved the cross-validation problem and much of the pool-effect reasoning; missing historical attribution is an evidence gap, not proof of inability to reason. Original passages also solved the pool case at substantially lower input cost.

The cumulative progressive receipts reported eleven unmet exact-revision obligations across three answers. A separate review found that each had actually been read through a newer reaffirmed revision with identical body, payload, scope, assessments and exact dependencies. The original receipts remain unchanged: this explains the apparent content gap without making different revisions generally interchangeable. The separate transfer completeness failure remains unresolved by that equivalence check.

Coordinator review retained the raw grades and checked the relevant source arithmetic, conditions, disputed attribution requirements and revision equivalence. Additional grader cautions about unqualified normal-limit and sign-test assumptions were checked against source text; the compiled procedures and evaluated answers did not endorse those overstatements. Original sources were not silently corrected. A small set of selected papers and model-graded answers remains a limited evidence base for future operational use.

### Isolation and installed adapter

Native fixed-packet and interactive probes each denied four synthetic external-file reads. The interactive probe also rejected an attempted scope override and read seven fictional accounts through the constrained MCP interface. Receipts bind the runtime policy and state configuration; a mismatched state binding was rejected before evaluation model calls. These probes are meaningful checks of the tested path, not an exhaustive security assessment.

Additional grading evidence requires a frozen authorization naming the configured destination and exact source references or extract hashes. This demonstration used public papers and fictional fixtures. It does not establish permission to send arbitrary private library material to a grader.

The owned plugin and its prior cache were backed up, then updated through the supported Codex plugin command to `1.1.0+codex.202610040600`. A fresh MCP process discovered all ten tools and read all six guides. The repository, owned-plugin and installed-cache machine bindings remained byte-identical; the production corpus still had no published release. This verifies installation without migrating production research.

A separate fresh process used that installed server against the explicitly isolated acceptance binding. All six served guides exactly matched the installed files. Canonical/view verification passed for 182 records; the graph had 182 nodes and 546 edges, and QMD had 216 documents and 526 embeddings. Progressive retrieval used both semantic search and graph traversal without fallback warnings, selected complete accounts were delivered, and an original-page read returned image content. Two retries of the completed publication recovered the existing release and understanding report without advancing the canonical pointer. All three original-source SHA-256 checks passed. These checks establish the tested tool paths, not autonomous skill selection or universal source fidelity.

## 2026-10-01: representative technical-paper pilot on 1.0.2

The supervised pilot completed intake, reading, source review, compilation, publication, live retrieval and application checks for the complete 30-page [Demšar (2006) paper, *Statistical Comparisons of Classifiers over Multiple Data Sets*](https://www.jmlr.org/papers/volume7/demsar06a/demsar06a.pdf). It used an isolated corpus, runtime state, deletion ledger, graph namespace and QMD index. The production corpus still had no published release after the pilot. This is a successful technical-paper acceptance check, not an unattended bulk-ingestion result.

The downloaded and preserved PDF have the same SHA-256: `aa5fa1c71338d0d380e7a97e3503ce486d4e5798069647a8d39f57a1f99a7c8c`. Technical-profile extraction retained Poppler flow/layout text, Docling JSON/Markdown/settings and all 30 original-page renders. All pages were read in primary text and visually inspected. The 121 coverage units were accounted for: 97 completed and 24 alternate layout-text duplicates explicitly excluded; no substantive pages were excluded. All seven numbered tables and seven figures were reviewed, with decisive cells and formulas checked against the original pages. This does not certify every cell in the large empirical table.

Docling omitted displayed formulas and merged some table columns; Poppler flow text also lost useful table alignment. Raw outputs remain unchanged. Authored explanations contain separately checked mathematical reconstructions. The original pages also confirmed source-level issues: some stated two-tailed sign-test cutoffs disagree with exact binomial arithmetic, and a worked Holm table's header conflicts with its formula and values. These are recorded as qualifications of the source account. Unavailable score precision remains unresolved. Printed-rank calculations were reproduced deterministically, and selected exact-binomial checks also agreed with SciPy; classifier experiments and cited publications were not independently reproduced or reviewed.

Publication produced 109 records: one source, 68 passages, five concepts, twelve explanatory knowledge records, three judgments, four learning records, three questions and thirteen relationships. A fresh stdio MCP connection discovered all ten tools, returned original-page pixels and passed canonical/view integrity verification. FalkorDB reported 109 nodes and 328 projected edges; QMD indexed 109 documents with 180 embeddings. Three application retrieval checks used both semantic search and graph traversal without fallback warnings. The sign-test qualification and correctly directed independence prerequisite were present. The initially stopped graph service was started and indexing retried successfully; the failed first receipt is retained separately.

The release was frozen before designing five new application cases. A sixth case deliberately retested a source discrepancy already found during ingestion. Cases were designed by the source-reading coordinator after publication, not by an independent blind designer. A fresh native isolation probe denied all four attempted external-file reads. Answers and graders then ran in separate input-only contexts through the configured Codex account using `gpt-6-astra`; the grader did not receive the original PDF binary. The coordinator checked decisive outcomes against original-page images and deterministic arithmetic.

| Application check | Result |
|---|---|
| Independent data sets versus repeated folds | Pass: distinguished independent units, reliable score estimation and overlapping collections. |
| New Nemenyi all-pairs calculation | Pass: correct critical difference, all four significant pairs and non-equivalence caveat. |
| Holm transfer to six comparisons | Pass: correct thresholds, stop at the first failure and preserve the printed-header discrepancy. |
| Previously unused cells in Table 7(c) | Pass: correct row/column direction, rejection counts versus mean p-values and empirical limits. |
| Known source-error regression | Pass: preserved the printed cutoff while applying the correct exact-binomial decision. |
| Transfer to retrieval-mode evaluation | Pass: rejected dependent paraphrases as independent units and labeled the proposed experiment as a transfer. |

All six answer/grade pairs completed with structured results; none reported citation or rubric errors. The release and proposal stayed frozen. This was one run of the full-library condition: actual answer input ranged from 55,026 to 74,786 tokens. There was no source-only/prose-only comparison, matched evidence-budget experiment or graph-advantage estimate. Large evidence packets remain an efficiency concern. These results support a small supervised migration as a next acceptance step; they do not establish full-book/course/video fidelity, fresh-machine provisioning, broad domain mastery or production-scale performance. Local raw evidence, scripts, case files and model receipts remain outside the release package. No engine, schema or installed-plugin change was needed for this pilot.

## 2026-10-01: version 1.0.2 repair evidence

The twelve reproduced audit groups have targeted regression coverage. Tests use disposable fictional corpora; paid/model calls are stubbed where their orchestration is under test. No production research was migrated or ingested.

| Finding | Repair and exercised boundary |
|---|---|
| F1: failed-publication visibility | Exact reads and selected releases must belong to CURRENT ancestry; failed candidates are rejected while committed history remains readable. |
| F2: accidental reactivation | Ordinary compilation preserves withdrawn, superseded and archived state and supersession history. |
| F3: ownership reassignment | Both compile and direct publication check existing ownership and reject changing a revision's module/family. |
| F4: lifecycle execution scope | Execution and partial-purge resumption recheck current authority, including revoked write permission. |
| F5: maintenance scope | Full exports/formats require unrestricted corpus read authority; restore requires full write authority; wiki reads enforce record visibility. |
| F6: false PDF page boundaries | Tests use real Docling document/provenance objects; disjoint character spans split correctly, overlapping or incomplete spans retain an approximate range. |
| F7: retired judgments | Superseded, withdrawn and archived judgments are excluded from automatic expansion; active judgments still qualify accounts. |
| F8: missing applicability dates | Lifecycle, archive state, conditions and validity dates precede excerpts; expired/future scope gets a dated warning even with a long body. |
| F9: reversed prerequisites | Traversal distinguishes the prerequisite object from the dependent subject. |
| F10: invalid evaluation completion | Frozen inputs/settings and successful attempt receipts are checked. Invalid grader JSON leaves an incomplete run; raw responses and attempts remain available. Runtime manifests validate against the versioned contract. |
| F11: registration crash | A durable initial snapshot recovers after a fault immediately after request persistence, even when the supplied external path is removed. Conflicting idempotency input remains rejected. |
| F12: unreadable EPUB visuals | Actual SVG/GIF/BMP conversion and source-unit reads return PNGs; retained originals match their recorded hashes. |

The full automated suite passes 80 tests on the development installation, with none skipped; its Docling provenance test runs three Python assertions. Real two-page PDF conversions also passed in technical and forced-OCR modes using the installed CPU models, with separate page tokens and raw settings/output retained. The prose profile and extraction-checkpoint retry run through the actual job/unit API, including Windows paths longer than 260 characters. Poppler receives streams so its Windows build does not need to create files at long corpus paths. Original page and SVG preview images were visually inspected. This synthetic fixture checks routing and page ownership, not general OCR or table accuracy.

An isolated copy of the final staged source also passed all 80 tests, the TypeScript build and package checks. It reused the installed locked Node dependencies and an explicitly selected Python runtime; this is a source-packaging check, not clean-machine provisioning. The initial staged check caught and led to fixes for long Poppler output paths and schema newline/hash normalization.

Whole-source hashes and preservation copies now stream; frame/page batches reuse a verified source snapshot and check file identity during extraction. A regression confirms changed originals and conflicting immutable copies are rejected. No new large-media benchmark is claimed. The coordinator remains TypeScript, and record schema version remains 1.1.0; no corpus migration is required. Legacy evaluation reports remain readable within their existing project and full-library permission boundary, but new execution requires a version 2 run.

The local plugin source and installed Codex cache were refreshed to 1.0.2. All 32 packaged files match the development package by hash, including the unchanged machine-local MCP launcher. A fresh MCP connection from the bound workspace reported engine 1.0.2, ten tools and the revised PDF guide. The production corpus still had no published release. The evaluator launcher was updated locally from a removed app-version path to the verified `codex` command on PATH; no live model evaluation was performed during this repair. An already-running chat may need a restart to load the refreshed server.

Fresh-machine setup, a complete real-book/course pilot and a comparison with equal evidence budgets remain separate acceptance work. The repair suite does not establish broad domain mastery or a general advantage for graph retrieval. The application permission model is not an operating-system security boundary.

## 2026-10-01: audit reproduction and migration readiness

Reran supplied audit reproductions against source commit `f5a5508f754f752b8a4dfde292923032d3ef86f2` in isolated fictional corpora. The central case in each of twelve reported finding groups reproduced. These were re-executions of the supplied probes, not twelve independently designed tests; related variants described by the audit were not all executed. No production research was imported, modified or purged.

The reproduced findings at that baseline were:

- Exact-revision reads can expose a candidate from a failed publication even though CURRENT has not changed.
- Editing a withdrawn record through compile can reactivate it without an explicit lifecycle decision.
- A module-scoped writer can replace an inaccessible existing identity by assigning the replacement to a writable module.
- A read-only binding can execute an owner-prepared purge plan without its current authority being checked; full-backup export can also copy material outside the binding's read scope.
- A multi-page Docling text item can be attributed in full to one physical-page text unit, leaving a misleading exact locator.
- Retrieval can present a superseded judgment as current, omit validity dates, or label a dependent record as a prerequisite when traversing a relationship backwards.
- Evaluation can accept changed frozen cases and an invalid grader response as a completed run.
- A request written before its ingestion job can leave retries failing instead of recovering.
- An EPUB SVG can be registered as a visual unit that the unit reader cannot return.

Some probes used mocked graph/search operations and a stub grader to isolate engine behavior. The ingestion interruption was a constructed on-disk crash state, not a process-kill experiment. Application bindings are not an OS security boundary, but their documented isolation and read-only semantics must still hold across every engine entry point.

The earlier 54 passing tests remain evidence for their covered cases. They do not establish the guarantees these probes violate. Repair and regression-check publication visibility, lifecycle preservation and operation-level scope enforcement before live migration; then verify retrieval meaning, evaluation integrity and ingestion recovery. The repair evidence below supersedes that unresolved status; the baseline findings remain here for traceability.

## Approved PDF extraction policy

The owner approved this policy on 2026-10-01. Version 1.0.2 implements complementary extraction and the page-boundary repairs. The book workflow requires meaningful visual inspection; successful conversion remains insufficient evidence of a faithful reading.

| Source characteristics | Route and purpose |
|---|---|
| Clean, mostly prose PDF with a usable text layer | Use Poppler flow/layout output for reading and a candidate chapter map. Verify chapter boundaries against the printed contents and headings; inspect meaningful visuals. Docling is optional if those checks find no structural problem. |
| Technical book with consequential mathematics, tables or complex columns | Retain both Poppler and Docling outputs by default. Poppler supplies an independent text/layout view; Docling supplies alternative layout, table structure and symbol recognition. Silent label or symbol errors justify the second pass even when the first looks plausible. |
| Scanned pages, absent text, or a damaged embedded text layer | Use an OCR route, including Docling with OCR configured appropriately. Consider forced full-page OCR when native text is misleading. Check the resulting text against page images. |
| Tables | Use Docling's table structure as a candidate, compare Poppler layout, and verify consequential row/column labels, cells, blank cells, signs and units against the original. Matching totals or cell counts cannot detect a permutation. |
| Code | Start with Poppler layout and the original page; verify indentation, wrapping and operators. A version-matched source repository may provide additional evidence. Docling output alone is not authority for executable code. |
| Displayed equations, diagrams and rotated/spanning tables | Inspect original-page images at useful resolution and reconstruct only what is legible. Docling formula enrichment is a separate optional model step; the installed configuration has it off. Neither ordinary conversion nor an image placeholder proves the content was decoded. |

Keep raw outputs from both routes, including Docling's structured output, with source hash, tool versions, settings and physical-page provenance. Keep AI reconstructions separate from raw extraction. Check multi-page text spans instead of assigning the entire item to its first page. A consequential unresolved cell, formula or label must remain a visible limitation and cannot support a settled conclusion.

Historical research notes support complementary extraction, but their exact counts and claims describe earlier runs whose raw Docling output was not available for this review. They do not establish that Poppler always drops Greek symbols or that Docling generally wins on tables. The September 30 sample below also found Docling failures. A parser's output must earn trust passage by passage.

Docling documents [optional formula/code enrichments](https://docling-project.github.io/docling/usage/enrichments/) separately from its ordinary conversion pipeline. Any added model step needs its own local cost and fidelity check before becoming a default.

## Version 1.0.1 — 2026-09-29

The updated engine passed 54 automated tests, TypeScript compilation, formatting, bundled-contract/link checks and staged release checks. The same 54 tests, build, formatting and package checks passed from an isolated copy of the staged source. That copy reused the existing locked Node installation and explicitly selected the installed Python converter; this does not establish clean-machine dependency provisioning. No test was skipped on this installation.

The added checks cover warm-cache mutation/revision/scope/deletion behavior, concurrent policy changes, cache eviction, junction replacement, worker timeout/crash/queued-request cancellation, an index-only search contribution, failed/incomplete graph builds and UTF-8 conversion under a legacy Windows encoding. [Performance methodology and measured limits](PERFORMANCE.md) separate canonical retrieval, graph writing and CPU semantic search.

The local plugin and Codex cache were refreshed to 1.0.1 and all 31 packaged files matched by hash. The machine-local MCP configuration remained unchanged. A fresh installed MCP connection reported engine 1.0.1 and ten tools, confirmed the production corpus still had no published release, and retrieved the correct Table D.2 account from the final isolated test release. Canonical records, locators and all 71 projected wiki pages passed final verification; graph and semantic search reported the matching release as ready. An already-running desktop session may still need a restart to load its refreshed plugin/server.

### Real public-source ingestion

The isolated acceptance corpus used [NIST Technical Note 1297](https://www.nist.gov/pml/nist-technical-note-1297), the supplied PDF labelled 1994 edition, plus a retained official web-appendix text snapshot to resolve damaged mathematical glyphs. These are two representations of one underlying evidence family. The work describes the historical source, not current institutional policy or a current SI audit.

All 27 physical PDF text pages and page renders were reviewed, with critical equation/table pages inspected individually. The normal ingestion stages registered 56 coverage units, compiled 68 canonical records, and built a 68-node/228-edge FalkorDB projection, 68 wiki pages and QMD embeddings. The first complete projection build took about 7 minutes 23 seconds, mostly CPU embedding, and produced 140 embedded chunks. This is a small technical document, not a throughput benchmark for long books or videos.

The frozen first corpus was tested with six application questions generated in a separate input-only context from original source material and visual-reading notes. The compiler had not seen those questions before freezing its records. New answer contexts compared original passages, compiled prose/passages without optional graph expansion, and the full graph-assisted route. Separate model contexts graded against source-grounded criteria. All conditions used the same model alias, `gpt-6-astra`, at medium reasoning effort. Four compiled attempts accidentally began while indexing was unfinished; their fallback results were retained separately and replayed after verifying both indexes were ready. They are not counted as indexed results.

### Evaluator error and correction

The initial grading reported five passes and one partial for every route. That was not a valid final result: the source-reader note and question rubric incorrectly placed the mean-test-bed-temperature 5.8 nm entry in systematic / Type A. The original page puts it in random / Type A, and all three original answers and the extraction correctly followed that placement. The text-only graders could flag the conflicting evidence but could not inspect the image themselves.

Worse, an attempted repair initially trusted the faulty evaluator note and introduced its wrong placement into the compiled account. A direct reinspection of the original page caught that error. The mistaken evaluation, answer attempts and publication remain preserved; a subsequent revision restores the source meaning. This is an evaluator/authoring failure, not a source-extraction defect on that cell. It demonstrates why automated test feedback must not be treated as unquestionable evidence for rewriting a library.

The current 71-record corpus retains the original PDF and extraction, includes the complete table with correct row identities, makes its qualifications retrievable, distinguishes content fidelity from byte integrity, and explicitly groups the PDF/web presentation into one evidence family. The table question is now an exposed regression case. Original answers are regraded separately without rewriting their text; any genuine remaining application or citation issues remain visible.

Regrading the unchanged original answers with corrected grounding produced:

| First frozen corpus, corrected assessment | Pass | Partial | Fail |
|---|---:|---:|---:|
| Source passages | 5 | 1 | 0 |
| Compiled prose/passages | 6 | 0 | 0 |
| Full graph-assisted retrieval | 6 | 0 | 0 |

The remaining source-only partial concerns a different error: that answer inferred a contradiction merely because a comparator component named “random effects” appears in the current-process systematic column. The two compiled routes correctly distinguished the component label from its role in the current process. This single case is suggestive, not a controlled estimate of synthesis benefits; it shows no additional graph advantage over the prose route.

Two further questions, generated after freezing the intermediate release, tested calibration-versus-customer-use reporting and method-defined measurands. Both answers passed and did not rely on the erroneous table cell. One grader nevertheless repeated the incorrect table-error annotation as unrelated background. Those runs remain separately identified as intermediate-release evidence, not proof that the attempted repair was valid.

The final corrected release passed the exposed table regression in both compiled-prose and full graph-assisted conditions, with no cited-record errors reported. Both correctly distinguish the comparator's systematic / Type A classification from the bed temperature's random / Type A classification and the temperature difference's random / Type B classification. Direct source inspection, unchanged extraction, retrieved row account and the final answers now agree. This is a repair/regression result, not another independent test case.

### Interpretation limits

This small comparison does not establish a general accuracy advantage for the graph or compiled prose. Source-only model inputs were approximately 47,735–49,413 tokens, prose inputs 55,613–61,610, and graph-assisted inputs 57,273–63,302. These are provider-reported input totals, not isolated evidence-token counts; packets were not matched to an equal token budget. The source-only route already supplied much of this short document. Full dependency/qualification context can be expensive: `limit` controls retrieval seeds, not a hard token ceiling.

This is a small source-fidelity/application check with model-generated cases and same-model-family grading, not a domain-mastery estimate, proof of general product quality or a controlled graph ablation. The prose-only route retains mandatory canonical qualifications and provenance; it disables optional graph expansion rather than stripping safety-critical context. Text-only graders cannot inspect PDF pixels; visual facts were independently checked by the source reader and included in the source grounding. This public source may also be familiar from model training. No inter-author disagreement, long-video transcription, modern metrology validity or whole-domain research depth was established. No paid transcription or hosted embedding API was used, and the production research corpus was untouched.

## 2026-09-30: targeted PDF extraction comparison

Compared eight selected pages from each of two existing research books: a trading text and a mathematical statistics text. The same 16 pages went through the installed Docling 2.130.0 converter, Poppler text extraction, and Astra reading original-page images through Codex. This was a diagnostic sample, not two complete-book ingestions or a test of ChatGPT's PDF-upload service. Excerpts, raw outputs and detailed checks remain private.

The current Docling configuration uses four CPU threads, OCR and accurate table structure, with optional formula enrichment off. It preserved one wide numerical table well, but another table lost a cell, a formula table collapsed three rows into one, and one page yielded only an image placeholder. Individual-page reruns reproduced the missing cell, a separate scrambled table and the image-only page. Page images were still retained, so the visual evidence was available even when the text was unusable.

The multi-page run also produced text items spanning different pages. The current Markdown-per-page export can therefore include words from another page under a single-page locator. Non-contiguous excerpt assembly may exaggerate that joining behavior. Its whole-book frequency was not measured. Page provenance needs checking before relying on those locators as exact text boundaries.

Poppler layout text kept the checked table alignment and values more usefully in this sample, but inherited errors already present in a PDF text layer and produced awkward mathematical notation. Astra reconstructed the checked table cells and displayed formulas more usefully, but changed a source word from "trader" to "dealer" and left some small figure labels unresolved. AI transcription is not a guaranteed verbatim copy.

Observed conversion times per eight-page excerpt: Poppler layout 0.33 and 0.06 seconds, Docling 24.5 and 29.9 seconds, Astra image transcription about 182 and 180 seconds. These routes do different work. Poppler timing excludes rendering, and model timing depends on the service. No full-book latency, aggregate accuracy percentage or general parser ranking follows from these runs.

**Current limitation:** successful conversion does not establish complete or faithful PDF text. The book workflow's original-page inspection remains required. Version 1.0.2 subsequently implemented the combined route and stronger page-boundary checks described above. No production source was ingested or changed.

## Earlier baseline evidence

| Evidence | Result and boundary |
|---|---|
| Automated suite after portability changes | 39 tests passed: canonical integrity, scope, lifecycle/recovery, source workflow, uncertain paid-request handling, native/selected-WSL argument routing, configurable state and no-overwrite setup |
| TypeScript build | Passed with the version-guarded FalkorDB client patch and generated schema types |
| Bundled schemas/configuration | Engine contract hashes, corpus example and relative links checked by packaging script |
| Isolated staged checkout | All 39 tests and package checks passed from the files selected for Git, with the existing locked dependency installation shared; private sibling research fixtures/configuration were absent |
| External-server profile | Authenticated PONG from the existing local FalkorDB using a separate state/configuration and `falkordb-external`; no graph modification or new service provisioning |
| Original local book/video tools | Earlier synthetic native video-frame/crop and PDF page-rendering checks passed; paid requests were mocked |
| Original local graph/search/wiki | Previously exercised publication, graph reconstruction, QMD lexical/semantic retrieval and wiki projection |
| Real long books/videos | No general throughput or mastery claim; representative full-source acceptance is still required |
| Paid speech requests | No paid transcription performed during packaging |
| Docker/native service provisioning | Not performed. External-server connection support does not establish image setup, restart or persistence correctness |
| Other harnesses / shared writers | Not validated or enabled by this packaging work |

Run `npm test`, `npm run build` and `npm run check:package` on a new checkout. Pure text fixture tests do not require the primary personal corpus. Live conversion, database, model/search and MCP checks need configured dependencies and must report their own outcomes.

Small earlier application checks distinguished source-only and full-library answer paths but did not demonstrate broad expert mastery or consistent superiority. Structural correctness, faithful source reconstruction and independent application are separate validation targets.

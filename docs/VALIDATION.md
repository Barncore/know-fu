# Validation status

The local development installation is Windows with Ubuntu WSL2, regular FalkorDB and CPU QMD. This repository is a reusable source baseline; not every deployment option has been provisioned on a fresh machine.

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

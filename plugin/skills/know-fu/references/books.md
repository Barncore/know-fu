# Books, papers and supplied documents

Use this alongside the main [ingestion guide](ingestion.md). What you're after is a faithful account that someone could explain and apply from: the author's reasoning, the examples that matter, the assumptions and the disagreements. A chapter summary or a bag of claims can't stand in for actually reading the requested material.

## Establish the reading scope

Work out which edition you were actually given, from its title, copyright and preface pages. If the printing is ambiguous, record it as ambiguous rather than picking one. Tell the original apart from any supplied distillations, slides and earlier interpretations. A duplicated PDF, its summary and a lecture repeating it are one evidence source, not three, however convincing the chorus sounds.

Register originals with `kb_ingest`. PDFs produce text and visual units per physical page; EPUBs follow their spine order. Account for every substantive chapter, sidebar, exercise and appendix within the requested scope, and classify covers, blank pages, bibliography and index separately. Reading a bibliography entry is not reading the cited work, and reading an exercise is not solving it. When the user asks for selected chapters, keep that boundary and never call it a full-book reading.

Keep physical PDF page numbers separate from printed page labels. Check the mapping at section transitions, because Roman numerals, inserts or missing leaves can break a single offset. Put the verified mapping, the edition evidence and the chapter ranges in a source review. Never silently replace the tool's locators with guessed printed pages.

## Read, reconstruct and check

Choose the PDF extraction profile when you call `kb_job {action:"convert"}`:

| Profile | Use it for | What it runs |
|---|---|---|
| `pdf_profile:"technical"` (default) | Technical material | Poppler flow and layout text, Docling structured and Markdown output, and original-page images together |
| `"prose"` | Clean, mostly textual PDFs, after you've checked the text layer and structure | Poppler and images, without Docling |
| `"ocr"` | Scans, missing text, or embedded text that misleads | Full-page Docling OCR, with Poppler and images kept for comparison |

For a book, check a few pages of the text layer (`pdftotext` on a sample, or the first `kb_read` of pages) and start with `prose` when it reads cleanly. On a 364-page book `prose` converted in 12 seconds where `technical` took 19 minutes, and the readers checked tables against the page images either way. Keep `technical` for table-heavy or technical material, and `ocr` for scans. Under MCP, a conversion still running after about three minutes carries on in the background: check it with `kb_job {action:"next"}` rather than converting again.

Formula enrichment stays off. Record the profile, versions, settings and extraction limits with the reading evidence.

Tables are where extraction most often lies with a straight face. For technical tables, compare the two readings, then check the row and column labels, blank cells, signs, values and units that matter against the page image. Parsers agreeing, totals matching and cell counts matching can't catch a shared text-layer error or rows in the wrong order. For code, check indentation, wrapping and operators against the original. For equations and diagrams, reconstruct only notation and labels you can actually read. A plausible extraction still needs these checks. Keep AI reconstructions separate from raw outputs, and record any unresolved detail that matters as a limitation. When you've checked a note's wording or numbers against the page image, record that as its `fidelity` assessment ([notes.md](notes.md)).

Docling text that spans several pages is split only when separate character spans show which page owns which text. An ambiguous item keeps an approximate page range; check its original pages before narrowing the locator. Knowing which physical page text came from tells you where it is, not that the wording is faithful. EPUB image previews keep their original asset and hash. An animated preview shows only the first frame, so review any later frames that matter separately.

Read complete source units and follow pagination. For a PDF, `kb_read {kind:"pages", job_id, from, to}` serves a run of pages' flow text in one call, each page counted as read, with each page's image unit id and a `figure_hint` where the text names a figure or table or holds almost no text. Inspect meaningful figures, table relationships, captions, equations, algorithms and code. When extraction loses symbols or layout, look at the page image. `kb_job {action:"crop"}` gives an unscaled region of an existing visual unit. If the first render lacks detail, `kb_job {action:"pages", job_id, source_id, pages:[...], scale:3}` renders those pages again at higher resolution from the preserved PDF, with provenance for the physical page, the render settings and the hash. Never upscale unreadable pixels and call the result verified.

Then do the real work: reconstruct each section's argument before combining it with others. What problem does it address, why should the method work, what are its premises, examples and boundary conditions, and what's left to judgment? Keep each author's account distinguishable before you synthesize agreement or disagreement. Interpretive uncertainty belongs in the account itself, not only in the work log.

Recompute a formula, table comparison or algorithmic example when a discrepancy or an application depends on it. Record the inputs, units, method, and what the check actually establishes. A synthetic calculation is not an independent reproduction of a published experiment. Keep the original wording and the checked correction side by side, each with its locator, and never rewrite the author into agreement with the check.

Compare earlier distillations only after you've formed the source account. Track whether each earlier conclusion is supported, qualified, corrected or still unverified. Check implementation facts that change over time against current primary documentation when needed; that check is separate from what the historical book says. Domain research skills can help with substantive checks when they're available. This workflow doesn't need a trading skill, and it never carries trading assumptions into other domains.

## Long books: a book map, then readers in parallel and one writer

A book that won't fit comfortably in one conversation (as a rough line, more than about 40,000 tokens of text, or 60 to 80 dense pages) can't be read well in one. The conversation fills up partway through, and the harness compacts it, so by chapter 8 the early chapters survive only as a summary nobody chose. If your harness has subagents, read a long book with several readers at once, so every chapter is read in full and the whole book stays in view. A paper or short book that fits gets one reader: you.

1. Map the book first. Skim the contents, the preface or introduction, each chapter's opening and closing pages, and the conclusion. Write a short map: the book's argument in a paragraph, its key terms, and for each chapter what it covers, which earlier chapters it builds on, and its size in pages. Name the chapter that owns each key concept and reserve a slug for it (`compressor`, `masking`), so a reader in a later chapter can link to the concept before anyone has staged it. Save the map with `kb_job {action:"source_review", review_id:"book-map"}` so it's on record with the job. Skimming for the map isn't reading; the readers do that.
2. Split the book into spans along chapter boundaries, and record them in the map. The readers run at the same time, so the slowest span sets the pace: one chapter per span is the default, and short neighbouring chapters that make one argument can share a span. Split a chapter that's over the size line at its section boundaries.
3. Start every reader at once, one fresh subagent per span. Each gets the job id, its span's physical pages, the book map with its reserved slugs, the guides, and a drafts folder and working file of its own. It reads every page in its span to the end, a run of pages per call with `kb_read {kind:"pages"}`, and opens a page image where `figure_hint` is set or the text describes a visual. It writes each note once, as its own file in its drafts folder, linking to reserved slugs and to notes in its own span. It submits its own reconstruct receipts by page range (see the reading record below). It never calls `kb_write`, never submits a later stage and never publishes; it returns its digests, its note list and where its drafts are.
4. Every chapter gets a digest, even inside a joined span, so the whole-book work always has something to build on. A digest is a few hundred words: what the chapter established, the terms it defined, what it left open, and its key notes by slug with the pages they rest on. The reader writes its digests in its working file and puts them in the summary of its last reconstruct receipt. Once the last unit of the book is receipted the stage moves on, and a later reconstruct receipt is refused, so the digests go in with the coverage, not after it.
5. You are the only writer. Stage the drafts folders with `kb_write {job_id, paths:[...], proposal_id}` in map order, so each reserved slug is staged before, or with, the notes that link to it: wait for the readers of earlier chapters, or stage several folders in one call (up to 1,000 notes). Give each folder a stable `proposal_id`, such as `span-3`. When notes fail, nothing is staged; send each reader its failing notes and their errors (Claude Code: `SendMessage` to that reader; Codex: `send_message`), so it fixes those fields in place with its reading still in context, then stage the folder again. To change notes after they're staged, stage their folder again with the same `proposal_id` and `replace: true`; any other restaging of a staged slug is refused, since it would publish a second copy. Staging from one place keeps the job's slugs whole, and it's where you catch two readers writing the same idea: merge those into one note before you stage. Then do the whole-book work yourself. Work from the digests and notes, and go back to the pages only when something needs checking. Write what crosses chapters: links between notes from different chapters, and a synthesis of the book's overall argument. Then compare it all with what the library already held, and carry on with integrate, discover, reweave, compile and check as usual. Keep the map, the digests and the drafts folders outside the library while the ingest runs, so a later session can pick up where this one stopped, and delete them after publishing.

The weak point: a reader sees the rest of the book only through the map, so whatever the map left out is invisible to it. Your cross-chapter pass and the check stage are the guard. If readers duplicate each other a lot, or miss what later chapters do with an idea, add a pause: each reader returns its digests before writing notes, you send every reader all the digests, and then they write.

Readers in parallel use about the same tokens as readers in sequence, just faster, so a usage limit arrives sooner and stops them all at once. Launch them in waves of up to five, and keep their drafts and working files on disk so a stop loses little.

## Keep a usable reading record

Use `kb_job {action:"source_review"}` with `source_id`, a stable `review_id` and a `review`, for example:

```json
{
  "summary": "What was actually read and the important limits of that reading",
  "identity": {"edition": "Observed edition or explicit uncertainty", "evidence_unit_ids": []},
  "page_mapping": [{"physical_range": [1, 12], "printed_labels": "Observed labels; no inferred universal offset"}],
  "sections": [{"title": "Section name", "physical_range": [13, 24], "status": "read", "limitations": []}],
  "evidence_unit_ids": [],
  "visual_review": "Meaningful visuals inspected and any unresolved detail",
  "checks": "Bounded checks performed, their results and what was not reproduced",
  "limitations": []
}
```

That's a flexible example, not a quota or a fixed book schema. Use real source ranges and evidence ids. A review record keeps your work but doesn't publish knowledge. Carry the identity, mapping, findings, checks and limits that matter into canonical source metadata, explanatory records and the relevant judgments through `kb_write` notes ([notes.md](notes.md)). The original source hash stays the identity anchor.

Submit real reading receipts as you go, by page range for a PDF: `coverage:[{pages:[67,88], representation:"text", status:"complete"}, {pages:[67,88], representation:"image", status:"excluded", reason:"No figure on these pages"}]`. A range covers every matching unit on those pages. Inside an excluded range, any unit `kb_read` served in full still counts as read, so "the images I didn't open" is one line. A page's layout text is recorded as covered once its flow text is read, so it needs no entry. Name units one by one only for exceptions. Integrate the section accounts into the whole source and into the existing library where it's affected. Teaching routes, exercises, worked applications and grounded questions grow out of that account where they're useful. Update the current explanations and navigation, keeping stable identities and the history of corrections.

Before publication, check source locators, coverage of meaningful visuals, unresolved disagreements, and a few representative retrieval and application questions. Be precise about independent review: a second look at the implications is not a second reading of every page. When independent review isn't available, just say so; never manufacture a review receipt.

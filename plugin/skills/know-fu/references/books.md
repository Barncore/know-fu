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

Formula enrichment stays off. Record the profile, versions, settings and extraction limits with the reading evidence.

Tables are where extraction most often lies with a straight face. For technical tables, compare the two readings, then check the row and column labels, blank cells, signs, values and units that matter against the page image. Parsers agreeing, totals matching and cell counts matching can't catch a shared text-layer error or rows in the wrong order. For code, check indentation, wrapping and operators against the original. For equations and diagrams, reconstruct only notation and labels you can actually read. A plausible extraction still needs these checks. Keep AI reconstructions separate from raw outputs, and record any unresolved detail that matters as a limitation. When you've checked a note's wording or numbers against the page image, record that as its `fidelity` assessment ([notes.md](notes.md)).

Docling text that spans several pages is split only when separate character spans show which page owns which text. An ambiguous item keeps an approximate page range; check its original pages before narrowing the locator. Knowing which physical page text came from tells you where it is, not that the wording is faithful. EPUB image previews keep their original asset and hash. An animated preview shows only the first frame, so review any later frames that matter separately.

Read complete source units and follow pagination. Inspect meaningful figures, table relationships, captions, equations, algorithms and code. When extraction loses symbols or layout, look at the page image. `kb_job {action:"crop"}` gives an unscaled region of an existing visual unit. If the first render lacks detail, `kb_job {action:"pages", job_id, source_id, pages:[...], scale:3}` renders those pages again at higher resolution from the preserved PDF, with provenance for the physical page, the render settings and the hash. Never upscale unreadable pixels and call the result verified.

Then do the real work: reconstruct each section's argument before combining it with others. What problem does it address, why should the method work, what are its premises, examples and boundary conditions, and what's left to judgment? Keep each author's account distinguishable before you synthesize agreement or disagreement. Interpretive uncertainty belongs in the account itself, not only in the work log.

Recompute a formula, table comparison or algorithmic example when a discrepancy or an application depends on it. Record the inputs, units, method, and what the check actually establishes. A synthetic calculation is not an independent reproduction of a published experiment. Keep the original wording and the checked correction side by side, each with its locator, and never rewrite the author into agreement with the check.

Compare earlier distillations only after you've formed the source account. Track whether each earlier conclusion is supported, qualified, corrected or still unverified. Check implementation facts that change over time against current primary documentation when needed; that check is separate from what the historical book says. Domain research skills can help with substantive checks when they're available. This workflow doesn't need a trading skill, and it never carries trading assumptions into other domains.

## Long books: a book map, then readers in order

A book that won't fit comfortably in one conversation (as a rough line, more than about 40,000 tokens of text, or 60 to 80 dense pages) can't be read well in one. The conversation fills up partway through, and the harness compacts it, so by chapter 8 the early chapters survive only as a summary nobody chose. If your harness has subagents, read a long book in stages so that every chapter is read in full and the whole book stays in view. A paper or short book that fits gets one reader: you.

1. Map the book first. Skim the contents, the preface or introduction, each chapter's opening and closing pages, and the conclusion. Write a short map: the book's argument in a paragraph, its key terms, and for each chapter what it covers, which earlier chapters it builds on, and its size in units. Save it with `kb_job {action:"source_review", review_id:"book-map"}` so it's on record with the job. Skimming for the map isn't reading; the readers do that.
2. Split the book into spans along chapter boundaries. One chapter per span is the default, because each chapter then gets its own reader and its own digest. Join short neighbouring chapters into one span when they make one argument and together stay under the size line, because reading them in one context keeps their cross-references live instead of passing them through a digest. Split a chapter that's over the line at its section boundaries. Record the spans in the map. The 40,000-token line is a starting guess: if readers run out of room, shrink it, and if they finish with plenty to spare, grow it.
3. Read the spans in order, one fresh subagent per span, never in parallel. A reader can only build on chapters whose digests already exist. Each reader gets the job id, its span's unit ids, the book map, the digest of every earlier chapter, and the note list (slug, title, one-line summary) of the chapters the map says this span builds on. It follows this guide and the notes guide like you do. It reads every unit in its span to the end, writes the span's notes with `kb_write` in the same job, linking to earlier notes by slug, and submits a reconstruct receipt for its units. It never submits a later stage or publishes. When it needs an exact detail from an earlier chapter, it re-reads the units that chapter's digest names, because a digest is a pointer, not evidence.
4. Every chapter gets a digest, even inside a joined span, so later chapters always have something to build on. A digest is a few hundred words: what the chapter established, the terms it defined, what it left open, and its key notes by slug with the units they rest on. The reader returns its digests and note list to you and also puts them in its receipt's summary, so they stay with the job. For a split chapter, the reader of the last part writes the chapter's digest from the parts.
5. Do the whole-book work yourself once the last span is done. Work from the digests and notes, and go back to the pages only when something needs checking. Write what crosses chapters: links between notes from different chapters, and a synthesis of the book's overall argument. Then compare it all with what the library already held, and carry on with integrate, discover, reweave, compile and check as usual. Keep the map and digests in a working file outside the library while the ingest runs, so a later session can pick up where this one stopped, and delete it after publishing.

The weak point: a later reader sees earlier chapters only through their digests and notes, so whatever those left out is invisible to it. Your cross-chapter pass and the check stage are the guard. When a check answer needs something the notes don't hold, go back to the pages.

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

Submit real reading receipts per unit as you go. Integrate the section accounts into the whole source and into the existing library where it's affected. Teaching routes, exercises, worked applications and grounded questions grow out of that account where they're useful. Update the current explanations and navigation, keeping stable identities and the history of corrections.

Before publication, check source locators, coverage of meaningful visuals, unresolved disagreements, and a few representative retrieval and application questions. Be precise about independent review: a second look at the implications is not a second reading of every page. When independent review isn't available, just say so; never manufacture a review receipt.

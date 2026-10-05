# Books, papers and supplied documents

Use this with the common ingestion guide. The aim is a faithful account that supports explanation and application, including the author's reasoning, consequential examples, assumptions and disagreements. A chapter summary or a bag of claims is not a substitute for reading the requested material.

## Establish the reading scope

Identify the actual supplied edition from title, copyright and preface pages. Preserve ambiguous printings as ambiguous. Distinguish the original from supplied distillations, slides and earlier interpretations. A duplicated PDF, its summary and a lecture repeating it are not three independent evidence sources.

Register originals with `kb_ingest`. PDFs yield physical-page text and visual units; EPUBs follow their spine order. Account for substantive chapters, sidebars, exercises and appendices within the requested scope. Separately classify covers, blanks, bibliography and index apparatus. Reading a bibliography entry does not mean reading the cited work; reading an exercise is not solving it. For a selected-chapter request, preserve that boundary rather than calling it a full-book reading.

Keep physical PDF page numbers separate from printed labels. Inspect the mapping at section transitions, since Roman pages, inserts or missing leaves can defeat a single offset. Put the verified mapping, edition evidence and chapter ranges in a source review; do not silently replace tool locators with guessed printed pages.

## Read, reconstruct and check

Choose the PDF extraction profile when calling `kb_job` action `convert`: `pdf_profile:"technical"` (default), `"prose"`, or `"ocr"`. Technical material keeps Poppler flow/layout text, Docling structured/Markdown output and original-page images together. Use prose for clean, mostly textual PDFs after checking their text layer and structure; it omits Docling. Use OCR for scans, missing text or misleading embedded text; it forces full-page Docling OCR while retaining Poppler and images for comparison. Formula enrichment remains off. Record profile, versions, settings and extraction limitations with the reading evidence.

For technical tables, compare the two readings and check consequential row/column labels, blank cells, signs, values and units against the page image. Agreement, matching totals and matching cell counts cannot detect a shared text-layer error or a row permutation. For code, check indentation, wrapping and operators against the original; for equations and diagrams, reconstruct only legible notation and labels. A plausible extraction still needs these checks. Keep AI reconstructions separate from raw outputs and preserve unresolved consequential details as limitations.

Docling text spanning several pages is split only when disjoint character spans establish page ownership. An ambiguous item is retained with an approximate page range. Check its original pages before narrowing the locator. Physical-page attribution establishes location, not verbatim fidelity. EPUB image previews retain their original asset/hash; animated previews show only the first frame and require separate review of consequential later frames.

Read complete source units, following pagination. Inspect meaningful figures, table relationships, captions, equations, algorithms and code. When extraction loses symbols or layout, inspect the page image; use `kb_job` action `crop` for an unscaled region of an existing visual unit. If the initial render lacks sufficient detail, use `kb_job {action:"pages",job_id,source_id,pages:[...],scale:3}` for a higher-resolution render from the preserved PDF. It registers physical-page, render-setting and hash provenance. Do not upscale unreadable pixels and call the result verified.

Reconstruct each section's argument before combining it with others: what problem it addresses, why the method should work, its premises, examples, boundary conditions and what remains discretionary. Keep individual authors' accounts distinguishable before synthesizing agreement or disagreement. Interpretive uncertainty belongs in the account, not just the work log.

Recompute a consequential formula, table comparison or algorithmic example when a discrepancy or an application depends on it. Record inputs, units, method and the conclusion the check actually establishes. A synthetic calculation is not an independent reproduction of a published empirical experiment. Keep original wording and the checked correction side by side with their locators; do not rewrite the author into agreement with the check.

Compare earlier distillations after forming the source account. Track whether prior conclusions are supported, qualified, corrected or still unverified. Verify changing implementation facts against current primary documentation when needed; that check is separate from what the historical book says. Domain-specific research skills may help with substantive checks when available, but this workflow does not require a trading skill or import trading assumptions into other domains.

## Persist a usable reading record

Use `kb_job` action `source_review` with `source_id`, a stable `review_id`, and `review`, for example:

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

This is a flexible example, not a quota or a universal book schema. Use real source ranges and evidence IDs. Review records preserve work but do not themselves publish knowledge. Carry consequential identity, mapping, findings, checks and limitations into canonical source metadata, explanatory records and relevant judgments through `kb_write` notes ([notes.md](notes.md)). Keep the original source hash as the identity anchor.

Submit actual per-unit reading receipts as work progresses. Integrate the section accounts into the whole source and the affected existing corpus. Teaching routes, exercises, worked applications and grounded questions should grow out of that account where useful. Update the current explanations and navigation, preserving stable identities and the history of corrections.

Before publication, check source locators, meaningful visual coverage, unresolved disagreements and representative retrieval/application questions. Describe independent review accurately: a second review of implications is not a second reading of every page. Preserve limits when independent review is unavailable; never manufacture a review receipt.

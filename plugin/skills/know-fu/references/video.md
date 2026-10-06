# Recorded courses, video and audio

Use this alongside the main [ingestion guide](ingestion.md); mixed courses also need the [books guide](books.md) for slides and readings. A course teaches through speech, diagrams, demonstrations and the order they come in, and your job is to reconstruct all of that. A transcript on its own doesn't show you understood what was on screen.

## Source inventory and paid preflight

Start by taking stock: the logical lessons, physical parts, original media, supplied audio, transcripts, slides and screenshots. Confirm how they relate from their content, using several matching landmarks. Similar durations, filenames or an old screenshot index are hints about a mapping, nothing more. Keep times local to each part unless a global offset is verified. Keep audience answers, teacher statements and your own interpretation apart.

Register originals once. Record verified relationships through source provenance and scoped records; supplemental material doesn't independently corroborate the lesson it accompanies. Keep the highest-quality originals and screenshots at their original resolution.

The installed adapter transcribes through APIs, with no local Whisper needed. Configure separate decoders for wording and for timing and comparison in the runtime `transcription.models` list. The established pairing is GPT transcription for wording and the Whisper API for word and segment timing; check that model ids, prices and provider features are current. With only one decoder configured, say plainly that comparison coverage is reduced.

This part costs real money, so plan before you spend. Call `kb_job {action:"media_plan", job_id}` before uploading anything. It probes all media and estimates both decoders, the overlaps and a reservation margin, without paid requests. The whole job needs a real authorized `paid_budget {limit, currency, authorization}`. If the user makes enough account balance a condition, get a current balance or their confirmation before uploading, because the plan can't see account credit. Never reuse another task's old allowance.

Conversion uses five-minute core intervals with eight-second margins, and keeps the requested offsets, encoded duration, audio hashes, raw API responses and request ids. Those are preparation defaults you can configure, not meaningful boundaries in the material. A completed result is reused only when the plan and hashes match. A request that is unknown, submitted or rejected blocks automatic repetition: keep any possible charge on record and investigate before an explicitly authorized retry. A lower estimate never cancels exposure that already happened.

## Reconstruct wording and timing

`kb_job {action:"convert"}` produces separate transcript units, timing maps, decoder comparisons, overlap-review units and visual navigation. Read the whole wording track, and compare the differences that matter: omissions, repetition, qualifiers and numbers. Review the overlap units so a split phrase or a missing exception doesn't silently drop out. Agreement between decoders helps you screen; it is not proof of accuracy or independent evidence.

Keep the raw wording exactly as decoded. When a correction matters, record it with the original words, the proposed reading, its located support and your uncertainty. Use context, another decode, supplied text and aligned visuals to investigate, and never repair speech to fit a preferred theory. If a timing decode is damaged, keep the good wording with its honest chunk interval. Never borrow another model's word times just because some words match.

Create a reading copy only after reviewing the joins:

```json
{
  "action": "reading_copy",
  "job_id": "JOB_ID",
  "source_id": "SOURCE_ID",
  "spans": [{"unit_id": "TRANSCRIPT_UNIT_ID", "start": 0, "end": 1250}],
  "rationale": "Evidence for the selected overlap boundaries and any unresolved gap"
}
```

Offsets are UTF-16 code units in the exact returned transcript text. The tool keeps each span you retain and refuses copies that mix decoders. It doesn't judge whether your join keeps the meaning. Keep a separate copy per decoder; no joined copy is better than a fabricated repair. Time locators in a reading copy are approximate, while its raw text lineage is exact.

## Inspect the teaching visually

Navigation scans a reduced video stream for changes and keeps a frame at least every configured interval (20 seconds by default). Contact sheets give a timeline overview. They don't prove a brief mark was seen, and they aren't native-resolution evidence for small text.

Use the transcript and the navigation to pick the examples that matter and the states around them. `kb_job {action:"frames", job_id, source_id, seconds:[...]}` extracts native-resolution frames, recording the requested seek, the decoded presentation time, the source-relative time and hashes. Read the returned units through `kb_read`; generating a frame is not inspecting it. Use `crop` with `unit_id` and `rectangle:[x, y, width, height]` for an unscaled detail. The original extraction maps never change. New evidence gets its own map and reopens reading, integration and checks.

Speakers and slides don't always agree, so compare what's said with what's shown. Keep axes, units, legends, slide notes, tooltips, overlays and meaningful annotations. Follow a changing example through its stages, because a final image can hide the distinction being taught. In decision-time applications, check that the image and its annotations don't reveal later information; cropping only the right edge can leave a future label on earlier content. Never claim hidden intermediate actions from selected stills.

Record how screenshots and slides map to the video, with the matching landmarks and your uncertainty. A diagram, table or worked calculation can qualify or contradict the speech. Keep both accounts and evaluate the discrepancy; a correct transcription doesn't make the speaker's calculation correct.

## Connect and complete

Use `source_review` to keep the source and part identity, transcript corrections, reviewed joins, timing reliability, mappings of supplied assets, visual observations and real gaps. Include the actual `evidence_unit_ids`. The review's `summary` explains what was done. Separate spoken content, visible evidence and interpretation, and name any coverage that wasn't reviewed. Review records are working evidence; publish conclusions and qualifications that matter through normal canonical records.

Use the job's partial receipts for source units. Timing maps used only for navigation may be excluded from substantive reading, with that reason; never mark them fully inspected by default. Comparison and join units need real review. A sampled overview, native-frame inspection, direct listening and continuous playback are four different coverage claims.

A course too long for one conversation gets the same staged reading as a long book: a map of the course first, then one reader per module in order, each building on the digests of the modules before it ([books guide](books.md#long-books-a-book-map-then-readers-in-order)).

Reconstruct each teacher or course on its own terms before comparing it with the library. Keep conditions, mechanisms, examples, limitations and open choices, then update the cumulative account. Ground new ideas in named premises, differences, failure conditions and the next useful test. The finish report explains what the knowledge now lets the AI do, the limits of the evidence, and the actual paid spend. And it never turns results the source *reports* into performance anyone reproduced.

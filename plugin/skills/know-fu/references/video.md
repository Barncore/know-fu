# Recorded courses, video and audio

Use this with the common ingestion guide; mixed courses also use the book guide for slides and readings. Reconstruct what is taught through speech, diagrams, demonstrations and their sequence. Transcription alone does not establish visual understanding.

## Source inventory and paid preflight

Identify logical lessons, physical parts, original media, supplied audio, transcripts, slides and screenshots. Verify relationships from content and several matching landmarks. Similar durations, filenames or an old screenshot index are candidate mappings. Retain part-local time unless a global offset is verified. Keep audience answers, teacher statements and reviewer interpretation separate.

Register originals once. Represent verified relationships through source provenance and scoped records; supplemental material is not independent corroboration of the same lesson. Preserve the highest-quality originals and original screenshot resolution.

The installed adapter uses API transcription. There is no local Whisper requirement. Configure separate wording and timing/comparison decoders in the runtime `transcription.models` list. The established pairing is GPT transcription for wording and the Whisper API for word/segment timing; model IDs, prices and provider features must be current. A single configured decoder is explicitly reduced comparison, not the same coverage.

Call `kb_job {action:"media_plan",job_id}` before uploading. It probes all media and estimates both decoders, overlaps and a reservation margin without making paid requests. The whole job needs an actual authorized `paid_budget {limit,currency,authorization}`. If the user makes sufficient balance a condition, obtain a current balance or their confirmation before upload; the plan does not inspect account credit. Never reuse another task's historical allowance.

Conversion uses five-minute core intervals with eight-second margins, preserving requested offsets, encoded duration, audio hashes, raw API responses and request IDs. Those are configurable preparation defaults, not universal semantic boundaries. Completed results are reused only with matching plan and hashes. An unknown, submitted or rejected request blocks automatic repetition; preserve possible charges and investigate before any explicitly authorized retry. A lower-looking estimate never erases prior exposure.

## Reconstruct wording and timing

`kb_job convert` produces separate transcript units, timing maps, decoder comparisons, overlap-review units and visual navigation. Read the complete wording track and compare consequential differences, omissions, repetition, qualifiers and numbers. Review overlap units so a split phrase or a missing exception is not silently dropped. Programmatic agreement is a screening aid, not proof of accuracy or independent evidence.

Keep raw wording unchanged. Record a consequential proposed correction with the original words, proposed reading, located support and uncertainty. Use context, another decode, supplied text and aligned visuals to investigate; do not repair speech to fit a preferred theory. If a timing decode is damaged, keep the good wording with its honest chunk interval. Never borrow another model's word times merely because some words match.

Create a reading copy only after reviewing joins:

```json
{
  "action": "reading_copy",
  "job_id": "JOB_ID",
  "source_id": "SOURCE_ID",
  "spans": [{"unit_id": "TRANSCRIPT_UNIT_ID", "start": 0, "end": 1250}],
  "rationale": "Evidence for the selected overlap boundaries and any unresolved gap"
}
```

Offsets are UTF-16 code units in the exact returned transcript text. The tool preserves each retained span and refuses mixed-decoder copies. It does not judge whether the chosen join preserves meaning. Keep separate copies per decoder; no joined copy is preferable to a fabricated repair. Reading-copy time locators remain approximate; their raw text lineage is exact.

## Inspect the teaching visually

Navigation scans a reduced video stream for changes and retains a frame at least every configured interval (20 seconds by default). Contact sheets provide a timeline overview. They do not certify that a transient mark was seen or supply native-resolution evidence for small text.

Use the transcript and navigation to select material examples and neighboring states. `kb_job {action:"frames",job_id,source_id,seconds:[...]}` extracts native-resolution frames with requested seek, decoded presentation time, source-relative time and hashes. Read the returned units through `kb_read`; generating them is not inspecting them. Use `crop` with `unit_id` and `rectangle:[x,y,width,height]` for an unscaled detail. Original extraction maps stay immutable; new evidence receives its own map and reopens reading/integration/checks.

Compare spoken claims with what is visible. Preserve axes, units, legends, slide notes, tooltips, overlays and meaningful annotations. Trace a changing example through its stages; a final image can conceal the distinction being taught. In decision-time applications, check that the presented image and annotations do not reveal later information. Cropping the right edge alone may leave a future label on earlier content. Do not claim hidden intermediate action from selected stills.

Record screenshot/slide-to-video mappings with matching landmarks and uncertainty. A diagram, table or worked calculation can qualify or contradict the speech. Preserve both accounts and evaluate the discrepancy; a correct transcription does not make the speaker's calculation correct.

## Connect and complete

Use `source_review` to persist source/part identity, transcript corrections, reviewed joins, timing reliability, supplied-asset mappings, visual observations and substantive gaps. Include actual `evidence_unit_ids`. The review's `summary` must explain what was done. Distinguish spoken content, visible evidence and interpretation, and identify unreviewed coverage. Review records are working evidence; publish consequential conclusions and qualifications through normal canonical records.

Use the common job's partial receipts for source units. Timing maps used only as navigation may be excluded from substantive reading with that reason; never mark them fully inspected by default. Comparison and join units need actual review. Sampled overview, native-frame inspection, direct listening and continuous playback are distinct coverage claims.

Reconstruct each teacher/course on its own terms before comparing with the library. Retain conditions, mechanisms, examples, limitations and open choices, then update the cumulative account. Ground new ideas in named premises, differences, failure conditions and the next useful test. The finish report must explain what the knowledge enables, the evidence limits and the actual paid accounting; it must not turn source-reported outcomes into reproduced performance.

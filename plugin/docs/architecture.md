# How Know Fu works

[Overview](../../README.md) · [Setup](setup.md) · [File format](../skills/know-fu/references/format.md) · [Lineage](lineage.md)

This page explains the design: what the parts are, why each one is there, and what was left out on purpose. For the exact file format, see the format guide. For the reasoning that led here from the earlier design, see [the rebuild record](../../docs/REBUILD.md).

## The problem it solves

A model's weights don't change when you give it a book. It knows what is in its context at the moment it reasons. So "teaching" an agent a subject comes down to two questions: what gets written down when a source is read, and what reaches the context when work happens.

Left to itself, an agent writes one summary document per source. That is easy to produce and poor to build from: knowledge stays organized by book, the same idea is told three times in three summaries, and nothing connects them. Know Fu's earlier versions went the other way and stored a small note per point, hundreds per book. That restated the source at most of its length and still had no page that said what the subject's principles were.

Know Fu 0.6 takes a third shape, the one an expert's knowledge has: a few principles, each with the specifics that are cases of it.

## The four layers

| Layer | File | What it holds | When it's read |
|---|---|---|---|
| Topic page | `knowledge/<domain>/<topic>/TOPIC.md` | A frame for the subject, then every principle in one generated line: its summary, its kind of support, how many independent sources hold it, how many notes rest on it. Then tensions, a decision map, vocabulary, open questions | Whole, when work on the subject starts |
| Principles | `…/principles/<id>.md` | One principle each: statement, why, where it breaks, a Merit line weighing its logic, an evidence entry per source saying what that source brings, and a generated list of the notes under it | When a decision leans on it |
| Notes | `…/notes/<name>.md` | The detail behind the principles, one idea each: a mechanism, method, case, reference table, debate or definition, with its numbers and page citations | The few a task needs |
| Source map | `sources/<id>/source.md` | One line for every stretch of the source, with page ranges, and what the source changed in the library | When looking for where a source covers something |
| Source text | `sources/<id>/text.txt` | The extracted original, a unit per page, section or two minutes of recording | A page at a time, to verify or get detail |

Each layer is an entry point. A broad design task starts at the topic page. A precise lookup goes straight to a principle, a note or a page.

The layers depend on each other in one useful way. The agent can compress hard when it writes notes because the source text is still there underneath. Nothing is lost by leaving common knowledge and the author's repetition in the source.

## What gets stored: the delta

The reader is a frontier model that already holds the common knowledge of most fields. This is a rule about what goes in, never about how long a note may be: a note is read on purpose by an agent that chose it, so it can explain its idea at whatever length the idea needs. The page that must stay short is the topic page, because it is read whole. A note earns its place by what it adds to what the model already holds: the author's frame, surprising claims, numbers and thresholds, the order of steps, decision rules, failure modes, worked cases. The ingest guide gives the test as a question: would a strong general model, asked cold, already say this with this precision?

This matters for more than cost. Research on agent context files and self-written skills in 2026 found that text a model writes for itself, carrying what it already knew, was neutral or slightly harmful, while curated material helped most where the model's training was thin. A library of restated common knowledge would make an agent slower and no better.

## How understanding accumulates

A principle is the unit, and it belongs to an idea, never to a source. Its `## Evidence` section has one entry for every source that bears on it, headed with how that source stands (states it, implies it, qualifies it, disputes it) and saying what the source brings. When a new source arrives, each idea it carries gets one of five outcomes: the library already holds it (add an evidence entry and sharpen the principle in place), it sits near something held (widen that principle, or write a new one and connect them), it disputes one (record the dispute on the principle, write a debate note, and keep both), it is new (write a principle, or a note under one), or any model already knows it (leave it in the source). Adding to what exists is the default, and git keeps the earlier wording.

So the tenth book on a subject adds far less text than the first, and changes the principles more than it multiplies them. A principle the first book only implied gains a source that states it. A boundary gets sharper when a source shows a failure.

## Weighing what goes in

The owner wants the library to stand behind what it holds, so the reader judges each principle's logic as it writes it, and the judgment travels with the principle. Three things carry it:

- **A Merit line**, in the reader's words: does the reason follow, what is the strongest objection, where is the support thin.
- **The kind of support**, one of seven from `review of studies` down to `bare assertion`, plus `our inference` for what no source states. It describes the evidence and is not a score. 0.5 rated evidence on a strength scale and 91% of notes came out "moderate", so a scale told nobody anything.
- **A count of independent sources**, made by the engine from the evidence entries and the sources' `family` field, so two lessons by one teacher count once.

The topic page shows the kind and the count beside each principle, and `kf_recall` prints the Merit line with every principle it puts in play. There is deliberately no second pass that audits or scores an ingest. The weighing happens on the way in, by the reader that has the source open.

A retelling is treated the same way: as a judgment, with no number. Until 0.12 the checker compared words written with words read and warned above 35%. That measured length and missed the cause, which is writing that follows the source's order and voice. The ingest guide now gives two tests for it (could you use the idea on another problem, and can you write it with the source closed), and limits them to principles, mechanisms and methods, because a case or a debate note is meant to report what a source said.

## The engine

The engine does what an agent is bad at or shouldn't spend tokens on. It never calls a model.

| Part | File | Job |
|---|---|---|
| Extraction | `engine/extract.ts`, `sources.ts`, `links.ts` | PDF to page text with Poppler, and with Tesseract for pages that are scans; a video link fetched with yt-dlp, with the page's captions kept as a second transcript; text and Markdown to sections; subtitles and timestamped transcripts to time units; EPUB, DOCX and HTML through pandoc; audio and video through a transcription API, sent in padded chunks with the topic's vocabulary as key terms and returned one sentence per line with its time. Page images on request |
| Video screen | `engine/frames.ts` | Maps what a video showed: the moments the picture changed and then held still, laid out as filmstrips. Serves any frame at reading size, a crop from the original frame, and the settled picture for a sentence |
| Library model | `engine/library.ts`, `frontmatter.ts` | Reads the folder into memory: topics with their principles, notes with their links and citations, sources with their units and maps |
| Checker | `engine/check.ts` | Frontmatter, links, citations, quoted words against the source text, principles and their evidence entries, source maps and sizes. Writes the derived parts: the list of principles on each topic page, the list of notes in each principle file, `INDEX.md`. Commits to git |
| Migration | `engine/migrate.ts` | Moves a library from before 0.12 to principle files and notes, leaving what needs a reader's judgment as TODO |
| Search | `engine/search.ts`, `embed.ts` | A SQLite full-text index under `.knowfu/`, rebuilt a file at a time when a file changes. Optionally, vectors for the compiled layer |
| Reading | `engine/recall.ts` | `brief`, `recall`, `read`, `connect` |
| Serving | `engine/tools.ts`, `mcp.ts`, `cli.ts` | The nine tools, over MCP and from a shell |

It is TypeScript that Node runs directly, with no build step and no installed dependency. The MCP server is written by hand, because the protocol surface it needs is five methods.

### Recall

`kf_recall` ranks principles and notes with BM25 over title, summary, keywords and body, title weighted highest. A note under a principle the question also matched gets a small lift. It then packs a briefing to a token budget, in this order: the principles in play, the best notes in full, any note that disputes or qualifies a loaded one, one line each for other matches, and where the source text speaks to the question.

Two rules hold whatever the budget. The best match is always delivered whole. And a note that disputes or qualifies a loaded note is always named, because dropping a caveat to save tokens produces a confident wrong answer.

A list of sub-questions is ranked per sub-question and merged, so each one's best match is present. `load: "gists"` returns one line per match and loads nothing, for choosing before reading.

### Search: words first, meaning as a second channel

Keyword search does most of the work, for three reasons. Every note has a title, a one-line summary and optional keywords written for finding it. The topic page tells the agent the library's own vocabulary before it searches. And a recall scoped to a topic searches that topic's notes, which stays a small set however large the library grows.

Keywords fail in one place that matters: when the question and the library use different words for the same idea. That is the normal case for a question asked from another field, which is what invention looks like. So there is an optional semantic channel (`engine/embed.ts`). With an `embedder` set in the config, `kf_check` embeds each principle, note and topic frame through any OpenAI-compatible endpoint and keeps the vectors in `.knowfu/vectors.jsonl`. Recall then embeds the question and uses closeness in meaning three ways:

- It adds to the ranking, scaled by how far a match stands above the library's average closeness to the question.
- When no note shares the question's key terms but one is very close in meaning, recall loads it and says it was matched by meaning.
- When the closest match isn't close enough to trust, recall still says the library has a gap, and lists the nearest matches as leads to follow.

The last two differ because similarity separates related from unrelated well, and answered from merely related poorly. Measured on one model with one topic, questions the library answers in other words scored 0.74 to 0.77 at best, a subject it lacks scored 0.70, and unrelated questions scored under 0.60. So the bar for trusting meaning alone (`min_similarity`) is high, and it needs setting per model.

Source pages aren't embedded. They are found by keyword and through the notes that cite them. The vectors file is derived and can be deleted; nothing in the library's own files depends on it, so the embedding model can change without re-ingesting anything. If the embedder is unreachable, recall answers by keyword and says so.

### Video: the transcript decides where to look, and code makes that possible

Much of what a teaching video teaches is on its screen, and only a reader can tell which sentences lean on it. But a reader has two blind spots: it can't ask for a picture it doesn't know exists, and a speaker says "this one here" a few seconds before the line is drawn. So code does two jobs, and no choosing.

When a video is added, `frames.ts` decodes it once at two frames a second and maps the screen. It masks regions that move in most samples (a webcam box, a ticker), looks every ten seconds or at a cut, waits up to six seconds for the picture to settle, and keeps the frame unless it never settled or matches one already kept. The kept moments go onto filmstrip sheets of twenty small thumbnails with their times. Measured against lists of every chart state in three lessons, written before any picker ran, this covered 93% of the states with no frame taken mid-movement, where one frame a minute covered 39% and a scene filter with a twenty-second timer covered 82%, with 53 of its 221 frames taken mid-movement and 44 showing no chart. About a third of the kept frames repeat a neighbour, which is why they are thumbnails to choose from and not frames to read.

When the reader asks, the engine serves: a filmstrip sheet; the frame at any second, at reading size (a source above 2,576 px wide comes down to it, 1080p is left alone, and anything smaller is enlarged to 2,576 px, each from a test on chart frames); a crop cut from the original frame; and the screen for a sentence, which is the settled picture as the sentence ends plus the picture before it when they differ. A frame the reader keeps is copied to the source's `exhibits` folder with a record on the source page, because every other frame is a cache and a large video is never copied into the library.

The checker closes the loop. Each map entry ends with a Frames line, and `kf_check` warns when the screen changed several times in a stretch with no Frames line, or when the line names a frame that was never opened. Reading a video from its words alone produces fluent text, so this is the one place the skip would otherwise be invisible.

### Why there is no graph database

Connections are written where a reader sees them: a link in a sentence, or a typed line under a note's Connections heading with the reason beside it. `kf_connect` reads those links into memory and walks them. Typed relationship records in a database cost a lot to write and maintain, and the measured gains for graphs come from weak models on multi-hop questions; a strong agent reading linked prose reaches the same places.

## Ownership and history

The Markdown files are the library. `INDEX.md` and the search index are generated and can be deleted. Two lists inside authored files are generated too: the lines under "## Principles" on a topic page, built from the principle files, and the "## Notes" section of a principle file, built from the `principles` field of the notes. So the front page can't drift from the principles, and a principle's backlinks can't drift from the notes. The order of the lines on the topic page is the author's and is kept.

History is git. `kf_check` with a commit message writes a line to `log.md` and commits, and both carry the name of the agent that did it, since every agent commits under the owner's git identity. Going back is `git revert`. Originals, page images and frames are left out of git by the library's `.gitignore`; they sit in the folder and don't change.

One session writes at a time. The home session, opened in the library folder, is the only one that ingests or edits, and a lock file stops two of them overlapping. Any other session reads, and can save a note to `inbox/`. This is also why Claude Code and Codex can share one library.

## Deliberate use and pinning

The library's value comes from its owner's curation, so Know Fu's tools stay closed in a chat until the owner invokes the skill there. In Claude Code a hook enforces that.

Pinning is the exception the owner chooses. `kf_pin` ties a topic to a project folder. Sessions there start with a short block in context, written by a SessionStart hook: the topic's frame in a paragraph and each principle in a sentence, with how to load the rest. The tools are open there without invoking. The block is kept short on purpose. A 2026 study of agents over a large wiki found they did as well with a cheap targeted lookup as with a preloaded index, at lower cost, so what loads up front is the principles and never the catalogue.

## What was left out

Releases, proposals, staged jobs, lifecycle plans, a deletion ledger, modules, per-folder access levels and an evaluation harness all existed in 0.5 and are gone. Git covers versioning and rollback. The home-session rule covers access. Retiring a note (`status: retired` with a reason) covers withdrawal without deleting anything.

Docling and its Python environment are gone too. When a table or formula matters, the agent looks at the page image, which is the check that had to happen anyway.

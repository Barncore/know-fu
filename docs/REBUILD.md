# The 0.6 rebuild: assessment, theory and plan

This is the working anchor for the rebuild that started on 10 November 2026. It holds the honest assessment of Know Fu 0.5, the theory the new design rests on, what happens to each earlier owner decision, and the build status. The owner asked for the architecture to be assessed from scratch and left the direction to the agent, with the old version kept in case he wants to go back. Version 0.5.0 stays in git as the tag `v0.5.0` and the branch `records-engine-0.5`.

## Verdict on 0.5

Know Fu 0.5 is a careful system built around the wrong unit of knowledge. Its unit is a small note about one point in one source, stored as a JSON record with a hashed id, joined to other notes by relationship records. Everything expensive about the system follows from that choice, and so does the result the owner saw: an ingest that extracts instead of compiling.

The evidence is the first real ingest (a 364-page book on audio mixing, 17 October 2026, the Claude library):

| Measure | Value |
|---|---|
| Source length | about 134,000 words |
| Authored notes | 425 (337 knowledge, 71 concept, 17 learning) |
| Authored prose | 84,436 words, 63% of the book's length |
| Relationship records | 583, about 2 KB of JSON each |
| Passage records | 448, which copy source text the library already holds |
| Record metadata | 1.3 MB of JSON for the 425 notes alone |
| Domain page | 62,620 words |
| Notes that state the book's organizing ideas | 6 of 425, written on the agent's own initiative |
| Time | 5 h 33 min (Claude), 2 h 53 min (Codex) before the 0.5 speed work |

A library that restates a book at 63% of its length hasn't compressed anything. It has moved the book into smaller files. The six notes that did capture the book's organizing ideas ("one job, directing attention, and one constraint, the mixer's own hearing") are the most valuable thing in the library, and nothing in the design asked for them, ranked them or put them where a reader starts.

### What 0.5 gets right

These carry into 0.6, most of them in a lighter form.

- **Provenance.** Every claim points at a page, and quoted words are checked against the source text. This is what makes the library trustworthy enough to build from.
- **Disagreement is kept.** Two sources that conflict both stay, with a written account of how they relate. Nothing wins by being newer.
- **Compiling should compress.** The 5 October lesson is right: if one answer costs more than the whole compiled understanding, the design is inflating knowledge. 0.5 applied this to retrieval and never to ingestion.
- **Reweave.** A new source should change the older accounts it affects. This is the mechanism that makes a library get smarter and not just bigger.
- **Ideas stay apart from evidence.** An invented idea never counts as support for knowledge.
- **The host plumbing.** The launcher, the single config file, the gate for deliberate use and the hard lessons about how Claude Code and Codex load plugins all cost real sessions to learn.

### What 0.5 gets wrong

- **The unit is too small and shaped like the source.** A note per point means a book becomes hundreds of notes in the book's own order. Book two adds hundreds more beside them. Growth is linear, near-duplicates pile up, and retrieval gets harder with every ingest, which is the opposite of the goal.
- **Related clutter is the worst kind of context.** The research wiki's context page records that a strong model held steady under hundreds of thousands of tokens of unrelated text and dropped from 50% to 40% when the extra text was related. Ten near-matching notes about compression are exactly that kind of clutter.
- **Reweave can't work at this grain.** Revising "the accounts a new source touches" is a real job when there are 40 accounts and a paper exercise when there are 400.
- **There is no top layer.** The domain page is a list. Nothing states what the field's principles are, so a session can't load the shape of a subject before it starts work, and the agent can't know what the library holds that it should ask for.
- **It stores what the reader already knows.** 71 concept records define things like mastering and resonance. A frontier model knows those. Agent-written context that carries nothing new is neutral at best: the research wiki records agent-written context files scoring slightly below none, and curated ones above.
- **The canonical form isn't readable.** Meaning lives in `objects/knowledge_017fede4.../1/record.json`, and the readable wiki is a generated dump. The owner wants a library he can read. Two representations of one thing also means two things to keep in step.
- **The machinery is sized for a product with many tenants.** Releases, manifests, proposals, staged jobs with receipts, lifecycle plans, a deletion ledger, modules, per-folder access levels, an evaluation harness: about 800 KB of TypeScript, 15 schemas, 16 tools and 76 KB of guides an agent reads before it can work. A personal library needs versioning and rollback, and git gives both for free.
- **The agent's output goes to bookkeeping.** The 20 October audit found readers writing each batch 2.75 times. Even after the fix, an ingest writes 84,000 words of notes where 15,000 to 25,000 words of compiled understanding would serve better.

### Which parts help each other, and which fight

Parts that compound: a principles layer with recall that leads with principles; consolidated accounts with reweave; keeping the source text searchable with compressing hard (you can compress because the original is one search away); a strict checker with free-form prose (the agent writes naturally and the checker holds the structure); plain files with git.

Parts that fight: small notes with typed relationship records (583 records to say what a sentence of prose says better); passage records with the stored source text (two copies); JSON records with a generated wiki (two representations); coverage receipts with synthesis (they prove every page was served, and push toward a note per page).

Parts that are neutral at this size: embeddings, the local embedding model, graph traversal as a separate engine.

## The theory

### What expertise is

An expert differs from a well-read person in how their knowledge is organized. The classic finding (Chi, Feltovich and Glaser, 1981) is that novices sort problems by surface features and experts sort them by the principle that governs the solution. Around each principle an expert holds the conditions where it applies, the methods that follow from it, cases that calibrate judgment, and the numbers that can't be derived and have to be remembered. So expert knowledge has a shape:

1. **Principles.** A small set of ideas from which practice follows. Each one says something its opposite wouldn't, has conditions where it stops holding, and explains several specific practices.
2. **Mechanisms.** How and why things work.
3. **Methods.** What to do, in what order, with the decision points and the failure modes.
4. **Cases.** Worked examples and near misses.
5. **Reference values.** Numbers, thresholds, tables.

Running across all five: where sources disagree, and what nobody has answered yet.

Principles make knowledge generative. Twenty procedures let you repeat twenty procedures. Eight principles with their conditions let you work out what to do in a case no source covered, which is what building new things requires. The owner arrived at the same place on 23 October: a first-principles layer is what makes the library "less prescriptive and more of a generative tool".

### What the reader already has

The reader is a frontier model. It already knows what a compressor is, what overfitting is, what a moving average does. What it lacks from a specialist source is narrower:

- the author's frame: the organizing idea that makes the field hang together their way
- claims that are surprising, or that contradict common advice
- specifics: numbers, thresholds, orderings, decision rules, named techniques
- conditions and failure modes: when the standard advice breaks
- worked cases
- for niche sources (a trader's private course, a practitioner's method), nearly everything

So the value of a stored sentence is its **delta**: what it adds to what the reader would say unaided. Restating common knowledge costs tokens at ingest, costs attention at recall, and adds nothing. This is the compression rule 0.5 lacked. It isn't a quota. A niche source may be nearly all delta, and a popular overview may be nearly none.

Two limits on the delta rule. A model is a poor judge of its own knowledge at the edges, so the test is concrete ("would a strong general model, asked cold, state this with this precision?") and the guide carries worked examples. And the original text stays in the library, searchable by page, so anything left out of the compiled layer is still one search away. Compression is safe because nothing is deleted.

### How a model comes to "know" something

The weights don't change. A model knows what is in its context at the moment it reasons. That leaves two ways to deliver knowledge, and they fail differently.

- **Ask-time retrieval** fails silently. The agent only searches for what it suspects exists. If it doesn't know the library holds a principle about dry references, it never asks, and it builds from its generic prior without noticing.
- **Up-front loading** fixes that, and costs context. A page that states a topic's principles in two or three thousand tokens, loaded when work on that topic starts, gives the agent the field's frame and a list of what it can drill into. That is the closest a library can get to "I know kung fu": the knowledge is present before the first question.

So the design loads a compact model of the topic first and fetches detail on demand. This is the same shape as an agent skill (a short body, then references), which is the form current models handle best.

### Where understanding is built

Integration can happen when a source is read or when a question is asked. 0.5 did most of it at question time: recall assembled a briefing from fragments. But integration at question time is repeated for every question and never accumulates. Integration at ingest happens once and the next source builds on it. A library compounds only when a new source revises what is already there, so the unit has to be the idea, held once and revised in place, with every source that speaks to it listed on it.

### The theory in six rules

1. Store the delta, never the retelling.
2. One account per idea, across sources, revised in place.
3. Every topic has a principles page, small enough to load whole.
4. Keep the original searchable, so compression loses nothing.
5. The files are the library: readable Markdown, links written in the prose, history in git.
6. Code does what agents are bad at (extraction, search, checking). Agents do the reading and writing.

## The architecture

```
library/
  INDEX.md                      generated: domains, topics, counts
  log.md                        one line per ingest or change
  knowledge/
    audio/
      DOMAIN.md                 authored: what the domain covers, principles that span topics
      mixing/
        TOPIC.md                authored: the frame, the principles, tensions, decision map, open questions
        _index.md               generated: every account under its principle, with its summary
        accounts/
          depth-needs-dry-references.md
  sources/
    oltheten-mixing-with-impact/
      source.md                 what the source is, its map (chapter digests with pages), what it changed
      original/                 the file, never modified
      text/p0001.txt ...        extracted text, one file per page or transcript chunk
  ideas/                        candidate inventions, never cited as evidence
  inbox/                        notes saved from other projects, woven in at the next home session
  .knowfu/                      generated search index, safe to delete
```

Four layers, each an entry point:

| Layer | Holds | Size | Loaded |
|---|---|---|---|
| Topic page | The frame, 6 to 15 principles (statement, why, where it breaks, what it governs), tensions, a decision map, open questions | 2,000 to 4,000 tokens | Whole, at the start of work on the topic |
| Accounts | One idea each: a mechanism, method, case, reference table or debate, with its specifics and page citations | 200 to 700 words | The few that the task needs |
| Source map | Chapter digests with page ranges | A page per chapter | When looking for where a source covers something |
| Source text | The original, by page or timestamp | Everything | A page at a time, to verify or get detail |

The engine is small, has no installed dependencies and ships inside the plugin: TypeScript that Node 24 runs directly, Node's built-in SQLite for full-text search, Poppler for PDF text and page images. It does four things: turns a source file into page text, checks the library (links, citations, quoted words, principles that govern nothing, accounts too long or too short, pages no digest covers, how much was written against the source's length), builds the search index, and answers recall with a briefing packed to a budget (the governing principles first, then the best accounts whole, then pointers into sources).

Use has two modes. Deliberate: the owner invokes `/know-fu` and the agent loads the topic it needs. Pinned: the owner pins a topic to a project once, and each session there starts with that topic's frame and principles already in context.

## Earlier owner decisions: what happens to each

The owner's instruction for this rebuild was to use judgment and say plainly what changes. Nothing below is changed quietly.

| Decision (date) | In 0.6 |
|---|---|
| The "I know kung fu" experience; a collaborator, not a search box | Kept. It is the reason for the topic page and for pinning |
| Preserve the source, exact locators, checked quotes | Kept. Originals are immutable; citations and quoted words are checked against page text |
| Whole explanations beside addressable claims | Kept and strengthened: the account is the whole explanation. Separate claim and passage records go |
| Cumulative understanding, reweave | Kept, and now practical: accounts are revised in place and list every source |
| Disagreement is knowledge; no winner by age | Kept: debate accounts and a tensions section on the topic page |
| Evidence, interpretation and invention stay apart | Kept: `basis` on each account (source, synthesis, owner) and a separate `ideas/` folder the checker walls off |
| Canonical JSON records, wiki as a view (2 Oct) | Changed. The Markdown files are canonical. There is one representation |
| Custom TypeScript engine with releases, proposals, jobs | Replaced by a small engine and git. Rollback is `git revert` |
| `kb_recall` as the routine answer route (5 Oct) | Kept as `kf_recall`, simpler, leading with principles |
| `kb_connect` (5 Oct) | Kept as `kf_connect`, computed from the links in the files |
| Assessments on three axes with a basis (5 Oct) | Simplified to what something reads: `basis`, the sources that hold a principle, and an evidence line in prose where it matters |
| Invention engine first; ideas lane with walls; test results from the owner's tools (6 Oct) | Kept in a light form: `ideas/` files with status, premises, a kill test and a results log. The status machine and export code go |
| Functional facets (6 Oct) | Folded into principles: each is stated in terms another field could recognize |
| No `analogous_to` link (6 Oct) | Kept |
| Reading is checked by the engine serving every unit (7 Oct) | Changed. The check is now that the source map's digests cover every page |
| Both Claude Code and Codex, one plugin folder (7 Oct) | Kept. Verified in Claude Code in this rebuild; the Codex install needs the owner's go-ahead because it writes to the Codex folder |
| Sunset instead of expiry dates (7 Oct, open) | An account can carry `status: retired` with a reason. No dates |
| No database server (12 Oct) | Kept. The search index is a generated SQLite file |
| Use is deliberate; a gate in Claude Code (13 Oct) | Kept, with one addition: a topic the owner pins to a project loads there without invoking |
| Ingest only from the library's home folder; read from anywhere (13 Oct) | Kept. Other projects can save a note to `inbox/` |
| Settings in `~/.know-fu/config.json` (13 Oct) | Kept, new schema |
| A domain is the only subject label (17 Oct) | Changed, following the owner's 23 October thinking: domain, then topic. A topic is a folder with a principles page, not a tag on notes |
| Parallel readers, one writer (20 Oct) | Kept in spirit: readers write digests in parallel, and accounts are written from a plan |
| Embedder is a setup choice; an API is acceptable (20 Oct) | Kept: an optional semantic channel through an API. The local model and QMD go |
| One library per agent; a shared library deferred (Codex thread) | Changed. One library for every agent. Plain files and one writer at a time make sharing safe |
| Operational memory is a separate plugin | Unchanged |
| Promotion tiers | Still parked |

Dropped without a replacement: modules, per-folder access levels beyond home and elsewhere, lifecycle plans and the deletion ledger, the evaluation harness that ran through Codex, the packet and progressive routes, Docling and the Python environment (the model reads the page image when a table or formula matters), QMD and the local embedding model.

## What the research changed

A research subagent read what 2026 studies and practitioners say about compiled layers, note size, graphs and agentic search, and tested four claims this design made. Its findings and how each was read are in [the lineage page](../plugin/docs/lineage.md#research-the-06-design-leans-on). The verdicts, and what changed because of them:

| Claim in the first draft of this design | Verdict | What changed |
|---|---|---|
| A compact map loaded up front, plus drill-down, beats embedding-only retrieval at this size | Refined. Agentic drill-down over text beats embedding retrieval on strong models. But nothing supports preloading a catalogue: capable agents skipped a large index, and a cheap lookup tool returning one-line gists matched quality at lower cost | Pinning loads a topic's principles in a sentence each and never the list of accounts. `kf_recall` got a gists mode. `kf_brief` no longer appends the account listing |
| Many small related notes hurt more than fewer consolidated ones | Supported in part: coherent, focused units beat atomic ones and comprehensive ones. No 2026 study compares related clutter with unrelated bulk directly | No change. The claim is stated more carefully |
| Typed graph records add little over links written in prose at this size | No direct test. Graph gains are measured on weak models with unmatched budgets; a strong agent with grep reached far on multi-hop questions with no graph | No change. Stays a design judgment, and the lineage page says so |
| Compiled knowledge earns its place only where it carries what the reader lacks | Confirmed, with a refinement: a compiled layer also adds organization across sources that the reader didn't have | The delta rule stayed. The ingest guide's "second source" section got more weight |

Three things the research added that the first draft lacked: a probe check after compiling, because wikis compiled without one scored far below raw text in one study and recovered most of the loss with a refinement pass; sub-questions in recall, because splitting a question closed most of a compiled wiki's advantage over retrieval; and no embeddings, because both the benchmark evidence and a practitioner who ran a wiki of several hundred pages say to add a vector index only when the library stops fitting.

## Build status

- [x] Assessment and theory written
- [x] 0.5 preserved as branch `records-engine-0.5`; legacy code and docs removed from the working tree
- [x] Engine: library model, frontmatter, links and citations
- [x] Engine: source extraction (PDF, text, transcript, EPUB through pandoc, audio and video through an API)
- [x] Engine: checker
- [x] Engine: search index and recall
- [x] Engine: MCP server and CLI
- [x] Plugin: skill, guides, hooks, launcher, manifests
- [x] Tests (21)
- [x] Docs and change log
- [x] Acceptance: a cold ingest of three chapters by an agent that has only the skill
- [x] Acceptance: fidelity check of the compiled accounts against the source
- [x] Acceptance: blind comparison of the 0.6 library against the 0.5 library
- [x] Pushed to `staging`, with `records-engine-0.5`
- [x] Installed for Claude Code on the development machine
- [ ] Installed for Codex (waiting on the owner's go-ahead)

## Acceptance

The owner set the size of this run on 10 November 2026: three chapters of one book, within five subagents. It tests the mechanics and gives a first reading on quality. It doesn't show what a whole book or a second source does, and those are listed under "Not shown yet".

The source is a 364-page book on mixing music (134,220 words). The span is chapters 5 to 7, physical pages 67 to 136, 26,396 words by the engine's count. The same book was the first real ingest under 0.5 on 17 October, so the two can be compared.

### 1. A cold ingest

An Opus agent was given the skill, the two guides, the command line and one instruction: ingest pages 67 to 136 into `audio/mixing`. It had no other context. It was told it couldn't start subagents, so it read the span itself and skipped the probe check.

| Measure | 0.6, this run | 0.5, same pages, 17 October |
|---|---|---|
| Wall time | 11 min 6 s | 50 min for the reader of these pages alone, before any integration or publishing |
| Tokens (as the harness counted the subagent) | 221,723 | not comparable: that run's accounting was by context size |
| Tool calls | 72 | not recorded per span |
| What it wrote | 16 accounts, 6,955 words; a topic page of about 2,600 tokens with 7 principles; a 4-part map | about 215,000 characters of notes staged for this span, after 762,000 typed |
| Checker result | no errors, no warnings | not applicable |

The topic page it produced has a four-paragraph frame, seven principles (each with its statement, why, boundary, sources and three to six governed accounts), three tensions, a decision map, vocabulary and open questions. It noticed that the book gives the Haas window two different ways, on p.113 and p.127, kept both figures with their pages, and listed the discrepancy as an open question.

The 0.5 timing is from the 20 October audit of that ingest, and it measured a different workflow on a different engine, so read the row as the size of the difference and not as a benchmark.

### 2. What the cold ingest found wrong with the product

Its friction list had twelve items. All were acted on:

| Finding | Fix |
|---|---|
| The compression ratio was measured against the whole book, so a partial ingest showed 5% when the span was at 26% | The checker measures against the pages the map covers and lists the pages not yet mapped |
| Nothing covered ingesting a long source over several sessions | A section in the ingest guide |
| A commit swept up uncommitted registration files | Registering a source commits itself |
| Citations inside a source's own map weren't checked | A bare `[p.68]` on a source's page is resolved against that source and its quotes verified |
| The guide said never to edit the Governs line, and its template showed one filled in | The template no longer shows it; the guide says the checker adds it |
| Unclear what punctuation in a heading does to a principle's id | One sentence in the format guide; `_index.md` lists the ids |
| The same content written in four places | "What it changed" is names and verdicts only; the plan's notes become Held by lines |
| "No Frame section" reported when the section was empty | The message says empty |
| A fourteen-page read overflowed a shell's inline limit | A read returns about 6,000 tokens and says where to continue |
| Page flags marked 40 of 70 pages | The guide says to choose by caption, and to say when a number was read off a chart |
| Tool names in the guides didn't match the command line | A line in the skill maps one to the other. (The agent also saw the 0.5 plugin's `kb_*` tools, which were still installed in that session) |
| Account size guidance and the ratio target pulled against each other on dense material | Both reworded: an account is as long as its specifics need; dense chapters can reach 25% to 30% |

### 3. A fidelity check

A second Opus agent got the source text for the span and the compiled files, with none of the first agent's reasoning, and was asked for two lists: statements the cited pages don't support, and specifics that change what a practitioner does and that no account carries. It read all 70 pages and all 17 files, and viewed the four figures behind chart readings.

- **Numbers:** none wrong. Every value it checked matched the source, including all four figures.
- **Unsupported or misframed:** seven, none of which changes a setting. Three matter. Two "Breaks when" lines and one tension on the topic page stated the compiler's inference as the book's view (one turned a practice the author reports from pop specialists into "the book's answer"). One sentence mixed up two panels of a figure.
- **Dropped specifics:** six, one of them worth having: a brief for a "bone-dry, in-your-face" sound still needs perspective, which is a rule against the obvious move.
- **Principles:** six of seven are not slogans; "contrast makes the effect" comes closest and is anchored by its specifics.
- **Its verdict:** a practitioner could work from the accounts without re-reading the chapters; the weak spot is the topic page presenting inferences as the author's.

All thirteen findings were fixed in the library (commit `eda6d82` there). The cause was in the product: the checker requires a "Breaks when" on every principle, authors rarely give one, and nothing told the compiler to label its own. The ingest guide and the format guide now say to cite the page or start the line with "Inferred:".

### 4. A blind comparison with the 0.5 library

Two Opus agents each answered the same nine tasks about chapters 5 to 7, at most 300 words each. One reached the 0.6 library through its command line, following the 0.6 use guide. The other reached the 17 October 0.5 library through the 0.5 engine, following the 0.5 retrieval guide. The tasks were written from the chapters' section headings before either library's content for them was read: three design tasks, three lookups, a mechanism to explain, an invention, and one question the chapters don't cover. A third Opus agent, given both answer sets with the order shuffled per task and the source text, scored each answer from 1 to 5 on four measures and named the one it would hand to a tool-builder.

| | 0.6 library | 0.5 library |
|---|---|---|
| Correct (of 45) | 43 | 41 |
| Specific (of 45) | 40 | 40 |
| Useful (of 45) | 39 | 42 |
| Honest (of 45) | 43 | 42 |
| Total (of 180) | 165 | 165 |
| Tasks preferred | 3 | 5 (1 tie) |
| Tokens the answerer used | 148,616 | 209,128 |
| Tool calls | 52 | 83 |
| Characters of library output read | about 101,000 | about 252,000 |
| Time | 5 min 39 s | 7 min 16 s |

**What this shows.** On answering questions from these chapters, the two libraries are level. The 0.6 answers were slightly more correct and the 0.5 answers slightly more useful, and the judge preferred the 0.5 answer more often. The 0.6 answerer got to the same total with 29% fewer tokens and 60% less text read, from a compiled layer of 7,300 words that took 11 minutes to build for these 70 pages, where the 0.5 library holds 84,000 words of notes for the whole 364-page book and took 5 h 33 min.

**What it doesn't show.** It doesn't show 0.6 giving better answers than 0.5, and the build should be judged knowing that. Equal answers at lower cost is the measured result. The claims that 0.6 compounds across sources, and that a principles page improves design work over a long session, weren't tested here.

**Where 0.6 lost, looked at one by one.** On two of the five tasks it lost, the specifics the judge credited to the 0.5 answer were in the 0.6 library and its answerer didn't use them: the singer-and-guitar procedure with its 20% left and 40% right panning, and the "sluggish compressor with a fast attack" option. That is one agent's choice of what to include, not a hole in the library. On one, the 0.5 answer drew on chapters the 0.6 library doesn't hold yet (the uncovered-subject task, where adjacent material from elsewhere in the book helped). On one the 0.6 answerer made an inference the book contradicts (that a long decay reads as a bigger space only with matching build-up; the figure on p.100 says otherwise). On one the 0.5 idea was simply better.

**Limits.** One run, one judge, and the judge is a model. The answers' citation styles differ, so the judge could tell that the same agent wrote, say, X in one task and Y in another, though not which library was which. The 0.5 library covers the whole book and the 0.6 library three chapters. Nine tasks is a small sample: a difference of 5 to 3 is within what a second run could reverse.

**What changed because of it.** The 0.6 answerer reported that recall loaded four accounts when it needed one, and that for the uncovered subject recall offered source pages that shared only common words, "so they looked like evidence but weren't". Recall now loads at most three accounts at the default budget, scores how much of a question each hit covers with rare terms counting most, says plainly when nothing clearly matches, and offers a source page only when it covers most of the question.

### 5. After the owner's review

The owner read the result and made three points (recorded in the north star under 10 November). What changed in the build:

- **Length.** The comparison's one worrying number was usefulness, 39 against 42, from an answerer that read 60% less. The first response to the answerer's feedback had been to load less, which was the wrong direction. Recall's default budget is now 6,000 tokens with no cap on the number of accounts, accounts may run to 1,500 words before the checker asks about them, and the guides say that length is not what to economize below the topic page.
- **A semantic channel.** Optional, through any OpenAI-compatible embeddings endpoint, over principles, accounts and topic frames. Run live on the owner's library with a hosted embedding model: 24 texts embedded; a question phrased in other words ("my mix sounds washy and muddy when I add ambience") ranked the principle about additions differing from what they join first and loaded the reverb account; a question from another field (making one element stand out in a user interface) ranked the contrast principle first. Similarity did not separate a subject the library lacks (0.70) from ones it holds (0.74 to 0.77) by a wide margin, so a match below the bar is offered as a lead and never loaded as an answer.
- **The agent's name on every commit and log line.**

The comparison in section 4 ran before these changes. It has not been rerun.

### Not shown yet

- A whole book, and the reader-subagent workflow for one. The run above was three chapters read by one agent.
- A second source on the same topic. The compounding claim (accounts revised in place, principles sharpened) is designed and untested.
- Whether a principles page improves long design sessions. The comparison was short answers.
- Whether the semantic channel improves answers. It was checked on eight hand-written questions, not in a comparison.
- Whether the relaxed length guidance produces better accounts. No ingest has run under it.
- Pinning in a live session. The hook is tested with the same input the host sends, and hasn't been watched working in the desktop app.
- Codex. The plugin carries its manifest and an install script; nothing was run in Codex, because installing there writes to the owner's Codex folder and needs his go-ahead.
- Audio and video transcription against a live provider. It runs against a stand-in server in the tests.
- Any machine but the development one (Windows 11, Node 24).

## Log

- 2026-11-10: read the north star, lessons, the 19 to 23 October audit thread and the owner's messages in the original Codex thread; profiled the Claude library from the first book ingest; wrote this document.
- 2026-11-10: research subagent reported; design adjusted as in "What the research changed". Engine, plugin, guides, tests and docs written. The owner chose the acceptance run's size: three chapters, within five subagents.
- 2026-11-10: acceptance run done (cold ingest, fidelity check, blind comparison); twelve friction findings, thirteen fidelity findings and two recall findings acted on. The working files of the run (reports, tasks, both answer sets, the blinded file, the key and the verdict) are kept with the owner's research, outside this repository.

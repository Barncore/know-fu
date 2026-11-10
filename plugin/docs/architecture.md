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
| Topic page | `knowledge/<domain>/<topic>/TOPIC.md` | A frame for the subject and 6 to 15 principles: statement, why, where it breaks, which accounts it governs, which sources hold it. Then tensions, a decision map, vocabulary, open questions | Whole, when work on the subject starts |
| Accounts | `…/accounts/<name>.md` | One idea each: a mechanism, method, case, reference table or debate, with its numbers and page citations | The few a task needs |
| Source map | `sources/<id>/source.md` | A digest of every stretch of the source, with page ranges, and what the source changed in the library | When looking for where a source covers something |
| Source text | `sources/<id>/text.txt` | The extracted original, a unit per page, section or two minutes of recording | A page at a time, to verify or get detail |

Each layer is an entry point. A broad design task starts at the topic page. A precise lookup goes straight to an account or a page.

The layers depend on each other in one useful way. The agent can compress hard when it writes accounts because the source text is still there underneath. Nothing is lost by leaving common knowledge and the author's repetition in the source.

## What gets stored: the delta

The reader is a frontier model that already holds the common knowledge of most fields. An account earns its place by what it adds to that: the author's frame, surprising claims, numbers and thresholds, the order of steps, decision rules, failure modes, worked cases. The ingest guide gives the test as a question: would a strong general model, asked cold, already say this with this precision?

This matters for more than cost. Research on agent context files and self-written skills in 2026 found that text a model writes for itself, carrying what it already knew, was neutral or slightly harmful, while curated material helped most where the model's training was thin. A library of restated common knowledge would make an agent slower and no better.

## How understanding accumulates

An account is the unit, and it belongs to an idea, never to a source. Its `sources` field lists every source that speaks to it. When a new source arrives, each idea it carries gets one of five outcomes: the library already holds it (add the source and anything new), it extends an account (revise in place), it disputes one (write a debate account both sides link to, and keep both), it is new (write an account), or any model already knows it (leave it in the source).

So the tenth book on a subject adds far less text than the first, and changes the topic page more than it lengthens it. A principle the first book only implied becomes "stated" when the third book states it. A boundary gets sharper when a source shows a failure.

## The engine

The engine does what an agent is bad at or shouldn't spend tokens on. It never calls a model.

| Part | File | Job |
|---|---|---|
| Extraction | `engine/extract.ts`, `sources.ts` | PDF to page text with Poppler; text and Markdown to sections; subtitles and timestamped transcripts to time units; EPUB, DOCX and HTML through pandoc; audio and video through a transcription API, with frames sampled once a minute. Page images and video frames on request |
| Library model | `engine/library.ts`, `frontmatter.ts` | Reads the folder into memory: topics with their principles, accounts with their links and citations, sources with their units and maps |
| Checker | `engine/check.ts` | Frontmatter, links, citations, quoted words against the source text, principles, source maps, sizes, and words compiled against words read. Writes the derived parts: each principle's Governs line, `_index.md`, `INDEX.md`. Commits to git |
| Search | `engine/search.ts` | A SQLite full-text index under `.knowfu/`, rebuilt a file at a time when a file changes |
| Reading | `engine/recall.ts` | `brief`, `recall`, `read`, `connect` |
| Serving | `engine/tools.ts`, `mcp.ts`, `cli.ts` | The nine tools, over MCP and from a shell |

It is TypeScript that Node runs directly, with no build step and no installed dependency. The MCP server is written by hand, because the protocol surface it needs is five methods.

### Recall

`kf_recall` ranks principles and accounts with BM25 over title, summary, keywords and body, title weighted highest. An account under a principle the question also matched gets a small lift. It then packs a briefing to a token budget, in this order: the principles in play, the best accounts in full, any account that disputes or qualifies a loaded one, one line each for other matches, and where the source text speaks to the question.

Two rules hold whatever the budget. The best match is always delivered whole. And an account that disputes or qualifies a loaded account is always named, because dropping a caveat to save tokens produces a confident wrong answer.

A list of sub-questions is ranked per sub-question and merged, so each one's best match is present. `load: "gists"` returns one line per match and loads nothing, for choosing before reading.

### Why there are no embeddings

Search is lexical. Three things make that enough at this size. Every account has a title, a one-line summary and optional keywords written for finding it. The topic page tells the agent the library's own vocabulary before it searches. And the agent can rephrase. A 2026 study found an agent using grep and file reads beat a strong embedding retriever on a research benchmark, with the advantage fading only past a hundred thousand documents. A personal library won't get there. If lexical search starts missing in practice, an optional embedding channel is the next step, and the 0.5 branch has one.

### Why there is no graph database

Connections are written where a reader sees them: a link in a sentence, or a typed line under an account's Connections heading with the reason beside it. `kf_connect` reads those links into memory and walks them. Typed relationship records in a database cost a lot to write and maintain, and the measured gains for graphs come from weak models on multi-hop questions; a strong agent reading linked prose reaches the same places.

## Ownership and history

The Markdown files are the library. `INDEX.md`, each `_index.md` and the search index are generated and can be deleted. Each principle's Governs line is also generated, from the `principles` field of the accounts, so the topic page's links can't drift from the accounts.

History is git. `kf_check` with a commit message writes a line to `log.md` and commits. Going back is `git revert`. Originals, page images and frames are left out of git by the library's `.gitignore`; they sit in the folder and don't change.

One session writes at a time. The home session, opened in the library folder, is the only one that ingests or edits, and a lock file stops two of them overlapping. Any other session reads, and can save a note to `inbox/`. This is also why Claude Code and Codex can share one library.

## Deliberate use and pinning

The library's value comes from its owner's curation, so Know Fu's tools stay closed in a chat until the owner invokes the skill there. In Claude Code a hook enforces that.

Pinning is the exception the owner chooses. `kf_pin` ties a topic to a project folder. Sessions there start with a short block in context, written by a SessionStart hook: the topic's frame in a paragraph and each principle in a sentence, with how to load the rest. The tools are open there without invoking. The block is kept short on purpose. A 2026 study of agents over a large wiki found they did as well with a cheap targeted lookup as with a preloaded index, at lower cost, so what loads up front is the principles and never the catalogue.

## What was left out

Releases, proposals, staged jobs, lifecycle plans, a deletion ledger, modules, per-folder access levels and an evaluation harness all existed in 0.5 and are gone. Git covers versioning and rollback. The home-session rule covers access. Retiring an account (`status: retired` with a reason) covers withdrawal without deleting anything.

Docling and its Python environment are gone too. When a table or formula matters, the agent looks at the page image, which is the check that had to happen anyway.

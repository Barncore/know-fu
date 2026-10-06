# Know Fu roadmap

This is the working to-do list. [NORTH_STAR.md](NORTH_STAR.md) says what Know Fu is for and what the owner has decided, [VALIDATION.md](VALIDATION.md) says what's been shown to work, and this file says what to do next, in order. When a task is done, its result moves into VALIDATION or the change log and the task leaves this list. Task numbers never change, so the change log and the audit report can keep pointing at them.

Updated 6 October 2026, engine 1.2.0 with `kb_connect`, assessments, functional facets and the invention work, all on `main`. New work lands on `staging` first (see [AGENTS.md](../AGENTS.md#branches)).

## Where 1.2.0 leaves things

Version 1.1.0 stored good knowledge and then served it expensively. One answer sent 52,000-80,000 tokens, because retrieval followed every dependency of every match. For scale: the whole synthesized understanding of the three-paper test library is about 11,000 tokens. Ingestion had the mirror-image problem, spending most of the agent's output on bookkeeping.

Version 1.2.0 changes how knowledge gets used and written, not how it's stored:

| Area | 1.1.0 | 1.2.0 |
|---|---|---|
| Answering | `kb_retrieve` packet: every connected body, no budget | `kb_recall`: a ranked, budgeted briefing with caveats carried beside what they qualify. about 6,000-11,000 tokens on the test cases, blind-graded as good as the packet (10 of 10 passed against 9 of 10, on the slightly larger briefings before the audit fixes) |
| Session start | Nothing loaded | `kb_brief`: primers, central ideas, disagreements, next questions, what recent sources added |
| Connecting ideas | No explicit chains | `kb_connect`: the strongest chains of links between two ideas, each hop with its reason, or the bridges an idea reaches in other topics |
| Weighing support | Assessment fields existed, all `not_assessed`, read by nothing | Levels with reasons and a named basis on each account in recall, side by side in conflicts with each side's independent-source count, never used to rank |
| Learning from use | Good answers vanished with the chat | `kb_file`: a cited synthesis, ranked below its sources, flagged when they change |
| Writing knowledge | Hand-written proposal JSON, page text copied into passages | `kb_write` notes; passages built from the extraction; quotes verified; revisions inherit what they don't change |
| Job responses | The full job JSON on every call (117,000 characters for a 30-page paper) | A compact summary (3,600 characters), with the raw JSON on request |
| Coverage receipts | Every unit id listed for read, integrate and check | `coverage_all` for whatever's left in a stage |
| Following links | FalkorDB neighbor lookups (two hops in the packet route, one in progressive reading), with the WSL service running | Personalized PageRank in process over the canonical records: activation spreads several hops and fades with distance, no service needed |

Records, releases, lifecycle, scope, purge and evaluation didn't change, so no library needs migrating.

## Decided on 5 October 2026

- 1.2.0, built on the `claude/know-fu-2` branch, is the line going forward, rather than lifting pieces into 1.1.0. `kb_recall` is the routine way to answer; packet and progressive retrieval stay callable for comparison.
- A Claude Code adapter comes once the owner judges the system finished (task 15).
- Build `kb_connect` now (task 3, built).
- Keep FalkorDB for now as an optional view. Recall, brief and connect run in process and never wait on it. It stays for browsing visually in FalkorDB Browser and for ad hoc Cypher, and a future operational memory layer could reuse the service.
- Make assessments useful: reasoned levels shown in recall and side by side in conflicts, never ranking a winner (task 4, built).

All five are written up in [NORTH_STAR.md](NORTH_STAR.md#decisions-on-5-october-2026).

## Decided on 6 October 2026

- Invention ranks first, with explaining and teaching a close second. See [NORTH_STAR.md](NORTH_STAR.md#decisions-on-6-october-2026).
- Restore functional facets in `kb_write` (task 19, built). The measured cost is in [VALIDATION.md](VALIDATION.md).
- Built, and merged into `main`: the idea lane with its walls (task 20), results from the owner's own tools (task 21), a real `invent` preset with opt-in bridges (task 22), gap suggestions (task 23), the guide changes for inventing, open problems and teaching by comparison (task 24), and decision points on procedures (task 25). Measurements are in [VALIDATION.md](VALIDATION.md).
- A lineage map of sources isn't needed: the owner meant conceptual lineage, which `depends_on`, "Foundations first" and reweaving already carry.
- No `analogous_to` link. An accepted analogy is an idea, with both accounts as its premises; a pattern proven across two or more cases can become a `concept` with `exemplifies` links.
- `staging` is the branch where work lands first, and `main` is the official version.
- D1 and D2 approved and done: the two old branches are deleted, and the skill now fires only on work with a bound Know Fu library.

## Decided on 7 October 2026

- Built: read receipts (D3), the agent named in every record's provenance (D4), evidence families set at registration (D5), the Claude Code adapter beside the Codex one in `plugin/` (D6, with D6a-e as recommended, which also completes task 15), and five specialist tools hidden by default (D12). Measurements and what wasn't run are in [VALIDATION.md](VALIDATION.md).
- The pilot runs with both agents (D7): the same source, ingested by Claude Code and by Codex into two separate isolated libraries, compared, beside the flat-wiki control (D11). Task 2 now describes that design.
- One module with domain tags (D9) is now the setup guides' recommended layout.
- The code is under the MIT licence (D13).
- D10 is deferred for discussion: the owner doesn't want claims expiring on a guessed date, and suggested a sunset action instead. It moved to the second group as D10.
- D8 approved after the owner's questions: long books are read in stages, a book map first and then one reader per span in order, never in parallel, with a digest per chapter. Built as a section of the books guide.

## Waiting on the owner

Fable 5.1 reviewed the whole project on 6 October 2026 ([the audit](#where-these-came-from)), and this is the list of what's left to decide, merged with the owner's own open questions. It's grouped by when the answer is needed, and inside each group the ones I'd approve without hesitation come first and the uncertain or consequential ones last. When the owner decides one, its heading says so and it's added to a "Decided on" list, and if it means building something, it gets a task number. Its D number stays the same.

Each entry ends with a cost-benefit line: what the owner pays (tokens per session or per ingest, waiting time, context the agent has to carry, upkeep) against what they gain, counting what the change unlocks or compounds elsewhere. Token figures come from measurements in [VALIDATION.md](VALIDATION.md) where they exist, and say so when they're estimates.

### Before installing and running the first ingest

#### D1. Delete the two old branches · approved and done

`claude/know-fu-2` and `claude/know-fu-invention` are fully merged into `main`, so deleting them loses nothing. With `staging` as the one working branch, they're just clutter on GitHub.

Cost-benefit: costs nothing and gains a tidier GitHub with one obvious place for new work. Tiny either way.

#### D2. Narrow the skill's trigger · approved and done

The skill's description says to use it when "explaining, teaching, applying, comparing or inventing", which matches almost any request in a harness with fifty skills. Rewrite it to fire on the library: a bound project, ingesting a source, or answering from what the library holds. One line, no effect on the data. The catch: in a project that isn't bound, a plain "explain X" won't load the skill, and that's the point.

Cost-benefit: costs nothing at runtime, and saves the skill's ~1,300 tokens plus a wrong turn every time it would have fired on an unrelated request. The only price is naming the library when you're outside a bound project.

#### D3. Read receipts · approved and done

Today `coverage_all {status:"complete"}` is the agent's word that it read every unit, and nothing checks it. The engine would log which units each job actually served (text units, page images and frames), refuse "complete" for a unit it never served to the end, and put the read ratio in the ingestion report. It doesn't prove the agent understood a page, but it closes the cheapest way to fake reading. About 100-150 lines plus tests. Units marked excluded (covers, blanks, indexes) still just need a reason.

Cost-benefit: no tokens at answer time and milliseconds of bookkeeping at ingest, against making "read" a checked fact under every note. High value, because every answer, reweave and idea built later inherits whatever an ingest skipped.

#### D4. Record which agent wrote each record · approved and done

Every record's provenance says `actor: "codex"`, because it's hard-coded in three places, and jobs wait in a status called `waiting_for_codex`. If Claude ingests the pilot, every record will claim Codex wrote it, and provenance can't be fixed after the fact without new revisions of everything. Each plugin's server config would name its agent, and the job status becomes `waiting_for_agent`, with the old name still accepted. Small change.

Cost-benefit: one field that's already stored, so nothing per session. It unlocks D6, D7 and D23, and skipping it means a new revision of every record later.

#### D5. Set a source's evidence family when registering it · approved and done

The rule that `high` evidence from thin support needs two independent source families only works if families are right. Today every source registers as its own family (`unknown-<hash>`) with independence `unknown`, and no tool can change it. So two copies of one book, or a book and its summary, count as two independent sources. `kb_ingest` would accept `evidence_family`, `independence` and `derived_from` per source, and the ingestion guide would say how to pick them, including `owner` for your own trading journal, session notes and half-finished ideas (which Fable rightly says are good sources nobody suggested). The family is effectively fixed at registration, so this should land before the first real source.

Cost-benefit: a few dozen tokens per source at registration, against honest independent-source counts in every recall and a two-family rule duplicates can't game. Wrong families compound into inflated confidence as the library grows.

#### D6. Claude Code adapter, in this repository · approved and done (D6a-e as recommended)

The engine is agent-neutral; only the packaging is Codex-shaped. Fable recommends building the Claude Code adapter before the pilot rather than "once finished", because your harness, research and review loop all live in Claude, and running the pilot in Codex means learning the agent's behaviour twice. Both adapters can live in the same `plugin/` folder: Codex reads `.codex-plugin/plugin.json` and Claude Code reads `.claude-plugin/plugin.json`, and both read the same `skills/` folder. What it needs:

- D6a. One shared plugin folder with two manifests, rather than two copies. Recommend: shared, so the guides never drift apart.
- D6b. One set of guides, agent-neutral, with a short note where the agents differ (Claude Code has subagents; only Codex runs `kb_evaluate`). Recommend: yes.
- D6c. One library for both agents, with one writer at a time, or a library per agent. Recommend: one library. Two processes on one library are untested, so test that on a throwaway copy first (D23) before both are bound to it.
- D6d. How Claude Code users install it: clone the repo, run the setup guide (Node build, Python converters), then add the clone as a local plugin marketplace. A one-command install from GitHub isn't possible yet, because Claude Code copies only the plugin folder and can't build the engine's native modules or install Python. Recommend: the clone route now.
- D6e. A root `.claude-plugin/marketplace.json`, a "pick your agent" section in the README, the setup guide split into shared engine setup plus one short section per agent, and the package check validating both manifests. These follow from D6a-d.

Cost-benefit: about half a day of build work once and no extra cost per session (either agent loads the same tool descriptions and skill). It unlocks D7 and D8, which hold the biggest ingest savings on this list.

#### D7. Which agent runs the pilot · decided: both, in separate libraries

The library is agent-neutral but the prose isn't: Codex and Claude will write different notes from the same chapter. The owner's call: run both. The same source goes into two separate isolated libraries, one written by Claude Code and one by Codex, and the two libraries and their answers get compared. Separate libraries mean neither agent touches the other's notes, so D23 isn't needed for this. D4 makes each record say which agent wrote it.

Cost-benefit: twice the pilot's ingest tokens, against seeing on identical material which agent writes the better library, which settles who does the ingesting from then on.

#### D8. Read long books in stages, with the whole book in view · approved and done

What actually happens in one long conversation: the model keeps no memory between calls, so every tool call sends the whole conversation so far back to it, with the new result on the end. Providers cache that repeated part, so it's billed at a fraction and doesn't slow things much. The real problem is room. A 300-page book is very roughly 150,000-200,000 tokens of text (an estimate), so the conversation fills up partway through and the harness compacts it: the early chapters survive only as a summary. One long conversation already loses chapter 3 by the time it reaches chapter 8. It just loses it silently. (The earlier version of this entry blamed cost; the context limit is the bigger reason.)

The owner asked whether reading by chapter loses the whole book's teaching. Read naively, yes, so the design keeps the whole book in view:

1. A book map first. One reader goes through the contents, introduction, chapter openings and conclusions, and writes a short map: the argument, the key terms, which chapter builds on which.
2. Then the chapters in order, each read in full by a fresh subagent that gets the book map plus the notes already written for the earlier chapters. Chapter 8's reader knows what chapter 3 established, through chapter 3's notes. In order, not in parallel, because parallel readers can't see each other's chapters.
3. The subagents do the real reading and analysis: they read every unit to its end (which the read receipts check) and write that chapter's notes. Extracting the text is already done by conversion before anyone reads.
4. The main agent never re-reads the pages. It reads the notes and does the cross-chapter work: links between chapters, the comparison with the rest of the library, reweave, the teaching layer and the check.
5. A book or paper that fits comfortably in one context skips all this and gets one reader.

The owner approved this and asked what the book map should decide about how chapters are split among readers. The answer built into the books guide: spans follow chapter boundaries, one chapter per reader by default. Short neighbouring chapters that make one argument are joined, so their cross-references stay in one context. An oversized chapter is split at its sections. Every chapter gets its own digest either way, which is the owner's point: each chapter leaves something the next can build on. Readers get every earlier digest, plus the full note lists only for the chapters the map says they build on, so what each reader carries doesn't balloon over a long book. The size line starts at about 40,000 tokens of text per span and gets tuned in the pilot.

One reader for the whole book in a subagent would only move the room problem into the subagent. What stays risky: a later chapter's reader sees earlier chapters only through their notes, so something the notes left out is invisible to it. The main agent's cross-chapter pass and the check stage are the guard. This is a guide change, nothing in the engine.

Cost-benefit: the book map costs a few thousand tokens, and each chapter reader reloads the guides, the map and the notes so far, roughly 10,000-20,000 tokens each (estimates), against a main conversation that never compacts the book away. Nothing changes for papers and short books, and the gain grows with book length.

#### D9. One wide module, with domain tags · approved, now in the setup guides

When you set up your real library, put everything in one module and separate topics with domain tags. `cross_domain` bridges can only cross what a project can read, and moving a record to another module later is its own operation. Use a separate module only for material that has to stay apart, such as a client's.

Cost-benefit: costs nothing except the option to hide one topic from another project, and gains bridges that can see the whole library, which is where invention compounds. Changing modules later is a per-record operation.

#### D11. Run the pilot beside a flat-wiki control · approved, folded into task 2

The pilot (task 2) proves Know Fu can ingest a chapter. It doesn't prove the structure is worth its weight. Fable's control: the same chapter, by the same agent, written into plain Markdown pages indexed by QMD, with no records, links or reweave. Ask both the same five questions, compare blind, then ingest a second related source into Know Fu and check it revised the first. The control costs maybe a quarter of the Know Fu ingest. If the flat wiki wins, that's worth knowing before you feed it a library.

Cost-benefit: roughly a quarter of the pilot's tokens again plus your time to judge answers blind, once. The result says whether everything else on this list is worth building, so no other decision here unlocks as much.

#### D12. Hide five specialist tools by default · approved and done

The 16 tool descriptions cost about 1,600 tokens in every session. `kb_retrieve` (the two old routes), `kb_propose` and `kb_change` (raw proposals), `kb_lifecycle` (archive, withdraw, purge) and `kb_evaluate` (the Codex evaluation harness) would load only when `KB_ADVANCED_TOOLS` is set. Measured with a real MCP client after building it: 16 tools and about 2,330 tokens become 11 tools and about 1,780, so roughly 550 tokens a session, more than the 330 first estimated, because each tool's input schema costs tokens too. Fable also listed `kb_maintain`, but the publish step calls it to reindex, so it has to stay. Setup, purge and evaluation sessions turn the flag on.

Cost-benefit: about 550 fewer tokens in every session for good (a quarter of the tool listing) and fewer chances to call the wrong tool, against setting a flag in the occasional setup or purge session. Small per session, large summed over every session.

#### D13. A licence · decided: MIT, done

The repository is public with no licence, which means nobody may legally reuse it. That doesn't block installing it for yourself, but it should be settled before anyone else looks. The choice is between permissive (MIT, Apache-2.0), copyleft (GPL-3.0, AGPL-3.0), or source-available but not open source (PolyForm Noncommercial). Dependencies don't constrain the choice: the npm packages are permissive, and FalkorDB (SSPLv1) is a separate service that isn't bundled.

Cost-benefit: no runtime cost. It only matters once others see or use the code, where it decides what they may do.

### Between the first source and the second

#### D14. A "missing foundations" gap signal · approve

The fourth gap signal: concepts that accounts build on or use, but that have no account of their own. That's exactly the list of foundations an advanced book assumed, which answers the wrong-order-books worry directly. About 30 lines in `gaps.ts` with a test.

Cost-benefit: milliseconds and about one line per topic in the brief (around 30 tokens), against a standing answer to "what should I read next". Each foundation you fill strengthens every account built on it, so this one compounds.

#### D15. Record a novelty search on every idea · approve

An originality rating is a guess, and the research is firm that guessed novelty is unreliable: about a quarter of "novel" AI proposals were reworded prior work. `kb_idea propose` would run its own search over the library's knowledge and ideas and store the nearest five with the date, so "original" means "nothing close found in this library as of this date". It also catches near-duplicate ideas before anyone spends a test on one. The rating stays, shown beside the search.

Cost-benefit: an engine-side search per idea (milliseconds, no model tokens) and about 50-100 more tokens when an idea is shown or exported, against spending a real backtest or prototype on an idea the library already holds.

#### D16. Refuse speculative knowledge notes · approve

`kb_write` still accepts `epistemic: hypothesis` on knowledge notes, which is a side door around the ideas lane. Refuse it on new notes and allow it on revisions of existing records, so no library breaks.

Cost-benefit: no tokens, and an occasional refusal that sends a candidate to the ingest report instead. It protects every later recall from speculation dressed as knowledge.

#### D17. Probe questions that stick around (task 8) · approve

Two to five questions per source, rerun after later ingests, to catch knowledge quietly going missing as the library grows. Fable moves it before the second book, and I agree: it's the regression test for the library itself.

Cost-benefit: a few hundred output tokens per source to write the probes and roughly 1,000-2,000 tokens to review each rerun, against catching knowledge that quietly went missing. It's the safety net that makes compounding something you can trust.

#### D18. Reweave packets (task 7) · approve

Reweave is where compounding happens and where a tired agent cuts corners. Handing it each affected account's current text with the notes that triggered it, in one call, lowers the cost of doing it properly.

Cost-benefit: bigger single responses at reweave but fewer calls, likely fewer tokens overall (not yet measured), against a more thorough reweave, the step all compounding depends on.

#### D19. Duplicate warnings at write time (task 9) · approve

Stops the library filling with near-twins as it grows. Calibrate the threshold on the pilot's real notes.

Cost-benefit: milliseconds per note and a short warning when it fires, against a library that doesn't split its support across near-twins or spend recall budgets on duplicates. The gain grows with library size.

#### D20. Reading depth: full, selected or skim · approve, the most consequential in this group

Today every source gets the full eight-stage treatment, so a blog post costs as much ceremony as a textbook, and a library that's expensive to grow stays small. A source would register with `reading_depth`: `full` as today, `selected` for named chapters, `skim` for a lighter pass with no reweave beyond flagging. Every note from a skimmed source carries a `skimmed` flag on its recall line. The cost: skimmed notes still enter the library as knowledge, so a library heavy with them is thinner than it looks. The flag keeps that visible.

Cost-benefit: a few tokens per skimmed account in recall, against ingesting light sources at perhaps a tenth of the cost (Fable's estimate), which grows the library and gives invent more to bridge. The price is thinner knowledge, kept visible by the flag.

#### D21. Record the model's training cutoff beside a result · approve when trading ideas start

For a trading idea, the model that generated it may have seen the test period. One optional field on a result, `generator_cutoff`, beside `data_window`.

Cost-benefit: a few tokens per result, against catching a lookahead leak that can make a worthless strategy look good. It only matters for trading.

#### D22. Measure "it gets smarter" by replay (task 26) · approve after the second source

Releases are immutable, so you can freeze the library from before source B arrived, ask the agent to invent toward what B found, with and without the library, and score the difference. It's the only measure of "ingesting makes it smarter" that isn't a feeling.

Cost-benefit: one measuring session of tens of thousands of tokens, against the only hard number on whether ingesting makes the library smarter, which steers every later investment.

#### D10. Knowledge that goes out of date: validity windows or a sunset action · deferred for discussion

The first version of this entry proposed a guide rule for setting `valid_until` on claims that go stale. The owner's objection is fair: nobody can predict when a book's advice expires, and a guessed date would quietly demote knowledge that's still good. Judging whether a source is already out of date belongs to the agent at ingestion. A date still makes sense when the source states one itself (a tax year, a software version), which is the only case `valid_until` should cover.

The owner's alternative is a sunset: an action on a claim, a concept or a whole source that says "outdated, kept for history". The library has two neighbours already. Archive takes a record out of navigation and recall entirely. Withdraw says "don't rely on this", and it blocks everything resting on it. A sunset would sit between them: still recalled, flagged as outdated, ranked lower, with the accounts built on it flagged for review rather than blocked. That's a lifecycle action plus a recall flag, and it needs the owner's view on what a sunset should do to dependents before anyone designs it.

Cost-benefit: a sunset costs one planned lifecycle action when you use it and a short flag in recall, against outdated advice being visibly marked instead of either trusted or hidden. It matters more as the library ages and holds trading and software material.

#### D23. Test two agents on one library · only if both will share a library

Locks and cache keys exist, but nobody has run Codex and Claude on one library at once. Run it on a throwaway copy before both are bound to the real one. The pilot doesn't need it, since each agent gets its own library there.

Cost-benefit: one short session on a throwaway copy, against the risk of two agents damaging the real library. Worth nothing if only one agent ever writes.

### After the pilot, or when the need shows up

#### D24. Keep files as the canonical store · approve

The owner asked whether the FalkorDB graph should replace the JSON files as the library itself. My recommendation is no, and to keep the graph as a view. A graph database answers traversal questions fast, but Know Fu's recall already runs its graph work in process in milliseconds, and the files give things a graph database doesn't: every revision immutable and hash-checked, a release that's one atomic pointer swap, a purge you can verify because the files are gone, backups that are a folder copy, and a library you can read without a running service. FalkorDB also holds the whole graph in memory and has no built-in versioning, so revisions and releases would have to be rebuilt on top of it. When the library outgrows memory or the release manifests get slow (tasks 11 and 12), add a persistent index beside the files rather than moving the source of truth.

Cost-benefit: nothing now, and a persistent index later if the library gets big. Switching to a graph database would give up history, crash safety and verifiable purges with no speed gain at this size.

#### D25. Move the Codex evaluation harness out of the way · approve hiding it, your call on moving it

The `evaluation*.ts` files (about 1,400 lines) run frozen capability tests through locked-down Codex sessions. They produced the 1.1.0 capability evidence and have been used twice. D12 already hides `kb_evaluate`. Moving the code into its own folder or repository is tidier but changes nothing for daily use.

Cost-benefit: hiding is free once D12 is done. Moving the code costs a few hours for a small gain in tidiness.

#### D26. FalkorDB itself · keep it optional for now, your call

Nothing answers from FalkorDB. The only reason to keep it installed is a future operational memory layer, where Graphiti (which runs on FalkorDB) is the obvious candidate. If that never happens, drop it, and the WSL service with it.

Cost-benefit: keeping it costs a WSL service and setup time on any new machine, and nothing per session. Dropping it saves that friction but closes the easy route to Graphiti for operational memory.

#### D27. A third PDF converter for equation-heavy books · when the first such book arrives

Fable reports that Marker and MinerU lead 2026 benchmarks on formulas and multi-column papers, while Docling leads on tables (not checked here). A third `pdf_profile` would help trading and statistics books. Python work, moderate size.

Cost-benefit: Python setup, a model download and slower conversion for that profile, against correct equations and columns in the books that need them. A bad extraction spoils every note made from it.

#### D28. An audience level on lessons · maybe

A lesson pitched at a novice can hurt an expert and the other way round. A tag on learning records would let a teaching session pick the right level. Small.

Cost-benefit: one tag per lesson, against teaching pitched at the right level. A modest gain until you're making explainers for different audiences.

#### D29. Export a library's procedures as a skill · maybe

A `kb_export skill` that compiles a library's procedures and decision trees into a skill file with citations would make book-to-skill an output of Know Fu rather than a rival. Guide plus template, no engine change.

Cost-benefit: a one-off generation cost per export, against a library's procedures and decision trees being usable in work sessions without recall calls. It pays off more as decision trees accumulate.

### Where these came from

Fable 5.1's strategic audit of 6 October 2026, kept outside the repository with the other research, supplied D2-D3, D5 (in part), D6-D12, D14-D15 and D17-D29. D4 and the evidence-family half of D5 came from checking Fable's points against the code, and D16 from a risk recorded below when the ideas lane was built. D1 and D13 are housekeeping. Fable also recommends treating `kb_idea` as experimental until the pilot has used it, which needs no decision.

## Task list

### Next

#### 1. Install the current engine

Install for both agents, since the pilot uses both (D7), with a backup of any current plugin and cache first. For Codex, follow the plugin refresh steps in [MAINTENANCE.md](MAINTENANCE.md); for Claude Code, add this checkout as a local plugin marketplace ([setup](../plugin/docs/setup.md)). Each agent gets its own isolated pilot library. This changes the working setup, so it needs the owner's go-ahead. Done when a fresh session in each agent lists the eleven everyday tools (including `kb_brief`, `kb_recall`, `kb_connect`, `kb_file`, `kb_write` and `kb_idea`), reads the new guides, and `kb_status` reports the right library, and when a test registration records the right agent as its actor.

#### 2. Run a real ingestion pilot with notes

This is the big one: so far the new tools have only met test libraries. Pick one real book chapter you care about, ideally with a table or a figure. Claude Code and Codex each ingest it into their own isolated library (D7), using `kb_write`, read receipts and the compact job responses. Beside them, one agent writes the same chapter into a flat Markdown wiki indexed by QMD, with no records, links or reweave (D11). Ask all three the same five questions and compare the answers blind. Then ingest a second, related source into both Know Fu libraries and check that it revised what the first one taught.

Record, per agent: output tokens per source page against the 1.1.0 paper pilot (whose proposal JSON was 358 KB for 30 pages), the read ratio from the ingestion report, quote failures, and whatever the agent found awkward. Done when both libraries are published; the blind comparison and the per-agent numbers are in VALIDATION; three application questions pass through `kb_recall` in each; `kb_connect` returns the chains a careful reader would draw; the notes carry assessments where the agent checked something and none where it would have guessed; and the second source's reweave visibly changed the first chapter's accounts.

#### 5. Broad synthesis under a budget

The blind comparison (VALIDATION, 2026-10-05) found recall as good as the packet at an eighth of the material, with one soft spot. On the synthesis case, two relevant accounts didn't fit the 12,000-token budget, and the answer left their branch implicit. Try a larger synthesis default, or one-line summaries of every unloaded account in the same topic. Judge the change on new paraphrased synthesis questions, never on the exposed cases. Since the 6 October audit fixes, briefings carry 5-10% less material at the same nominal budget (the old size accounting undercounted), so rerun the blind comparison here too. Done when synthesis answers cover their branches without the budget creeping above about a quarter of the packet's size.

#### 26. Find out whether invent actually helps

Invent recall, the idea lane and the guide steps are built and tested for correctness, not for whether they produce better inventions. The research proposed three tracks: replay (does an idea generated from the library before a held-out source arrived match what that source later found, against the same model without the library?), the owner's blind pairwise picks between invent and plain answers, and outcomes from ideas the owner actually tests. Start with the owner's blind picks on ten fresh invention questions in a real library, because it's cheapest. Done when there's a number in VALIDATION, with its limits, saying whether invent beats asking the model directly.

#### 6. Load the brief at session start

Have the setup guide add one line to the project's AGENTS.md or CLAUDE.md: call `kb_brief` once before research work in a bound project. Done when a fresh session in a bound project calls it without being told.

### Soon

#### 7. Reweave packets

At the reweave stage, have `kb_job next` return each affected account's current text (capped) with the new notes that triggered it, so the agent can decide without one read per target. The idea comes from Hindsight's consolidation packets. Done when a typical ingest's reweave needs about one call per ten targets.

#### 8. Probe questions that stick around

Store two to five probe questions per source with the job, and add a call that runs each through `kb_recall` and records which accounts it loaded. Rerun them after later ingests to catch knowledge that quietly went missing. It's WiCER's compile, test and refine loop, with the agent as the solver. Done when a later ingest reports probe results for earlier sources.

#### 9. Duplicate warnings at write time

When a new concept or knowledge note scores close to an existing one, `kb_write` names the likely twin so the author revises instead of duplicating. Never merge automatically: Archon lost 13 records to an automatic merge band. Calibrate the threshold on real notes first.

#### 10. Usage ledger

Record which recalled records later filed answers actually cite. Surface accounts that get recalled a lot and never cited, and filed answers whose sources keep changing under them. From Archon's reflection markers.

#### 11. Incremental search projection

Write search documents to stable paths so QMD only re-embeds records that changed, and embed each document with its title, concept names and source citation in front (Hindsight's embedding trick). Done when reindexing after a one-source ingest takes seconds, not minutes.

#### 12. Release storage that doesn't grow with every publish

Store release manifests as deltas with periodic checkpoints, and keep a persistent index from revision to hash. Today every publish rewrites a manifest of every record, and an exact historical read can walk every release.

#### 13. Citations people can read

Let a note or source review set author, year and title, so recall labels read "Demšar 2006 p.12" instead of a file name.

#### 17. Reopen assessments when their support changes

At staging, record the evidence families and challenges each assessment saw. Recall can then say what changed since ("assessed with 1 family, now 2 · 1 new challenge"), and the reweave step can carry it. Time never lowers a level. A volatile scope (prices, versions, regulation) may set an optional `review_after` that shows "review due". From the confidence review of agentmemory's cascade and nvk/llm-wiki's drift checks. Done when a new family or a new challenge shows up on the earlier assessment in recall, and another copy of a known family shows nothing.

#### 18. Counter-search and source labels in conflicts

Add an optional `counter_search {scope, found}` to the evidence assessment, so "looked and found nothing against it" reads differently from "contradicted". Show source labels in words (retracted, erratum, a vendor writing about its own product) beside a source, and never fold them into rank. Flag passages from table, figure and OCR pages that have no fidelity assessment. From PaperQA2 and nvk/llm-wiki.

### Later

#### 14. Discovery helpers

Beyond `kb_connect`'s chains and bridges, the invent slate (task 22) and the gap suggestions (task 23): weakly linked clusters, and the open questions with the most riding on them. It feeds notes and never publishes on its own.

#### 16. Keep the evaluation harness, stop growing it

The version 3 evaluator is Codex-specific and heavy. Use the lighter blind A/B method in VALIDATION for retrieval changes, and save the full harness for formal acceptance gates.

### Parked by the owner

Operational or project memory, knowledge promotion tiers, and several agents writing to one library. Each needs its own decision before anyone starts on it. (`analogous_to` links were parked here too, and on 6 October 2026 the owner ruled them out.)

## What could bite later

| Risk | When it bites | What's in place |
|---|---|---|
| Release manifests and historical lookups grow with records times releases | Noticeable past roughly 10,000 records and a few hundred publishes | Task 12 |
| The recall index keeps every usable record and body in memory, per process | Fine to tens of thousands of records; a very large library needs a persistent index | Measure at 20,000 records before ingesting at that scale |
| CPU re-embedding after every publish | Already minutes for one small paper | Task 11; recall skips semantic search when keywords are enough |
| A stale primer misleads a fresh session | Whenever an ingest skips the compile stage | `kb_brief` flags it, and the compile stage asks for the revision |
| Filed answers crowd out the sources | Lots of near-duplicate filed answers on one topic | They rank at 0.9 and go pending when their sources change; task 9 covers duplicates |
| A verified quote gets used out of context | Quote checks prove the words are there, not what they mean | Reweaving, judgments and challenge links are the defense |
| A budget hides a decisive low-ranked account | Narrow budgets on broad questions | Caveats are packed first and unpacked ones are listed; the skill tells agents to open them; task 5 |
| Skipping semantic search misses a paraphrase | A question uses the library's words with a different meaning | The agent can force `semantic:true`; probe questions (task 8) should include paraphrases |
| A `kb_connect` chain gets read as a causal argument | An agent strings hops into a claim without opening the accounts | The briefing says a chain isn't evidence that one idea causes the other, and the retrieval guide says to open each hop and check its condition |
| Assessment levels get read as verdicts, or filled in by guesswork | An agent picks the higher level in a conflict, or sets levels just to fill the field | Levels never touch ranking; conflicts show both sides with a note to weigh the reasons; `kb_write` refuses a level without a reason or basis, and `high` from thin support in one source family; task 2 checks real notes |
| A test result recorded against an idea is wrong or cherry-picked | The owner's tool had a bug, or only the good runs got reported | The pass rule has to be published a revision before the result and is frozen after it; every result carries a trial count; a failure says whether the idea or the test was at fault. Know Fu can't check that a run happened, so re-running a claimed result stays with the owner's tools |
| A speculative claim enters as knowledge instead of as an idea | An agent writes a knowledge note marked `epistemic: hypothesis`, which `kb_write` still accepts for older libraries | The ingestion guide sends candidate inventions to the report and `kb_idea`; recall flags `hypothesis` on the account's identity line. Refusing it outright would break revisions of existing records, so that waits for a decision |
| Two MCP processes on one library | Codex and Claude, or two sessions at once | Publication locks, control-signature cache keys and the short-lived search worker already handle it, but test it before relying on it |
| The `braces` stack-exhaustion advisory (GHSA-vfj7-8cjw-p6xm), reached through QMD's micromatch and fast-glob | Only if untrusted, deeply nested glob patterns ever reach QMD | Know Fu passes generated collection paths today. Don't add configurable patterns without reviewing this, and don't apply npm's forced QMD downgrade; update when QMD ships a fixed dependency |

## What stays true whatever changes

Canonical JSON records and Markdown bodies own the meaning; the wiki, graph and search index are rebuildable views. Scope, withdrawal, purge and pinned-release rules apply on every read path, recall, brief and connect included. Each author's account stays distinct from synthesis and inference. A capability claim needs a comparison with stated limits behind it, not a green test run. [AGENTS.md](../AGENTS.md) has the working rules.

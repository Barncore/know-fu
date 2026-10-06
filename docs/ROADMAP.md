# Know Fu roadmap

This is the working to-do list. [NORTH_STAR.md](NORTH_STAR.md) says what Know Fu is for and what the owner has decided, [VALIDATION.md](VALIDATION.md) says what's been shown to work, and this file says what to do next, in order. When a task is done, its result moves into VALIDATION or the change log and the task leaves this list. Task numbers never change, so the change log and the audit report can keep pointing at them.

Updated 5 October 2026, engine 1.2.0 with `kb_connect` and assessments.

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
- Still under discussion: idea records with lineage and status, an on-demand invent workflow, recording test results from the owner's own tools, computed gaps, how to store an accepted analogy, and a lineage map of sources. Each gets a task number from 20 once the owner decides.

Right now nothing else waits on the owner except the go-ahead for task 1.

## Task list

### Next

#### 1. Install the current engine for Codex

Point the Codex plugin at this engine and refresh it, following the plugin refresh steps in [MAINTENANCE.md](MAINTENANCE.md), with a backup of the current plugin and cache first. This changes the working Codex setup, so it needs the owner's go-ahead. Done when a fresh Codex session lists `kb_brief`, `kb_recall`, `kb_connect`, `kb_file` and `kb_write` and reads the new guides.

#### 2. Run a real ingestion pilot with notes

This is the big one: so far the new tools have only met test libraries. Ingest one real book chapter into an isolated library using `kb_write`, `coverage_all` and the compact job responses. Record output tokens per source page against the 1.1.0 paper pilot (whose proposal JSON was 358 KB for 30 pages), any quote failures, and whatever the agent still found awkward. Done when the chapter is published; three application questions pass through `kb_recall`; `kb_connect` returns the chains a careful reader would draw on that library; the notes carry assessments where the agent checked something and none where it would have guessed; and the numbers are in VALIDATION.

#### 5. Broad synthesis under a budget

The blind comparison (VALIDATION, 2026-10-05) found recall as good as the packet at an eighth of the material, with one soft spot. On the synthesis case, two relevant accounts didn't fit the 12,000-token budget, and the answer left their branch implicit. Try a larger synthesis default, or one-line summaries of every unloaded account in the same topic. Judge the change on new paraphrased synthesis questions, never on the exposed cases. Since the 6 October audit fixes, briefings carry 5-10% less material at the same nominal budget (the old size accounting undercounted), so rerun the blind comparison here too. Done when synthesis answers cover their branches without the budget creeping above about a quarter of the packet's size.

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

Beyond `kb_connect`'s chains and bridges: weakly linked clusters, and the open questions with the most riding on them, for the `invent` and `investigate` purposes. It feeds notes and never publishes on its own.

#### 15. Claude Code adapter

This waits until the owner judges the system finished. It would bind to its own library; Claude and Codex sharing one library is a separate question.

#### 16. Keep the evaluation harness, stop growing it

The version 3 evaluator is Codex-specific and heavy. Use the lighter blind A/B method in VALIDATION for retrieval changes, and save the full harness for formal acceptance gates.

### Parked by the owner

Operational or project memory, knowledge promotion tiers, several agents writing to one library, and `analogous_to` links. Each needs its own decision before anyone starts on it.

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
| Two MCP processes on one library | Codex and Claude, or two sessions at once | Publication locks, control-signature cache keys and the short-lived search worker already handle it, but test it before relying on it |
| The `braces` stack-exhaustion advisory (GHSA-vfj7-8cjw-p6xm), reached through QMD's micromatch and fast-glob | Only if untrusted, deeply nested glob patterns ever reach QMD | Know Fu passes generated collection paths today. Don't add configurable patterns without reviewing this, and don't apply npm's forced QMD downgrade; update when QMD ships a fixed dependency |

## What stays true whatever changes

Canonical JSON records and Markdown bodies own the meaning; the wiki, graph and search index are rebuildable views. Scope, withdrawal, purge and pinned-release rules apply on every read path, recall, brief and connect included. Each author's account stays distinct from synthesis and inference. A capability claim needs a comparison with stated limits behind it, not a green test run. [AGENTS.md](../AGENTS.md) has the working rules.

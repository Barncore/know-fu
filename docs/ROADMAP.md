# Know Fu roadmap

This is the working task list. [NORTH_STAR.md](NORTH_STAR.md) holds the product intent and the owner's decisions, [VALIDATION.md](VALIDATION.md) holds what has been shown, and this file holds what to do next, in order. When a task finishes, its result moves into VALIDATION or the change log and the task leaves this list. Task numbers stay fixed, so references in the change log and the audit report keep working.

Updated 5 October 2026, engine 1.2.0 with `kb_connect` and assessments.

## Where 1.2.0 leaves the system

Version 1.1.0 stored good knowledge but delivered it expensively. One answer sent 52,000-80,000 tokens because retrieval followed every dependency of every match, while the whole synthesized understanding of the three-paper acceptance library is about 11,000 tokens. Ingestion spent most of its output on bookkeeping.

Version 1.2.0 changes how knowledge is used and authored, not how it is stored:

| Area | 1.1.0 | 1.2.0 |
|---|---|---|
| Answering | `kb_retrieve` packet: every connected body, no budget | `kb_recall`: a ranked, budgeted briefing with caveats carried beside what they qualify; 6,000-12,000 tokens on the acceptance cases, blind-graded equal to the packet (10 of 10 pass against 9 of 10) |
| Session start | Nothing loaded | `kb_brief`: primers, central ideas, disagreements, next questions, what recent sources added |
| Connecting ideas | No explicit chains | `kb_connect`: the strongest chains of links between two ideas, each hop with its reason, or the bridges an idea reaches in other topics |
| Weighing support | Assessment fields existed, all `not_assessed`, read by nothing | Levels with reasons and a named basis on each account in recall, side by side in conflicts with each side's independent-source count, never used to rank |
| Learning from use | Good answers vanish with the chat | `kb_file`: a cited synthesis, ranked below its sources, flagged when they change |
| Authoring | Hand-written proposal JSON, page text copied into passages | `kb_write` notes; passages built from the extraction; quotes verified; revisions inherit |
| Job responses | Full job JSON every call (117,000 characters for a 30-page paper) | A compact summary (3,600 characters); raw JSON on request |
| Coverage receipts | Every unit id listed for read, integrate and check | `coverage_all` for the remaining units of a stage |
| Link-following | FalkorDB neighbor lookups (two hops in the packet route, one in progressive reading); needs the WSL service | In-process personalized PageRank over the canonical records: activation spreads several hops with fading weight, no service needed |

Records, releases, lifecycle, scope, purge and evaluation are unchanged. No library migration is needed.

## Decided on 5 October 2026

- Use version 1.2.0, built on the `claude/know-fu-2` branch, as the line going forward, rather than lifting pieces into 1.1.0. `kb_recall` is the routine answering route; packet and progressive retrieval stay callable for comparison.
- Add a Claude Code adapter once the owner judges the system finished (task 15).
- Build `kb_connect` now (task 3, built).
- Keep FalkorDB for now as an optional view. Recall, brief and connect run in process and never wait on it; it stays for visual browsing in FalkorDB Browser and ad hoc Cypher, and a future operational memory layer could reuse the service.
- Make assessments useful as reasoned levels shown in recall and side by side in conflicts, never ranking a winner (task 4, built).

All five are recorded in [NORTH_STAR.md](NORTH_STAR.md#decisions-on-5-october-2026). Nothing else waits on the owner except the go-ahead for task 1.

## Task list

### Next

1. **Install the current engine for Codex.** Point the Codex plugin at this engine and refresh it, following the plugin refresh steps in [MAINTENANCE.md](MAINTENANCE.md), with a backup of the current plugin and cache first. Needs the owner's go-ahead because it changes the working Codex setup. Done when a fresh Codex session lists `kb_brief`, `kb_recall`, `kb_connect`, `kb_file` and `kb_write` and reads the new guides.
2. **Run a real ingestion pilot with notes.** Ingest one real book chapter into an isolated library with `kb_write`, `coverage_all` and compact job responses. Record output tokens per source page against the 1.1.0 paper pilot (whose proposal JSON was 358 KB for 30 pages), quote failures, and what the agent still found awkward. Done when the chapter is published; three application questions pass through `kb_recall`; `kb_connect` returns the chains a careful reader would draw on that library; the notes carry assessments where the agent checked something, and none where it would have guessed; and the numbers are in VALIDATION.
5. **Broad synthesis under a budget.** The blind comparison (VALIDATION, 2026-10-05) found recall equal to the packet at one-eighth of the material, with one soft spot: on the synthesis case two relevant accounts didn't fit the 12,000-token budget and the answer left their branch implicit. Try a larger synthesis default, or one-line summaries of every unloaded account in the same topic, and judge the change on new paraphrased synthesis questions, never on the exposed cases. Done when synthesis answers cover their branches without the budget rising above about a quarter of the packet's size.
6. **Load the brief at session start.** Have the setup guide add one line to the project's AGENTS.md or CLAUDE.md: call `kb_brief` once before research work in a bound project. Done when a fresh session in a bound project calls it unprompted.

### Soon

7. **Reweave packets.** At the reweave stage, `kb_job next` returns each affected account's current text (capped) with the new notes that triggered it, so the agent decides without one read per target. The idea comes from Hindsight's consolidation packets. Done when a typical ingest's reweave needs about one call per ten targets.
8. **Probe questions that persist.** Store two to five probe questions per source with the job, and add a call that runs each through `kb_recall` and records which accounts were loaded. Rerun them after later ingests to catch lost knowledge. This is WiCER's compile, test and refine loop, with the agent as the solver. Done when a later ingest reports probe results for earlier sources.
9. **Duplicate warnings at write time.** When a new concept or knowledge note scores close to an existing one, `kb_write` names the candidate so the author revises instead of duplicating. Never merge automatically: Archon lost 13 records to an automatic merge band. Calibrate the threshold on real notes first.
10. **Usage ledger.** Record which recalled records later filed answers cite. Surface accounts that are recalled often and never cited, and filed answers whose sources keep changing. From Archon's reflection markers.
11. **Incremental search projection.** Write search documents to stable paths so QMD re-embeds only changed records, and embed each document with its title, concept names and source citation prepended (Hindsight's embedding augmentation). Done when reindexing after a one-source ingest takes seconds, not minutes.
12. **Release storage that doesn't grow with every publish.** Store release manifests as deltas with periodic checkpoints, and keep a persistent index from revision to hash. Today each publish rewrites a manifest of every record, and an exact historical read can walk every release.
13. **Human citations for sources.** Let a note or source review set author, year and title, so recall labels read "Demšar 2006 p.12" instead of a file name.
17. **Reopen assessments when their support changes.** At staging, the engine records the evidence families and challenges each assessment saw. Recall then shows what changed since ("assessed with 1 family, now 2 · 1 new challenge"), and the reweave step carries the change. Time never lowers a level; a volatile scope (prices, versions, regulation) may set an optional `review_after` that shows "review due". From the confidence research on agentmemory's cascade and nvk/llm-wiki's drift checks. Done when a new family or a new challenge shows on the earlier assessment in recall, and another copy of a known family shows nothing.
18. **Counter-search and source labels in conflicts.** Add an optional `counter_search {scope, found}` to the evidence assessment, so "no counter-evidence found in a stated search" reads differently from "contradicted". Show source labels in words (retracted, erratum, a vendor writing about its own product) beside a source, never folded into rank. Flag passages from table, figure and OCR pages that have no fidelity assessment. From PaperQA2 and nvk/llm-wiki.

### Later

14. **Discovery helpers.** Beyond `kb_connect`'s chains and bridges: weakly linked clusters, and the highest-impact open questions, for the `invent` and `investigate` purposes. It feeds notes and never publishes on its own.
15. **Claude Code adapter**, once the owner judges the system finished.
16. **Keep the evaluation harness, stop extending it.** The version 3 evaluator is Codex-specific and heavy. Use the lighter blind A/B method in VALIDATION for retrieval changes, and the full harness only for formal acceptance gates.

### Deferred by the owner

Operational or project memory, knowledge promotion tiers, several harnesses writing to one library, and `analogous_to` links. Each needs its own decision before work starts.

## Failure modes to watch

| Risk | When it bites | Mitigation |
|---|---|---|
| Release manifests and historical lookups scale with records times releases | Noticeable past roughly 10,000 records and a few hundred publishes | Task 12 |
| The recall index holds every usable record and body in memory per process | Comfortable to tens of thousands of records; a very large library needs a persistent index | Measure at 20,000 records before ingesting at that scale |
| CPU re-embedding after each publish | Already minutes for a small paper | Task 11; recall skips semantic search when keywords suffice |
| A stale primer misleads a fresh session | Whenever an ingest skips the compile stage | `kb_brief` flags it; the compile stage asks for the revision |
| Filed answers crowd recall | Many near-duplicate filed answers on one topic | They rank at 0.9 and go pending on change; task 9 covers duplicates |
| A verified quote is used out of context | Quote checks prove presence, not meaning | Reweave, judgments and challenge links remain the defense |
| A budget hides a decisive low-ranked account | Narrow budgets on broad questions | Caveats are packed first and unpacked ones are listed; the skill tells agents to open them; task 5 |
| Automatic semantic skip misses a paraphrase | A question uses library words with a different meaning | The agent can force `semantic:true`; probe questions (task 8) should include paraphrases |
| A `kb_connect` chain is read as a causal argument | An agent strings hops into a claim without opening the accounts | The briefing says a chain is not evidence that one idea causes the other; the retrieval guide says to open each hop and check its condition |
| Assessment levels are read as verdicts, or filled in by guesswork | An agent picks the higher level in a conflict, or sets levels to fill the field | Levels never touch ranking; conflicts show both sides with a note to weigh the reasons; `kb_write` refuses a level without a reason or basis, and `high` from thin support in one source family; task 2 checks real notes |
| Two MCP processes on one library | Codex and Claude, or two sessions | Publication locks, control-signature cache keys and the short-lived search worker already handle it; test before relying on it |

## What future work keeps

Canonical JSON records and Markdown bodies own the meaning; the wiki, graph and search index are rebuildable views. Scope, withdrawal, purge and pinned-release rules apply to every read path, including recall, brief and connect. Each author's account stays distinct from synthesis and inference. Evidence for a capability claim comes from a comparison with stated limits, not from passing tests. [AGENTS.md](../AGENTS.md) lists the working rules.

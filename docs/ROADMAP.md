# Know Fu roadmap

This is the working task list. [NORTH_STAR.md](NORTH_STAR.md) holds the product intent, [VALIDATION.md](VALIDATION.md) holds what has been demonstrated, and this file holds what to do next, in order, plus the decisions that wait on the owner. When a task finishes, move its result into VALIDATION or the change log and delete it here. When the owner decides something, record the decision in NORTH_STAR and remove it from the open list.

Updated 5 October 2026, engine 1.2.0.

## Where 1.2.0 leaves the system

Version 1.1.0 stored good knowledge but delivered it expensively. One answer sent 52,000-80,000 tokens because retrieval followed every dependency of every match, while the whole synthesized understanding of the three-paper acceptance library is about 11,000 tokens. Ingestion spent most of its output on bookkeeping.

Version 1.2.0 changes how knowledge is used and authored, not how it is stored:

| Area | 1.1.0 | 1.2.0 |
|---|---|---|
| Answering | `kb_retrieve` packet: every connected body, no budget | `kb_recall`: ranked, budgeted briefing, caveats carried with what they qualify, 6,000-12,000 tokens on the acceptance cases; blind-graded equal to the packet (10 of 10 pass against 9 of 10) |
| Session start | Nothing loaded | `kb_brief`: primers, central ideas, disagreements, next questions, what recent sources added |
| Learning from use | Good answers vanish with the chat | `kb_file`: cited synthesis, ranked below its sources, flagged when they change |
| Authoring | Hand-written proposal JSON, page text copied into passages | `kb_write` notes; passages built from the extraction; quotes verified; revisions inherit |
| Job responses | Full job JSON every call (117,000 characters for a 30-page paper) | Compact summary (3,600 characters); raw JSON on request |
| Coverage receipts | Every unit id listed for read, integrate and check | `coverage_all` for the remaining units of a stage |
| Link-following | FalkorDB neighbour lookups (two hops in the packet route, one in progressive reading); needs the WSL service | In-process personalized PageRank over canonical records: activation spreads several hops with fading weight; no service needed |

Records, releases, lifecycle, scope, purge and evaluation are unchanged. No corpus migration is needed.


## Decided on 5 October 2026

- Use version 1.2.0, built on the `claude/know-fu-2` branch, as the line going forward, rather than lifting pieces into 1.1.0. That makes `kb_recall` the routine route for answering; packet and progressive retrieval stay callable for comparison.
- Add a Claude Code adapter once the owner judges the system finished (task 15).

Both are recorded in [NORTH_STAR.md](NORTH_STAR.md#decisions-on-5-october-2026).

## Still open

### FalkorDB's role

Connecting dots across several hops is the point of the project, so it matters what does that work now. In 1.1.0 FalkorDB answered one question: which records sit next to these ones. The packet route asked it twice in a row (two hops) and progressive reading once. In 1.2.0 recall does the hopping in process over the same typed links, read straight from the canonical records. It spreads activation from the best matches along every link for many steps, fading with distance (about a quarter of the activation is still moving at the third hop), so an explanation three links away can surface with no words in common with the question. Explain and teach also walk prerequisite chains up to four hops to give a foundations-first reading order. Provenance, the record of what was derived from what, lives in each record's exact inputs; impact and withdrawal checks already walk it in process, and nothing ever queried FalkorDB's copy of it.

So recall does not use FalkorDB, and nothing the system does today needs it. What neither FalkorDB's old use nor recall offers is an explicit chain: "how does this idea connect to that one, link by link, with the reason for each link". That is task 3. It can run on either engine; at personal-library scale the in-process link map answers in milliseconds without a service.

| Option | What it means |
|---|---|
| Keep it installed as an optional view (recommended) | Rebuilt on reindex, for browsing the graph visually in FalkorDB Browser and ad hoc Cypher questions. Answering never waits on it. The planned operational memory layer (Memory Graph can run on FalkorDB) would reuse the same service. |
| Make it the engine for task 3 | Path questions go through Cypher; the service has to be running for them to work. |
| Retire it | Removes the WSL service and the reindex cost; loses the visual and Cypher view. |

### Assessments: confidence that does work

Every record can carry three judgments, fidelity (did we read the source right), evidence (how well supported is the claim) and applicability (does it hold here), each a level from low to high with a one-line reason. In the acceptance library all of them were `not_assessed`. The 1.1.0 guide said default unassessed values are generated and "Do not manufacture confidence scores", never said when an assessment is worth making, and nothing downstream read them. Agents followed the instruction.

They are worth having, because they carry what the independent-source count cannot: quality of support, not quantity. One controlled experiment and five blog posts restating an opinion should not weigh the same when two accounts conflict. Hindsight and Archon both tried numeric scores and neither made them stick (Hindsight removed its confidence scores; Archon computes a source-quality score that nothing reads), which argues for reasoned levels that something uses. Recommendation: task 4.

## Task list

### Next

1. **Install 1.2.0 for Codex.** Point the Codex plugin at this engine and refresh it, following the plugin refresh steps in [MAINTENANCE.md](MAINTENANCE.md), with a backup of the current plugin and cache first. Needs the owner's go-ahead because it changes the working Codex setup. Done when a fresh Codex session lists `kb_brief`, `kb_recall`, `kb_file` and `kb_write` and reads the new guides.
2. **Run a real ingestion pilot with notes.** Ingest one real book chapter into an isolated library with `kb_write`, `coverage_all` and compact job responses. Record output tokens per source page against the 1.1.0 paper pilot (whose proposal JSON was 358 KB for 30 pages), quote failures and what the agent still found awkward. Done when the chapter is published, three application questions pass through `kb_recall`, and the numbers are in VALIDATION.
3. **Connect the dots on request.** Add `kb_connect {from, to}`: the strongest chains of typed links between two ideas, each hop shown with its predicate and rationale, plus `kb_connect {from}` for what sits two or three hops away in other topics. Weight hops by predicate, avoid hub nodes, respect scope and withdrawal like recall. Done when "how does A relate to C" returns the chain a careful reader would draw, on the acceptance library and the task 2 library.
4. **Make assessments earn their place.** Ask for an evidence level with a one-line reason on every knowledge note that makes an empirical claim or recommendation, fidelity when the reading was checked against the page image, and applicability when a note is applied to a context; skip them when they would be guesses. Show them in recall's identity line, and set them side by side wherever a challenge link or judgment joins two accounts. Never rank a winner by them. Done when a conflict in recall shows the quality of support on both sides.
5. **Broad synthesis under a budget.** The blind comparison (VALIDATION, 2026-10-05) found recall equal to the packet at one-eighth of the material, with one soft spot: on the synthesis case two relevant accounts did not fit the 12,000-token budget and the answer left their branch implicit. Try a larger synthesis default, or one-line summaries of every unloaded account in the same topic, and judge the change on new paraphrased synthesis questions, never on the exposed cases. Done when synthesis answers cover their branches without the budget rising above about a quarter of the packet's size.
6. **Load the brief at session start.** Have the setup guide add one line to the project's AGENTS.md or CLAUDE.md: call `kb_brief` once before research work in a bound project. Done when a fresh session in a bound project calls it unprompted.

### Soon

7. **Reweave packets.** At the reweave stage, `kb_job next` returns each affected account's current text (capped) with the new notes that triggered it, so the agent decides without one read per target. Idea from Hindsight's consolidation packets. Done when a typical ingest's reweave needs about one call per ten targets.
8. **Probe questions that persist.** Store two to five probe questions per source with the job, and add a call that runs each through `kb_recall` and records which accounts were loaded. Rerun them after later ingests to catch lost knowledge. This is the compile, test, refine loop from WiCER, with the agent as the solver. Done when a later ingest reports probe results for earlier sources.
9. **Duplicate warnings at write time.** When a new concept or knowledge note scores close to an existing one, `kb_write` names the candidate so the author revises instead of duplicating. Never merge automatically: Archon lost 13 records to an automatic merge band. Calibrate the threshold on real notes first.
10. **Usage ledger.** Record which recalled records later filed answers cite. Surface accounts that are recalled often and never cited, and filed answers whose sources keep changing. From Archon's reflection markers.
11. **Incremental search projection.** Write search documents to stable paths so QMD re-embeds only changed records, and embed each document with its title, concept names and source citation prepended (Hindsight's embedding augmentation). Done when reindexing after a one-source ingest takes seconds, not minutes.
12. **Release storage that does not grow with every publish.** Store release manifests as deltas with periodic checkpoints and keep a persistent revision-to-hash index. Today each publish rewrites a manifest of every record and an exact historical read can walk every release.
13. **Human citations for sources.** Let a note or source review set author, year and title, so recall labels read "Demšar 2006 p.12" instead of a file name.

### Later

14. **Discovery helpers.** Beyond the paths in task 3: weakly linked clusters, accounts that bridge topics, and the highest-impact open questions, for the `invent` and `investigate` purposes. It feeds notes and never publishes on its own.
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
| Two MCP processes on one library | Codex and Claude, or two sessions | Publication locks, control-signature cache keys and the short-lived search worker already handle it; test before relying on it |

## What future work keeps

Canonical JSON records and Markdown bodies own the meaning; the wiki, graph and search index are rebuildable views. Scope, withdrawal, purge and pinned-release rules apply to every read path, including recall and brief. Each author's account stays distinct from synthesis and inference. Evidence for a capability claim comes from a comparison with stated limits, not from passing tests. [AGENTS.md](../AGENTS.md) lists the working rules.

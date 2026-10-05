# Using the knowledge

## Recall first

`kb_recall {query, purpose}` is the default for every question. It searches keywords and, when keywords look weak, the semantic index. It then spreads along typed links so connected explanations surface even without shared words, fuses the ranks and packs the result into a token budget. The briefing holds:

- the best explanations in full, best first, with their conditions ("Holds when / Not for");
- caveats that must travel with them: accounts or passages that qualify or challenge them, and current judgments about them, loaded right after the account they qualify;
- for `explain` and `teach`, conceptual prerequisites and a "Foundations first" reading order from fundamentals to the answer;
- sources with page labels, verified quotes, and how many independent sources stand behind each account;
- flags: `contested`, `pending reassessment` (newer evidence changed something it rests on), `filed answer` (a cited synthesis from an earlier session, ranked below its sources), `applicability unknown` when a structured condition cannot be checked;
- assessment levels such as `evidence moderate` or `fidelity high`, when someone assessed the account, with an `Assessed:` line giving the basis and reason for each. No level means nobody assessed it, not that it is weak;
- what did not fit: caveats not loaded, related accounts not loaded, nearby open questions.

Pick the purpose that matches the task, because it shifts ranking and the default budget:

| Purpose | Resolve before answering |
|---|---|
| `explain` | What it means, why it works, the boundary that changes the account |
| `teach` | Prerequisites, a coherent sequence, a worked case, a likely misunderstanding |
| `apply` | Required inputs, decision steps, failed preconditions, what the result permits |
| `compare` | Each account's definition, scope and evidence, and what would decide between them |
| `invent` | Supported mechanisms, compatible assumptions, the new inferential step, a test that could reject it |
| `synthesize` | The relevant branches, minority positions and exceptions |
| `investigate` | The consequential gap, the decision it could change, the most useful next check |

## Going further

Stop when the task's requirements are met. Go further only for a reason you could state:

- A line under "Caveats not loaded" bears on your answer: open it with `kb_read {kind:"accounts", record_refs:[{id, revision}]}` (up to 12 at once).
- A related account matters: open it the same way, or recall again with a narrower query and `seen:[ids you already hold]` so nothing is sent twice.
- The question is broad: raise `budget_tokens` (default 6,000 to 12,000 by purpose; maximum 60,000) or set `depth:"deep"` to include the source pages behind loaded accounts.
- An exact quotation, table cell or calculation matters: open the cited passage. For tables, equations and figures, check the original page image through the job's units when the extraction is ambiguous.
- Keywords keep missing: set `semantic:true` to force the semantic index.
- You want the shape of a whole topic: `kb_read {kind:"catalogue"}` and `{kind:"topic", topic}` list accounts with summaries. Progressive retrieval (`kb_retrieve {mode:"progressive"}`) and the legacy packet route (`mode:"packet"`) remain for comparison; prefer recall.

Each extra call resends the conversation so far, so a second narrow recall usually beats one huge one.

## Connecting ideas

Recall already follows links to rank what it loads, but it doesn't show the path. When the path is the point, use `kb_connect`:

- `kb_connect {from, to}` returns up to three of the strongest chains between two ideas within four hops. Each hop names the link in its direction ("qualifies", "is a prerequisite for", "weighs"), the record it reaches, and the reason written for that link.
- `kb_connect {from}` with no target lists ideas two or more hops away. Ideas in other topics come first as possible bridges; ideas in the same topic that aren't directly linked come second.
- `from` and `to` take a record id, `id@revision`, or a few words. Words resolve to the best-matching account, and the briefing says which record it picked. Raise `max_hops` (up to 6) or `paths` (up to 8) when the default finds nothing.

Treat a chain as a lead, not a finding. Each hop is a link someone recorded with a reason, so the chain tells you where to read. It doesn't show that one idea causes the other, or that a mechanism transfers. Before you build an argument on a chain, open the accounts along it with `kb_read {kind:"accounts"}` and check that each hop's condition holds for your case. A chain that passes through a broad hub idea is weaker than one through specific accounts; the search already penalizes hubs, but say so when a chain depends on one.

"No chain within N hops" is a real answer. The library may not link the ideas yet. That gap can be the most useful thing to report, along with the source or question that would close it.

## Answering

Write connected prose in your own words and cite record ids for the claims that carry weight. Inference is welcome when its premises are named. Keep three things apart: what a source says, what follows from combining sources, and what you are proposing. Model knowledge can help you explain, but it is never library evidence. When the library lacks something, say so and name the source or question that would fill it.

When accounts conflict, compare definitions, populations, timing, units, assumptions and method. Keep genuine alternatives open and say what would decide between them. Never settle a conflict by age, popularity, confident wording or your own preference. Missing applicability context stays unknown.

When the sides of a conflict carry assessments, the briefing shows them on a "Side by side" line: each side's levels, the kind of support behind its evidence level, and its count of independent sources. Use the reasons behind the levels to explain where the evidence is stronger and why. A higher level is not a verdict: a well-supported claim can still be out of scope for the case, and an unassessed one may simply be unchecked.

Retrieval rank is relevance, not truth. A repeated derivative source, or a summary and its body, is not independent corroboration. The independent-source count in the briefing already merges one source's pages into one.

## Filing answers back

A substantive answer that connects accounts in a reusable way is worth keeping. When the user agrees, call `kb_file {title, answer_markdown, cites:[ids you relied on], question, authorization}`. Use `form` `synthesis` for an explanation, or `application` and `worked_example` for an applied case. Use `epistemic:"inference"` when the answer goes beyond what the cited accounts state. `dry_run:true` previews the record. The filed answer pins the revisions it cites; when any of them changes, it is flagged for review.

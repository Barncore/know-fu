# Using the knowledge

## Recall first

`kb_recall {query, purpose}` is where every question starts. It searches by keyword and, when keywords look weak, by meaning through the semantic index. Then it spreads along typed links, so connected explanations surface even when they share no words with the question. It fuses those rankings and packs the result into a token budget. The briefing you get back holds:

- the best explanations in full, best first, with their conditions ("Holds when / Not for");
- the caveats that have to travel with them: accounts or passages that qualify or challenge them, and current judgments about them, each loaded right after the account it qualifies;
- for `explain` and `teach`, conceptual prerequisites and a "Foundations first" reading order, from fundamentals up to the answer;
- sources with page labels, verified quotes, and how many independent sources stand behind each account;
- flags: `contested`, `pending reassessment` (newer evidence changed something it rests on), `filed answer` (a cited synthesis from an earlier session, ranked below its sources), and `applicability unknown` when a structured condition can't be checked;
- assessment levels such as `evidence moderate` or `fidelity high`, when someone assessed the account, with an `Assessed:` line giving the basis and reason for each. No level means nobody assessed it, not that it's weak;
- for `teach` and `apply`, a procedure's decision points as a small tree: when each choice comes up, the branches, how to check the result, and which choices the source never states;
- what didn't fit: caveats not loaded, related accounts not loaded, nearby open questions. "Caveats not loaded" also names premises underneath what was loaded that carry their own condition or boundary, and, on a pinned release, qualifications published after it. Read those as seriously as the ⚠ lines.

The header's token figure is the whole briefing. If it's over budget, the briefing says why: the best match is always whole, and caveats are listed even when they don't fit.

Pick the purpose that matches the task. It shifts the ranking (forms that fit the purpose rank a quarter higher), the default budget, and what the briefing adds:

| Purpose | Budget | Ranks up | Adds | Settle this before answering |
|---|---|---|---|---|
| `explain` | 7,000 | mechanisms, explanations, syntheses, concepts | prerequisites, "Foundations first" | What it means, why it works, the boundary that changes the account |
| `teach` | 9,000 | primers, teaching sequences, worked examples, near misses, lessons, concepts | prerequisites, "Foundations first", decision trees | Prerequisites, a coherent sequence, a worked case, a likely misunderstanding |
| `apply` | 7,000 | procedures, applications, worked examples, near misses | decision trees | Required inputs, decision steps, failed preconditions, what the result allows |
| `compare` | 8,000 | syntheses, judgments, explanations | | Each account's definition, scope and evidence, and what would decide between them |
| `invent` | 9,000 | mechanisms, questions, syntheses | what each account does in domain-free words, ideas on file, bridges to other topics, loose ends | Supported mechanisms, compatible assumptions, the new inferential step, a test that could reject it |
| `synthesize` | 12,000 | primers, syntheses, teaching sequences, judgments | | The relevant branches, minority positions and exceptions |
| `investigate` | 6,000 | questions, judgments | gaps the library's shape suggests | The gap that matters, the decision it could change, the most useful next check |

One call takes one purpose. When a task needs two, such as building a tool (`apply` for the known procedures and their decision trees) and finding a new angle on it (`invent`), call twice and pass the first call's ids as `seen` so nothing comes back twice.

## Going further

Stop when the task's requirements are met. Go further only for a reason you could say out loud:

- A line under "Caveats not loaded" bears on your answer. Open it with `kb_read {kind:"accounts", record_refs:[{id, revision}]}` (up to 12 at once).
- A related account matters. Open it the same way, or recall again with a narrower query and `seen:[ids you already hold]` so nothing gets sent twice.
- The question is broad. Raise `budget_tokens` (the default is 6,000 to 12,000 depending on purpose; the maximum is 60,000), or set `depth:"deep"` to include the source pages behind loaded accounts.
- An exact quotation, table cell or calculation matters. Open the cited passage. For tables, equations and figures, check the original page image through the job's units when the extraction looks ambiguous.
- Keywords keep missing. Set `semantic:true` to force the semantic index.
- You're looking for what to research next. `investigate` lists gaps around the loaded accounts that nobody has recorded as a question yet: a challenge no judgment weighs, an account several others build on that rests on one source, and a central mechanism or procedure with no stated limits. `kb_brief` ranks the same suggestions under each topic's recorded questions.
- You want the shape of a whole topic. `kb_read {kind:"catalogue"}` and `{kind:"topic", topic}` list accounts with summaries. Progressive retrieval (`kb_retrieve {mode:"progressive"}`) and the old packet route (`mode:"packet"`) are still there for comparison, but prefer recall.

Every extra call resends the conversation so far, so a second narrow recall usually beats one huge one.

## Connecting ideas

Recall already follows links to decide what to load, but it doesn't show you the path. When the path is the point, use `kb_connect`:

- `kb_connect {from, to}` returns up to three of the strongest chains between two ideas, within four hops. Each hop names the link in its direction ("qualifies", "is a prerequisite for", "weighs"), the record it reaches, and the reason written for that link.
- `kb_connect {from}` with no target lists ideas two or more hops away. Ideas in other topics come first, as possible bridges; ideas in the same topic that aren't directly linked come second.
- `from` and `to` take a record id, `id@revision`, or a few words. Words resolve to the best-matching account, and the briefing tells you which record it picked. If the default finds nothing, raise `max_hops` (up to 6) or `paths` (up to 8).

Treat a chain as a lead, not a finding. Each hop is a link somebody recorded with a reason, so the chain tells you where to read. It doesn't show that one idea causes the other, or that a mechanism transfers. Before building an argument on a chain, open the accounts along it with `kb_read {kind:"accounts"}` and check that each hop's condition holds for your case. A chain through a broad hub idea is weaker than one through specific accounts. The search already penalizes hubs, but say so when a chain depends on one.

"No chain within N hops" is a real answer too. It may mean the library doesn't link the ideas yet, and that gap can be the most useful thing you report, along with the source or question that would close it.

## Inventing

`kb_recall {purpose:"invent"}` loads the matching accounts, each with a `Does: … · By: …` line: what it does and how, in words with the field's jargon taken out. Those wordings are what let a mechanism from one field answer a problem in another. Around the matches it adds a slate:

- Ideas on file that match the question or rest on the loaded accounts. Refuted ones say why they failed. Don't propose one of those again unless you can say what's different this time.
- Bridges: accounts in other topics that link to the matches, or that do the same job in other words. They only show with `cross_domain:true`. Without it you get a one-line count of how many exist. Ask the owner whether this session should borrow from other fields. Some inventions want that, and some want to stay inside one field. With `domains` set and `cross_domain` off, invent stays entirely inside those topics.
- Loose ends: matched accounts the library has barely linked to anything. Unexplored combinations often start there.

Then work through these, in this order:

1. Write down the owner's framing in one sentence, including what it takes for granted. Make at least one candidate that rejects that premise. Models accept a user's framing far more often than they should, so the counter-framing has to be deliberate.
2. Generate past the obvious. Write candidates in batches of five. After each batch, count how many are new ideas rather than rewordings of earlier ones. Keep going until a batch adds one new idea or none, aiming for about twenty before judging any. The first few are usually the typical answers that anyone would give.
3. Rate originality and feasibility separately, each as low, medium or high with a one-line reason. Never add or average them. Ask the owner for a feasibility floor, then put the most original candidates above it first. `kb_idea {action:"list", min_feasibility}` sorts saved ideas the same way.
4. Give every candidate worth keeping a kill test: the result that would show it's wrong. An idea without one isn't ready to save.
5. Keep three things visibly apart in the answer: what the sources say, what follows from combining them, and what you're proposing.

Save the candidates the owner wants to keep with `kb_idea {action:"propose"}`, naming their premises. The [ideas guide](ideas.md) covers the lane, testing and export. An idea is never evidence, so no later answer can cite one as support.

## Answering

Write connected prose in your own words, and cite record ids for the claims that carry weight. Inference is welcome when you name its premises. Keep three things visibly apart: what a source says, what follows from combining sources, and what you're proposing. Your own background knowledge can help you explain, but it's never library evidence. When the library lacks something, say so and name the source or question that would fill it.

When accounts conflict, compare definitions, populations, timing, units, assumptions and method. Keep genuine alternatives open and say what would decide between them. Never settle a conflict by age, popularity, confident wording or your own preference. Missing applicability context stays unknown.

When the sides of a conflict carry assessments, the briefing puts them on a "Side by side" line: each side's levels, the kind of support behind its evidence level, and its count of independent sources. Use the reasons behind the levels to explain where the evidence is stronger, and why. A higher level isn't a verdict. A well-supported claim can still be out of scope for the case, and an unassessed one may simply be unchecked.

Retrieval rank means relevance, not truth. A repeated derivative source, or a summary and its own body, isn't independent corroboration. The independent-source count in the briefing already merges one source's pages into one.

## Filing answers back

A substantial answer that connects accounts in a reusable way is worth keeping. When the user agrees, call `kb_file {title, answer_markdown, cites:[ids you relied on], question, authorization}`. Use `form` `synthesis` for an explanation, or `application` and `worked_example` for an applied case. Use `epistemic:"inference"` when the answer goes beyond what the cited accounts state. `dry_run:true` previews the record first. The filed answer pins the revisions it cites, and when any of them changes, it gets flagged for review.

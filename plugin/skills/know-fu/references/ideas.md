# Ideas

An idea is a candidate invention: something that might work, resting on accounts in the library. Know Fu keeps ideas in their own lane, because an untested idea that leaks into answers can mislead the library and everything that reads it later. `kb_idea` is the only way in.

## The walls

These hold in the engine, whatever tool or note format writes the records:

- Recall shows ideas only for `purpose:"invent"`. `explain`, `teach`, `apply`, `compare`, `synthesize`, `investigate`, `kb_connect`, the wiki's search index, progressive reading and packet retrieval never see them.
- Nothing can rest on an idea. A note, a filed answer, a relationship or a judgment that names one as an input fails at publish.
- An idea rests on library accounts or passages (its premises). An earlier idea enters only as a parent, and only after a decisive test: an untested idea can't parent another.
- Status follows results. You can't set `supported` or `refuted` directly.
- When a premise changes, the idea shows "a premise changed since it was written". When a premise is withdrawn, it shows "a premise was withdrawn or lost its support". Ingestion never has to reassess ideas; you look at them again with `revise`.

## Saving ideas

```json
{"action": "propose",
 "statement": "One or two sentences saying the idea.",
 "kill_test": "The result that would show it's wrong.",
 "premises": ["knowledge:…", "knowledge:…@3"],
 "originality": {"level": "high", "why": "Not in any source"},
 "feasibility": {"level": "medium", "why": "Needs paraphrase pools"},
 "title": "Short name", "origin": "How it came about",
 "authorization": "The owner's words asking to save it"}
```

`premises` take an id (its current revision) or `id@revision`. `parents` take tested ideas. `pass_rule` is optional at this point, and `detail` holds longer Markdown. Send `ideas:[…]` to save several in one publish. Originality and feasibility stay separate fields. Nothing in Know Fu combines them.

## Testing ideas

Know Fu doesn't run tests. The owner's own tools do (a backtester, a mastering chain, a prototype), and Know Fu records what they report.

1. Declare the pass rule before the run: `{action:"plan", idea, pass_rule}`. The status moves to `under_test`. A rule can change until the first result is recorded, and every change stays visible in the idea's revisions.
2. Record the result: `{action:"result", idea, tool, version, outcome, trials, data_window?, metrics?, note?}`. `outcome` is `pass`, `fail` or `inconclusive`, judged by the declared rule. `trials` counts every variant or setting tried in that run, including the ones thrown away. That count is what lets someone discount a lucky pass later.
3. A `fail` needs `failure:{kind, reason}`. Use `kind:"idea"` when the idea itself was wrong, which refutes it. Use `kind:"execution"` when the build or the test was wrong, which leaves the idea where it was.

Statuses: `proposed` (no pass rule yet), `under_test` (rule declared, nothing decisive yet), `supported` (latest decisive result passed), `refuted` (latest decisive result failed on the idea itself), and `dormant` (parked with `{action:"park", idea, reason}`, back with `unpark`). A later decisive result can flip supported to refuted, or the other way.

Once an idea has any result, its statement, kill test, pass rule and premises are fixed. Rewording it after seeing the data would make the result meaningless. To change it, propose a new idea with this one as its parent.

## Looking again

`{action:"revise", idea, reason}` moves the premises to their current revisions and clears the changed-premise flag. The response names each premise that moved, so check the idea still follows from them. Before any result, `revise` can also change `statement`, `kill_test` and `premises`. Ratings and `origin` can change at any time.

## Reading and exporting

- `{action:"list"}` groups ideas by status. Filter with `status`, `query` and `domains`. With `min_feasibility`, it drops ideas below that floor and puts the most original first.
- `{action:"show", idea}` gives the whole idea: premises with their current state, parents, ideas built on it, and every result with its metrics.
- `{action:"export"}` takes the same filters and writes JSON (`know-fu-ideas-1`) into the library's `exports/ideas/` folder. Each idea carries its statement, kill test, pass rule, ratings, premises with summaries and source titles, lineage, results and total trials. That's the hand-off to the owner's own tools.

Writes need `authorization`: the owner's request, quoted or summarized. Save an idea only when the owner wants it kept.

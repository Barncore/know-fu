# Ingesting a source

Contents: what an ingest produces · the delta test · the stages · a long source over several sessions · reading a long source with readers · principles · accounts · the second source and after · figures, tables and video · the probe check · the report.

## What an ingest produces

When you finish, five things are true:

1. The source is registered, with its original kept and its text extracted into units a citation can name.
2. `source.md` maps the whole source: a digest for every stretch of it, in order, with nothing left uncovered.
3. The topic page states the subject's principles, and each principle this source bears on has been added, sharpened, qualified or disputed.
4. Accounts hold the specifics this source adds, each one idea, each cited to pages, each under the principle it is a case of. Accounts that already existed and that this source touches have been revised in place.
5. `kf_check` reports no errors, the change is committed, and the owner has a short report of what changed.

The measure of success is compression with nothing lost. The original stays in the library, searchable by page, so the compiled layer never needs to repeat it. `kf_check` prints the words in accounts citing the source against the words the map covers. A whole first book on a topic usually lands between 8% and 20%. Its densest technical chapters, taken alone, can reach 25% to 30%, because numbers and steps don't compress. The checker warns above 30%, and the answer to that warning is to look for retelling, never to cut specifics. A later book on the same topic adds much less, because most of what it says lands in accounts that already exist.

## The delta test

The reader of this library is a frontier model. It already knows the common knowledge of most fields. What it lacks from a specialist source is narrower, and that is what you keep:

- the author's frame: the idea that makes the subject hang together their way
- claims that surprise, or that contradict common advice
- specifics: numbers, thresholds, orders of steps, decision rules, named techniques
- conditions and failure modes: when the usual advice breaks, and what the author says not to do
- worked cases, with what they show
- the author's own terms, where they carve the subject differently

For each thing you might write down, ask: would a strong general model, asked cold, already say this with this precision? If yes, it isn't worth an account. At most it is a clause that sets up something that is.

> Not kept: "Overfitting means the strategy has fitted noise in the sample." Any model says this unprompted.
>
> Kept: "The author won't read a backtest with fewer than 30 trades per free parameter, and drops any parameter whose neighbours within 10% either side lose more than half the edge [KEY p.212]." A rule with numbers, which the model could not have produced.

(The example is invented to show the shape.)

Two things the test is not. It is not a quota: a practitioner's private course may be nearly all delta, and a popular overview nearly none. And it is not a licence to drop detail you find dull: exact numbers, the order of steps and the exceptions are what a specialist source is for. Compress the prose, never the specifics.

## The stages

The order matters, because each stage is what makes the next one possible.

1. **Register.** `kf_source` with action "add". Agree the topic with the owner if the source's place isn't obvious (`kf_brief` shows what exists). A new topic is a new folder: `node <plugin>/engine/cli.ts new <domain>/<topic>` writes the page skeleton.
2. **Read and map.** Read the whole source and write the map in `source.md`: one `### Title [p.A-B]` heading per chapter or stretch, each with a digest. The digest format is below. Nothing is compiled yet. For a long source, use readers (next section).
3. **Plan.** With the whole map in view and the existing topic page open, write `sources/<id>/plan.md`: the principles this source holds (new, or a change to an existing one), each with the pages where the source states it or the pages you infer it from, and the list of accounts to write or revise, each with its name, kind, governing principle and pages. This is where consolidation happens. Material on one idea from five chapters becomes one account; an idea the library already holds becomes a revision. Prefer fewer, fuller accounts to many thin ones. The plan is cheap to change and the accounts are not, so settle the list here.
4. **Write the accounts**, re-reading the cited pages as you write each one. Never write an account from a digest alone: the digest says what is there, and the page says what it says.
5. **Weave.** Write or revise the topic page: the frame, each principle, tensions, the decision map, vocabulary, open questions. The plan's notes on each principle become its Held by line. Revise older accounts the source touches. Fill in "About" and "What it changed" in `source.md`, set its `status: compiled`, and delete `plan.md`.
6. **Probe check.** Have a fresh reader test the compiled layer against the source (below).
7. **Check and commit.** `kf_check` until there are no errors, reading each warning and either fixing it or deciding it stands. Then `kf_check` with `commit: "ingest: <title>"`.
8. **Report** to the owner (below).

## A long source over several sessions

A book doesn't have to go in at once. Ingest a span of chapters, commit, and come back for the next span.

- The map covers what has been read, and grows by one heading per stretch. `kf_check` lists the pages no digest covers yet and measures the compression ratio against the mapped part only.
- `status` stays `registered` until the map covers the whole source. Only then write "About" (it is a judgment of the whole source) and set `status: compiled`.
- Each span runs every stage from Plan to Check and commit, so the library is consistent after each one. Delete `plan.md` at the end of each span.
- "What it changed" gets a short paragraph per span.
- Say at the top of the topic page that it rests on part of a source, and remove the line when it no longer does. Principles that the unread chapters may overturn are worth an entry under Open questions.

## Reading a long source with readers

`kf_read` returns about ten pages of a book per call and says where to continue. A source that fits comfortably in your context, you read yourself. Beyond roughly 60,000 words, split the reading across reader subagents, one per span of chapters, running at the same time. Readers write digests and nothing else. You stay the one mind that has seen the whole map, because principles only show up across chapters, and you write the plan and the topic page yourself.

Give each reader its span, the path of `text.txt`, the digest format, the delta test, and a file to write its digests to. Ask it to look at the page image for any flagged page whose figure or table carries content the text doesn't. Writers for stage 4 work the same way: each gets a set of accounts from the plan that no other writer has, the plan, `format.md`, and the pages to re-read, and writes the files directly. Two writers never share an account.

Subagents cost tokens: a reader or writer on a span of a book runs to a few hundred thousand. Tell the owner the count and the rough cost before starting more than five, and run large sets in waves of up to five so a usage limit doesn't stop them all at once. Readers keep their digests on disk as they go, so an interruption loses little.

### The digest

One per chapter or stretch, under its `### Title [p.A-B]` heading in the map. About 150 to 400 words:

- **Argues:** what this stretch claims, in two or three sentences, in the author's terms.
- **Worth keeping:** the delta, as short lines with pages. Specifics, surprising claims, methods, failure modes, cases, figures that carry content.
- **Principle candidates:** ideas this stretch treats as governing others, and warnings the author repeats. A phrase each.
- **Links:** what it builds on from earlier in the source, and what it sets up.

On a source's own page, cite with a bare locator: `[p.68]`, `[s.3]`, `[12:34]`. The checker resolves those against this source and verifies any quoted words in front of them.

A stretch with nothing worth keeping still gets a heading and one line saying so. The map is how a later session finds where the source covers something, so it describes; it doesn't summarize for its own sake.

## Principles

A principle is an idea that explains several specific practices. It belongs on the topic page when it passes three tests:

- **It says something.** Its opposite is a position someone could hold. "Serve the song" fails; "a part reads as loud only against something quieter, so loudness is made by contrast and not by level" passes.
- **It has a boundary.** You can say where it stops holding. A principle with no "Breaks when" is a slogan.
- **It governs.** At least two accounts are cases of it, ideally from different parts of the source. The checker refuses a principle that governs nothing.

Authors rarely state their principles. Two ways to find the unstated ones. Invert what the author keeps warning against: repeated warnings about drowning a mix in reverb point at a principle about what depth needs. And ask of a candidate, "if this were false, how much of the source stops making sense?" If one procedure falls, it is a rule and belongs in an account. If several chapters fall, it is a principle.

State each principle in words another field could recognize, so it can travel: say what it does before naming the domain's tools. On its Held by line, say for each source whether the source states it or you inferred it, with a page for the stated ones. A principle you inferred is your synthesis, and the line says so.

The same honesty applies to each line under a principle, and most of all to "Breaks when". Authors rarely say where their own principle fails, and the page still needs a boundary, so that line is where a compiler is most tempted to write its own view in the author's voice. When the source gives the boundary, cite the page. When it doesn't, say so and begin with "Inferred:". The same goes for a Tensions line: "the book's answer is…" needs a page that says it is the book's answer, and a practice the author reports from others is reported as theirs. The first cold test of this guide got every number right and got exactly this wrong, on three lines.

Aim for 6 to 15 principles per topic. More than that and a reader can't hold the page; look for the ones that are cases of another.

## Accounts

One account per idea a practitioner would look up or decide by. The unit is the idea, never the chapter, the page or the source. Give something its own account when it needs to be found, cited, disputed or revised by itself.

Each account opens with its point, then gives the reasoning, then the specifics, then where it breaks. What must survive into an account: every number that matters, the order of steps, the decision points and what decides them, the exceptions, the author's distinctive terms, and a worked case when the source gives one. What stays out: motivation, repetition, background the reader already has, and the source's own order of presentation.

The five kinds are in `format.md`. An account is as long as its specifics need and no longer; most land between 150 and 600 words. The checker warns under 80 (fold it into the account it belongs with) and over 900 (two ideas, or a retelling).

Write the `summary` so a reader can decide from it alone whether to open the account: say the claim, with its key number if it has one. Add `keywords` for words a question might use that the text doesn't.

## The second source and after

This is where the library gets smarter and not just bigger. Before planning, load the topic page and `kf_read` its `_index`. Then, for each idea the new source carries, decide:

- **Same.** The library holds it. Add the source to the account's `sources`, cite the page where it agrees, and note anything it adds: a number, a case, a condition.
- **Extends.** It adds a boundary, a mechanism or a method to an existing account. Revise that account in place.
- **Qualifies or conflicts.** It disagrees. Work out what separates the two positions (different goals, different conditions, different definitions, or a real dispute) and write that as a `debate` account that both sides link to. Keep both. Add the tension to the topic page.
- **New.** Nothing holds it. Write an account, and place it under a principle or ask whether the page is missing one.
- **Already known to any model.** Leave it in the source.

Then revisit the principles. A second source that states a principle the first only implied turns "inferred" into "stated". One that shows where a principle fails gives it a sharper "Breaks when". Record it in "What it changed", because that section is the evidence that the ingest moved the library. Keep that section to names and verdicts: which principles are new, sharpened or disputed (and stated or inferred), which accounts are new and which revised, what is left open. The content itself lives on the topic page and in the accounts, and isn't repeated here.

## Figures, tables and video

Extracted text loses what a figure shows and scrambles some tables. `kf_read` marks the pages that carry a caption or number-heavy text; in an illustrated book that is most pages, so choose by the caption. When a figure or table holds content you would cite (values on axes, settings in a diagram, a curve's shape, a decision chart), look at it with `view: "image"` and write what it shows, citing the page. Say in the account when a number was read off a chart. For a table, `view: "layout"` gives a reading that keeps columns. When the page and the extracted text disagree, the page is right.

For a recording, citations are timestamps like `[KEY 12:34]`. Frames are sampled once a minute into the source's `frames` folder, and `kf_read` with `view: "image"` and a timestamp takes one at full size. Look when the speaker points at something. Transcripts mishear names, numbers and terms of art, so check those before quoting them. Keep apart what a speaker shows and what they assert.

If a source's own numbers don't add up, keep what it says, cite it, and state the discrepancy beside it. Never repair a source silently.

## The probe check

Compiling drops things without noticing. Before committing a substantial ingest, hand a fresh subagent the source text and the accounts written from it, without your plan or your reasoning, and ask for two lists only: specifics in the source that would change what a practitioner does and that no account carries, and statements in the accounts that the cited pages don't support. For a long source, give it the chapters that carry the most accounts. Fix what it finds. The checker verifies quoted words and locators; only a reader can tell whether a paraphrase is faithful.

## The report

Tell the owner, briefly:

- what the source added: principles added or changed, accounts written and revised, by name
- what it disputes that the library already held
- what it leaves open, and what to read next to close it
- the numbers `kf_check` prints: words read, words compiled, the ratio
- anything you could not read or verify

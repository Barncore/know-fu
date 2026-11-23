# Ingesting a source

Contents: what an ingest produces · what the library is for · what is worth keeping · extract and attach · weighing the logic · principles · notes · the stages · the second source and after · a long source over several sessions · reading a long source with readers · figures, tables and video · checking with a fresh reader · the report.

## What an ingest produces

When you finish, six things are true:

1. The source is registered, with its original kept and its text extracted into units a citation can name.
2. `source.md` maps the whole source: one heading per stretch, in order, each with a line saying what that stretch covers, and nothing left uncovered.
3. Every idea in the source that is worth keeping has a home. It became a new principle, or it went into a principle the library already held, or it is a note under a principle. Nothing floats free.
4. Each principle this source touched says, in its own file, why it holds, where it breaks, how well its logic stands up, what kind of support it has, and what this source brings to it.
5. The topic page's frame, tensions and open questions reflect what the source changed.
6. `kf_check` reports no errors, the change is committed, and the owner has a short report of what changed.

## What the library is for

The owner uses this library to build things, and wants it to stand behind what it holds. A library that repeats its sources is a second copy of them, and the originals are already here, searchable by page. What the compiled layer adds is the work a careful reader does: finding the ideas that explain the rest, connecting them to each other and to what other sources said, and judging how far each one can be trusted.

So two things decide whether an ingest went well. The ideas are connected: a principle links to the notes that rest on it, to the principles it depends on or pulls against, and to every source that bears on it. And the ideas are weighed: a reader of any principle can see how good the reasoning behind it is.

The failure to avoid is a retelling, and a retelling is a way of writing, not a length. It follows the source's order and the source's voice: "the speaker opens with… he then shows… finally he says…". It can be short and still be one. Two tests catch it. They apply to principles and to notes that explain a mechanism or a method:

- **Could you use it?** A principle or a method is something you could apply to a different problem without mentioning where it came from. "The author argues that entries should wait for a retest" is a summary of someone's argument. "An entry on the retest risks less than an entry on the break, because the failed break has already been ruled out, until the market is moving too fast to retest at all" is a claim you can build with.
- **Cover the source.** Write the idea with the source closed, from what you understood: the claim, the reason, the limit. Then open the source to get the specifics and the citations right. Text written while reading down a page follows the page.

(The example is invented to show the shape.)

The tests don't apply to everything, because some notes are there to report. A case note tells what happened and what it shows. A debate note lays out each side's position in that side's own terms. A reference note holds a table. Those are meant to say what a source said.

## What is worth keeping

The reader of this library is a frontier model. It already knows the common knowledge of most fields. What it lacks from a specialist source is narrower:

- the author's frame: the idea that makes the subject hang together their way
- claims that surprise, or that contradict common advice
- specifics: numbers, thresholds, orders of steps, decision rules, named techniques
- conditions and failure modes: when the usual advice breaks, and what the author says not to do
- worked cases, with what they show
- the author's own terms, where they carve the subject differently

For each thing you might write down, ask: would a strong general model, asked cold, already say this with this precision? If yes, it is at most a clause that sets up something that isn't.

> Not kept: "Overfitting means the strategy has fitted noise in the sample." Any model says this unprompted.
>
> Kept: "The author won't read a backtest with fewer than 30 trades per free parameter, and drops any parameter whose neighbours within 10% either side lose more than half the edge [KEY p.212]." A rule with numbers, which the model could not have produced.

(Invented, to show the shape.)

This is not a quota: a practitioner's private course may be nearly all worth keeping, and a popular overview nearly none. And it is not a licence to drop detail you find dull. Exact numbers, the order of steps and the exceptions are what a specialist source is for.

## Extract and attach

For each idea the source carries, the first question is whether the library already holds it. Load the topic page before you plan, and open any principle whose line looks close.

- **The library holds it.** Add to what is there. Give the principle an evidence entry for this source that says what the source brings: a reason the earlier sources didn't give, a case, a number, a sharper limit. A few lines, or one line when it only agrees: a principle file is read whenever a decision leans on it, and it gets an entry from every source, so what each entry repeats is paid for every time. If the source says it better, rewrite the statement, and the title too when it carries one source's terms. Keep the file name, because links point at it. The principle is edited in place and git keeps the earlier wording, so don't keep a history in the file.
- **The library holds something near it.** Decide whether the two are one idea seen from two sides or two ideas. One idea: widen the principle and say what each source contributes. Two: write the new one and connect them.
- **The source disagrees with what the library holds.** Keep both. Give the principle an evidence entry headed `disputes it` or `qualifies it`, work out what separates the positions (different goals, different conditions, different definitions, or a real dispute), write that as a `debate` note, and add the tension to the topic page. Never settle it by which source is newer or more confident. A `debate` note is for positions a reader needs to see side by side. When a source only narrows a principle's scope, the evidence entry and a sharper "Breaks when" are enough.
- **Nothing holds it.** Write a new principle if it explains other things, or a note under the principle it is a case of. If no principle fits a note you are sure is worth keeping, the page is probably missing a principle: look for it.
- **Any model already knows it.** Leave it in the source.

Adding to what exists is the default. A new principle file is right when the idea would otherwise have to be squeezed into a principle that says something else.

Extracting matters as much as attaching. Authors rarely state their principles, so a source whose every sentence went into existing files may still hold an idea nobody has written down. Two ways to find the unstated ones. Invert what the author keeps warning against: repeated warnings about drowning a mix in reverb point at a principle about what depth needs. And ask of a candidate, "if this were false, how much of the source stops making sense?" If one procedure falls, it is a rule and belongs in a note. If several parts fall, it is a principle.

## Weighing the logic

The owner doesn't want a library that parrots. As each idea goes in, judge it the way a sharp colleague would while listening: is this actually a good argument? You are not grading the author, and you are not filtering. An idea with thin support that a practitioner would still use belongs in the library, with its thinness said plainly. What the library must never do is hand over a teacher's confident assertion looking the same as a result from a hundred trials.

Ask three things of every principle, and write the answers in its **Merit** line in a sentence or three:

- **Does the "because" follow?** Is the reason a mechanism you can check against the cases shown, or is it a restatement of the claim, an appeal to experience, or a story that would fit any outcome?
- **What is the strongest objection?** State the best thing a skilled person who disagrees would say. If another source in the library says it, name that source.
- **Where is it thin?** Cases the author picked after the fact, no failures shown, a number with no data behind it, one market or one period, a definition that shifts between uses.

Then name the kind of **support** it rests on, in the file's frontmatter. Pick the strongest kind any source gives it:

| `support` | What it means |
|---|---|
| `review of studies` | A source pulls together several independent studies or datasets. |
| `controlled comparison` | Someone ran it both ways and compared, with the method stated. |
| `measured data` | Counts or measurements over many instances, without a controlled comparison. |
| `worked cases` | Shown on examples, usually chosen by the author. |
| `reasoned argument` | Argued from a mechanism, with no cases or data to show it. |
| `bare assertion` | Stated on the author's authority and nothing else. |
| `our inference` | No source states it. You derived it from what the sources show. |

The kind is a description, not a score, and there is no strength rating on purpose: a scale gets the middle value nearly every time and stops telling anyone anything. The engine counts how many separate sources state or imply each principle and shows that beside the kind on the topic page. Two lessons by one teacher share a `family` and count once. The count can't tell whether two sources are independent, so you say it: when sources agree, ask whether each found it for itself or both teach the same school. Two teachers of one method agreeing is the method repeated, and the Merit line says so.

> - **Merit:** The reason given is a mechanism (stops cluster under an obvious low, so price reaches for them) and the three charts fit it. All three were picked after the fact and no sweep that failed is shown, so nothing here says how often it works. A skeptic would say any reversal can be relabelled a sweep afterwards.

(Invented, to show the shape.)

Keep three voices apart everywhere: what a source says, what its screen or its data shows, and what you conclude. An evidence entry is headed with how the source stands: it `states` the principle, it `implies` it (you are reading it out of what the source does), it `qualifies` it, or it `disputes` it. "Breaks when" is where a compiler is most tempted to write its own view in the author's voice, because authors rarely say where their own idea fails. When the source gives the limit, cite the place. When it doesn't, begin the line with "Inferred:".

## Principles

A principle is an idea that explains several specific things: practices, rules, cases. It earns a file when it passes three tests:

- **It says something.** Its opposite is a position someone could hold. "Serve the song" fails; "a part reads as loud only against something quieter, so loudness is made by contrast and not by level" passes.
- **It has a limit.** You can say where it stops holding. A principle with no "Breaks when" is a slogan.
- **It explains.** More than one thing in the sources follows from it. A principle needs no note under it to exist: its own file carries its reasoning and its evidence. A rule that explains only itself is a note.

State each principle in words another field could recognize, so it can travel: say what it does before naming the domain's tools. Write its `summary` as the one line a reader of the topic page gets: the principle with its main limit, as in "X, because Y, until Z". One reason and one limit: the full list of limits lives under "Breaks when".

There is no target number. A twenty-minute lesson may honestly hold three or four principles, and a book thirty. Near forty, a topic usually holds two or three subjects: look for groups of principles that link to each other more than to the rest, and split the topic along them.

## Notes

Notes are the detail behind the principles: the things a practitioner looks up or decides by. One idea each. The unit is the idea, never the chapter, the page or the source. The kinds are in `format.md`.

A note opens with its point, then the reasoning, then the specifics, then where it breaks. What must survive into a note: every number that matters, the order of steps, the exceptions, the author's distinctive terms, and a worked case when the source gives one. What stays out: motivation, repetition, background the reader already has, and the source's own order of presentation. Length is not the thing to economize: a note is read on purpose, by an agent that chose it. What keeps a note sharp is its boundary, one idea.

A `method` note marks its decision points, because a procedure is easy to copy and hard to run. At each place where the practitioner has to choose, say what prompts the choice, what the options are, what decides between them, and how to tell it worked. Sources skip these all the time ("then pick your level"). When the source doesn't say how to choose, write that it doesn't. A gap named is worth more than a step that reads as complete.

Before writing a note, look for the one it belongs in. Write the `summary` so a reader can decide from it alone whether to open the note: the claim, with its key number if it has one. Add `keywords` for words a question might use that the text doesn't.

## The stages

The order matters, because each stage is what makes the next one possible.

1. **Register.** `kf_source` with action "add". Name the author, since sources by one author count once as support (`family`, in `format.md`). Agree the topic with the owner if the source's place isn't obvious (`kf_brief` shows what exists). A new topic is a new folder: `node <plugin>/engine/cli.ts new <domain>/<topic>` writes the page skeleton.
2. **Read and map.** Read the whole source. In `source.md`, write one `### Title [p.A-B]` heading per chapter or stretch with one line under it saying what that stretch covers, so a later session can find where the source deals with something. The map points; it doesn't summarize.
3. **Plan.** With the whole source read and the topic page open, write `sources/<id>/plan.md`: each idea worth keeping, where it goes (which existing principle it adds to, or the new principle or note it becomes), and the places in the source it rests on. This is where consolidation happens: material on one idea from five chapters lands in one place. The plan is cheap to change and the files are not, so settle it here.
4. **Write.** Write or revise each principle file and each note, re-reading the cited places as you write. Weigh each principle as you write it. Never write from your reading notes alone: they say what is there, and the page says what it says.
5. **Connect.** Look across what you wrote and what the library already held. Which new principle depends on, qualifies or conflicts with another, in this topic or any other? Is a mechanism you just wrote down already in another field's topic under other words? Add those under `## Connections` with the reason. Then revise the topic page: the frame if the source changed how the subject hangs together, the tensions, the decision map, the vocabulary. Put what the source leaves unanswered, or names as unsolved, under Open questions: those are where the owner's next source or next invention comes from.
6. **Check with a fresh reader** (below).
7. **Check and commit.** Fill in "About" and "What it changed" in `source.md`, set `status: compiled`, delete `plan.md` and any reading notes. Run `kf_check` until there are no errors, reading each warning and either fixing it or deciding it stands. Then `kf_check` with `commit: "ingest: <title>"`.
8. **Report** to the owner (below).

## The second source and after

This is where the library gets smarter and not just bigger, and it is the case "Extract and attach" is written for. Three things to add:

- After a source lands on an existing principle, read that whole file again and ask: if I wrote this today, with both sources in hand, what would be different? Rewrite what would. Its `support` may have moved up a kind, its Merit line may have a new objection or lose one, and its limit may be sharper. Leave alone what wouldn't change; editing for the sake of it wears a page down.
- A second source that states what the first only implied changes that first entry's weight, and one that shows where a principle fails gives it a real "Breaks when" in place of an inferred one.
- In "What it changed" on the new source's page, name which principles are new, which were strengthened, sharpened, qualified or disputed, and which notes are new or revised. Names and verdicts only: the content lives in the principle files and notes.

## A long source over several sessions

A book doesn't have to go in at once. Ingest a span of chapters, commit, and come back for the next span.

- The map covers what has been read, and grows by one heading per stretch. `kf_check` lists the pages no map entry covers yet.
- `status` stays `registered` until the map covers the whole source. Only then write "About" (it is a judgment of the whole source) and set `status: compiled`.
- Each span runs every stage from Plan to Check and commit, so the library is consistent after each one.
- "What it changed" gets a short paragraph per span.
- Say at the top of the topic page that it rests on part of a source, and remove the line when it no longer does. Principles that the unread chapters may overturn are worth an entry under Open questions.

## Reading a long source with readers

`kf_read` returns about ten pages of a book per call and says where to continue. A source that fits comfortably in your context, you read yourself. Beyond roughly 60,000 words, split the reading across reader subagents, one per span of chapters, running at the same time. Readers write reading notes and nothing else. You stay the one mind that has seen the whole source, because principles only show up across chapters, and you write the plan, the principles and the topic page yourself.

Give each reader its span, the path of `text.txt`, this guide's sections on what is worth keeping and weighing the logic, and a file under `sources/<id>/` to write to. Ask for one block per chapter:

- **Argues:** what this stretch claims, in two or three sentences, in the author's terms.
- **Worth keeping:** short lines with pages. Specifics, surprising claims, methods, failure modes, cases, figures that carry content.
- **Principle candidates:** ideas this stretch treats as governing others, and warnings the author repeats, each with how the author supports it (data, cases, argument, or assertion).
- **Links:** what it builds on from earlier in the source, and what it sets up.

Reading notes are working files. They get you from the source to the plan and are deleted before the commit. Writers for stage 4 work the same way: each gets a set of notes from the plan that no other writer has, the plan, `format.md`, and the pages to re-read, and writes the files directly. Two writers never share a file.

Subagents cost tokens: a reader or writer on a span of a book runs to a few hundred thousand. Tell the owner the count and the rough cost before starting more than five, and run large sets in waves of up to five so a usage limit doesn't stop them all at once.

## Figures, tables and video

Extracted text loses what a figure shows and scrambles some tables. `kf_read` marks the pages that carry a caption or number-heavy text; in an illustrated book that is most pages, so choose by the caption. When a figure or table holds content you would cite (values on axes, settings in a diagram, a curve's shape, a decision chart), look at it with `view: "image"` and write what it shows, citing the page. Say so when a number was read off a chart. For a table, `view: "layout"` gives a reading that keeps columns. When the page and the extracted text disagree, the page is right.

A page flagged `ocr` was a scan read by OCR. Its words are mostly right and its numbers are where it slips, so check a number or a quoted phrase against the page image.

A recording can be added by its link: pass the link as `file`. Call `kf_source` with `action: "info"` and the link first. It shows the length, the cost to transcribe and the page's description, which often names the terms worth sending. A video added by link may come with `captions.txt` in its source folder, the page's own captions: read the same minute there when a word in the transcript is in doubt, and remember that automatic captions are a second machine's guess, not the truth.

When you add a recording, give `kf_source` its `topic` if the topic exists, and `terms`: the speaker's name, the method's own labels, tickers, and any term of art you can see in the title or description that the topic doesn't hold yet. They go to the transcriber, which then hears them; without them a coined term comes back as the nearest common word. Send only terms you have reason to think are spoken. The engine adds the topic's own vocabulary and keywords to yours by itself. A transcribed recording has one sentence per line, each starting with the time it was spoken, and is cut into units of about two minutes. Your map follows the lesson's own parts, and its headings may start and end anywhere inside those units.

For a recording, citations are timestamps like `[KEY 12:34]`. Transcripts mishear names, numbers and terms of art, so check those before quoting them. When the recording has a screen that carries content (a chart, slides, a tool's window), read the video guide before you start (`kf_read` ref "guide:video", or `references/video.md`): it covers the filmstrips made when the video was added, choosing where to look, the Frames line each map entry ends with, and keeping the frames a claim relies on.

If a source's own numbers don't add up, keep what it says, cite it, and state the discrepancy beside it. Never repair a source silently.

## Checking with a fresh reader

You wrote these files with the source in your head, so you can't tell what they say to someone without it. Before committing a substantial ingest, hand a fresh subagent two jobs, in this order, without your plan or your reasoning.

**First, use the principles.** Give it only the compiled layer: the topic page, the principle files and the notes. Give it two or three cases to decide. Take them from the source where you can, choosing ones you did not write up as examples, and hide what the source did. Add one case that sits just outside a principle's limit, where applying the principle looks right and is wrong. Ask it to decide each case from the library alone, saying which principle it used and why. Then compare with the source. Where it couldn't decide, a principle is missing something a practitioner needs. Where it applied a principle outside its limit, the "Breaks when" line is too loose. Fix the files, not the reader.

**Then, compare with the source.** Now give it the source text and ask for two lists only: specifics in the source that would change what a practitioner does and that nothing in the compiled layer carries, and statements in the compiled layer that the cited places don't support. For a long source, give it the chapters that carry the most. Fix what it finds.

The checker verifies quoted words and locators. Only a reader can tell whether a paraphrase is faithful, and only a reader made to use a principle can tell whether it is usable.

## The report

Tell the owner, briefly:

- which principles are new, and which the source added to, sharpened, qualified or disputed, each with its kind of support
- anything you judged weak, and why: the owner would sooner hear "this is one teacher's assertion" now than find out later
- which notes were written and revised, by name
- what the source leaves open, and what to read next to close it
- what the fresh reader found and what you changed because of it
- anything you could not read or verify

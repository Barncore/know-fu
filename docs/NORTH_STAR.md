# Know Fu north star

This is the "why" document. It holds what Know Fu is for, the theory its design rests on, and every decision the owner has made about it. Read it before changing the architecture, ingestion or retrieval. For how the system works today, read [the architecture page](../plugin/docs/architecture.md) and the code. For what has actually been shown to work, read the acceptance section of [the rebuild record](REBUILD.md#acceptance). A plan is never evidence that something works.

The version of this document that guided versions 1.0 to 0.5, with the full 1.1.0 implementation plan, is in git at the tag `v0.5.0`.

## The experience we're after

Feeding Know Fu a source should make the AI a better collaborator in that subject. A collaborator that has absorbed the material and can explain hard ideas, spot when they apply, reconcile disagreements, and help build new ideas, strategies and products on top of them. It is more than a search box.

The guiding image is the "I know kung fu" moment: you give the system knowledge and feel a real jump in what it can do. In the owner's words (10 November 2026, punctuation tidied):

> I want a system where I can get the AI to ingest books, vids and transcripts and it gets smarter and smarter the more it ingests, compounding the more it connects dots. Like Neo in the Matrix when he downloads Kung Fu knowledge and he opens his eyes and goes "I know Kung Fu". That's the north star.

And on what it is for:

> Know Fu is a local knowledge-base that will be curated by me and will be used by me to create things from: tools, strategies, inventions, explainer videos, content, software, frameworks. It will be where I feed books, videos and papers containing specialist knowledge, where it will be the seed of future artifacts and products I create in various AI sessions covering various domains. It will be optimized for being machine-readable but should also be human-readable too.

The worry that started the project still defines failure. The owner's earlier research ingests produced "huge lists of claims", and he asked whether a list of claims can connect in the end, whether the AI can write coherent prose from it, generate new strategies, and teach it. The first real book ingest under version 0.5 produced the same thing in a more elaborate form: 425 notes that restated the book. His diagnosis: "it was more of an information extraction job rather than an elegant knowledge organisation job. The problem was intelligent, elegant compression."

Success shows up in ordinary work. After ingesting relevant material, the AI should be better at:

- explaining a mechanism in connected prose, with the reasoning that makes it click
- applying knowledge to a case no source covered, and noticing a failed precondition
- designing something that honours the subject's principles, or breaks one on purpose
- comparing authors without flattening real differences
- combining ideas into a hypothesis, strategy or product, and naming what nobody has tested
- naming the next question or source that would most improve a decision
- revising earlier understanding when a new source changes it

The division of labour matters. The owner supplies the sources, the priorities and the calls that carry consequences. The system does the reading, the compiling, the weaving and the checking. The owner should never have to act as a librarian.

## The theory

The owner asked for a first-principles foundation (23 October and 10 November 2026). This is it. The longer argument, with the evidence from the 0.5 ingest, is in [the rebuild record](REBUILD.md).

**Expertise is knowledge organized by principle.** Experts sort a problem by the principle that governs its solution, where novices sort by surface features. Around each principle an expert holds the conditions where it applies, the methods that follow from it, cases that calibrate judgment, and the numbers that have to be remembered. Principles make knowledge generative: twenty procedures let you repeat twenty procedures, and eight principles with their conditions let you work out what to do in a case no source covered. That is what building new things needs, and it is why a principles layer makes the library "less prescriptive and more of a generative tool", as the owner put it.

**The reader already knows a lot.** A frontier model holds the common knowledge of most fields. What it lacks from a specialist source is the author's frame, the surprising claims, the specifics, the conditions and failure modes, and the worked cases. The value of a stored sentence is its delta against what the reader would say unaided. Storing the rest costs tokens at ingest and attention at recall, and adds nothing.

**A model knows what is in its context.** Retrieval at question time fails silently, because an agent only asks for what it suspects exists. A short page of a subject's principles, loaded when work starts, gives it the field's frame and tells it what it can ask for.

**Understanding has to be built at ingest.** Integration done at question time is repeated for every question and never accumulates. A library compounds only when a new source revises what is already there, so the unit is the idea, held once and revised in place.

The six rules that follow:

1. Store the delta, never the retelling. This governs what goes in, not how long an account is.
2. One account per idea, across sources, revised in place.
3. Every topic has a principles page, small enough to load whole. Below it, depth is welcome.
4. Keep the original searchable, so compression loses nothing.
5. The files are the library: readable Markdown, links written in the prose, history in git.
6. Code does what agents are bad at (extraction, search, checking). Agents do the reading and writing.

## Commitments that outlast any implementation

| Commitment | What it means in practice |
|---|---|
| Preserve the source | Originals are never modified. Every specific is cited to a page or a timestamp, and quoted words are checked against the source text |
| Compile, don't retell | An ingest keeps what a strong general model wouldn't already say. The checker reports words compiled against words read |
| Principles on top | Each topic states its principles with why they hold, where they break, and what they govern. A principle that governs nothing is refused |
| Understanding is cumulative | A new source changes the accounts and principles it bears on. Each source records what it changed |
| Disagreement is knowledge | Both positions stay, with an account of what separates them. Nothing wins by being newer, longer or more confident |
| Evidence, synthesis and invention stay apart | An account says whether it reports sources or is the compiler's synthesis. A principle says whether each source states it or it was inferred. Ideas live apart and never count as evidence |
| Reachable at several levels | Principles, accounts, source map, source text. Each is an entry point |
| One owner of meaning | The Markdown files. Indexes and the search database are generated |
| Readable by a person | The owner can open the library and read it without a tool |
| Local and cheap to run | Files and local software. No server, no GPU, no installed dependencies. Paid APIs are optional and gated |
| Judge capability, not plumbing | Counts of accounts and links prove nothing. Compare answers and designs made with the library against ones made without it |

"Every ingest makes it smarter" is the objective, not a promise. A redundant source may add little, and a weak one may end up qualified. The useful question after an ingest is what understanding changed.

## Decisions

Newest first. Each entry is the owner's decision unless it says otherwise.

### 10 November 2026: the rebuild

The owner asked for the architecture to be assessed from scratch, left the direction to the agent ("I'm trusting your intelligence to come up with the best architecture… if you want to completely revamp it then I would probably trust that"), and asked that the old version be kept in case he wants to go back. The assessment found the 0.5 design built around the wrong unit of knowledge, and version 0.6 replaced it. What changed, decided by the agent under that instruction and recorded in [the rebuild record](REBUILD.md#earlier-owner-decisions-what-happens-to-each):

- The Markdown files are the library. JSON records, releases, proposals, jobs, lifecycle plans, the ledger, modules and the evaluation harness are gone. History and rollback are git.
- Domain, then topic. A topic is a folder with a principles page. This changes the 17 October decision, following the owner's own 23 October thinking.
- One library for every agent. This settles a question the owner had deferred.
- A topic the owner pins to a project loads there without invoking the skill. Use is otherwise still deliberate.
- No local embedding model, QMD, Docling or Python environment. Embeddings through an API are an optional second search channel (see the owner's review below).

The owner chose the size of the acceptance run: three chapters, within five subagents.

After reading the result the same day, the owner corrected three things, and each changed the build:

- **Performance, not cost.** "Cost wasn't really my worry anyway. I was more concerned about sluggish speeds or ineffective ingestion or retrieval at some point in the future, context bloat. I wanna optimize for performance." And on length: "Isn't the important thing that the searchable L1 bit is short? Can't the deeper stuff be longer since the AI will have deliberately selected that document to read anyway?" He is right, and the first 0.6 guides had drifted toward economy. The delta rule stays as a rule about what goes in. The pressure on account length is gone, the retelling warning moved from 30% to 50% and is described as a description and never a target, and recall loads whole accounts up to a larger default budget.
- **Build for the size it will reach.** "I'm not building for this size, I'm building for futureproofed bigger size." Keyword search carries topic-scoped questions at any size, and fails on cross-field questions, which matter most for invention. The semantic channel is built, optional, and on in the owner's library.
- **One shared library was always the intent.** Separate libraries per agent were only for the testing phase. Commits and log lines now name the agent that wrote them.

Version 0.5 is kept as the tag `v0.5.0` and the branch `records-engine-0.5`.

### 23 October 2026: first principles

Thinking aloud, not yet deciding: "I'm wanting Know Fu to be something that extracts or distils the first-principles from the book, video, paper or transcript." He pictured a top layer per topic that lays out the first principles, a paragraph each, with links to deeper write-ups; a domain index above it; and the library as "a generative tool" for building things. Version 0.6 is built on this.

### 20 October 2026: ingest speed

The first book ingest took 5 h 33 min in Claude Code and 2 h 53 min in Codex, which the owner called too slow to use. He decided that long books are read by several readers at once with one writer, and that the semantic search embedder is a setup choice with an API acceptable for his own library. He left open whether to consolidate notes into fewer, broader accounts. Version 0.6 answers that: yes, and readers now write digests in parallel while one lead plans and weaves. The embedder is gone for now.

### 17 October 2026: domains

A domain is a broad umbrella such as Audio or Trading, and the only subject label; a hand-kept label on every note would drift. Changed on 10 November: a topic sits under a domain. The reason for the original decision still holds, and 0.6 respects it. A topic is a folder an account lives in, not a tag copied onto notes.

Code, tool text and docs call each thing by one name: a `domain` is never a "topic", and since 0.6 a `topic` is never a "subject area" or a "category".

### 13 October 2026: deliberate use

The library's value comes from the owner's curation, so Know Fu runs only when the user invokes it. A personal library is read from any project folder, answers and ideas can be saved from any folder, and ingestion happens only in the library's home folder. Know Fu keeps its settings in its own file, `~/.know-fu/config.json`. Versions stay below 1.0 until the owner calls it stable, and every plugin change carries a new version number. All kept. Saving from another folder is now a note in the library's inbox.

### 12 October 2026: no database server

The owner dropped FalkorDB: nothing answered from it, and it was the only reason to run WSL2. Operational memory, if built, is a separate plugin with its own store. Kept.

### 7 October 2026

Reading is checked by the engine; every record says which agent wrote it; a source's independence is set when it is registered (now the `family` field); Know Fu runs with Claude Code as well as Codex from one plugin folder; the code is under the MIT licence. The owner doesn't want claims expiring on a guessed date: whether a source is out of date is for the agent to judge, and a sunset action fits better than validity windows. In 0.6 the reading check is that a source's map covers every page, authorship is in git, and sunset is `status: retired` with a reason.

### 6 October 2026: an invention engine

"Ultimately, I want it to be an invention engine." Inventing new strategies, products, processes and ideas ranks first; explaining and teaching rank a close second and serve it. Ideas get their own lane with walls: an idea never counts as evidence, and its status changes only with a real test result from the owner's own tools against a pass rule declared before the run. Procedures carry decision points ("I need to see the decision tree"). No `analogous_to` link, ever: an analogy worth keeping is an idea. `staging` is the branch where work lands first. All kept; the ideas lane is now a folder of files with the same walls, enforced by the checker.

### 5 October 2026

Budgeted recall is the routine way to answer. A tool for how two ideas connect, because "connecting distant ideas is what drew the owner to this project in the first place". Evidence assessments have to earn their place: a field nothing reads stays empty. Kept as `kf_recall` and `kf_connect`. The three-axis assessment became `basis`, a Held by line and prose.

### September 2026: the original design

From the first design conversations: a machine-oriented library with a readable wiki; preserve raw sources; synthesize, don't copy; honest gaps; an activity log; inference from cited premises is welcome and invented evidence is not; one modular library rather than one per domain; hosted transcription rather than local; no cloud database; a book doesn't become a skill; no fixed quotas of pages or links. Promotion tiers for knowledge were parked and still are.

## Keeping future work on course

For each material change, be ready to say which capability it improves, what understanding it might lose, and what you would observe if it worked. Keep the established intent, current implementation facts and unaccepted proposals separate. A conversation summary, an old recommendation or a convenient default never quietly overrides a decision recorded here. When the owner changes a decision, record the reason here.

Three failure modes to watch, because each has already happened once:

- **Retelling.** The compiled layer grows toward the size of its sources. Watch the ratio the checker prints.
- **Machinery.** A component is added to guard against a risk a single-user library doesn't have. Ask what a person with one library and git would need.
- **Slogans.** The principles page fills with statements that are true of everything. Each principle needs a boundary and accounts it governs.

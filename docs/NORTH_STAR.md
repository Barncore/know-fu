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

The seven rules that follow:

1. Store the delta, never the retelling. This governs what goes in, not how long a note is.
2. One principle per idea, across sources, added to and sharpened in place. Notes hold the detail behind principles. (Until 0.12 a note was called an account, and the dated entries below keep that word.)
3. Every topic has a front page that lists its principles, small enough to load whole. Below it, depth is welcome.
4. Weigh each idea as it goes in, so the library stands behind what it holds and says how far.
5. Keep the original searchable, so compression loses nothing.
6. The files are the library: readable Markdown, links written in the prose, history in git.
7. Code does what agents are bad at (extraction, search, checking). Agents do the reading and writing.

## Commitments that outlast any implementation

| Commitment | What it means in practice |
|---|---|
| Preserve the source | Originals are never modified. Every specific is cited to a page or a timestamp, and quoted words are checked against the source text |
| Compile, don't retell | An ingest keeps what a strong general model wouldn't already say, written as ideas a reader can use and not in the source's order and voice. This is a judgment the guide teaches, with no number behind it |
| Principles on top | Each topic's front page lists its principles. Each principle has its own file: why it holds, where it breaks, what each source brings, and the notes that rest on it |
| Stand behind what is held | Each principle carries the reader's weighing of its logic, the kind of support it has, and how many independent sources hold it. An assertion never reads like a tested result |
| Understanding is cumulative | A new source adds to the principles it bears on and sharpens them in place. Each source records what it changed |
| Disagreement is knowledge | Both positions stay, with a note of what separates them. Nothing wins by being newer, longer or more confident |
| Evidence, synthesis and invention stay apart | A note says whether it reports sources or is the compiler's synthesis. A principle says, source by source, whether the source states it, implies it, qualifies it or disputes it. Ideas live apart and never count as evidence |
| Reachable at several levels | Topic page, principles, notes, source map, source text. Each is an entry point |
| One owner of meaning | The Markdown files. Indexes and the search database are generated |
| Readable by a person | The owner can open the library and read it without a tool |
| Local, and stronger for it | Files and local software on the owner's machine, with no server to run and nothing that needs a dedicated GPU. A dependency is welcome when a test shows it improves ingestion, retrieval or checking. It is optional and found at runtime, the way FFmpeg and Poppler are, so a clean clone still runs without it. Paid APIs are optional and gated |
| Judge capability, not plumbing | Counts of notes and links prove nothing. Compare answers and designs made with the library against ones made without it |

"Every ingest makes it smarter" is the objective, not a promise. A redundant source may add little, and a weak one may end up qualified. The useful question after an ingest is what understanding changed.

## Decisions

Newest first. Each entry is the owner's decision unless it says otherwise.

### 24 November 2026: principles in their own files, weighed on the way in

After two videos went into one test library, the owner read the result and asked for a different shape. Three things he saw: the topic page was growing toward the problem it was built to solve, the detail files mostly retold their sources (eight of nine were marked as reporting a source), and nothing said how good any idea's reasoning was. What he decided, over two rounds:

- **Principles are the front layer, one file each.** The topic page frames the subject and lists every principle in a line that links to its file. Behind them sit the detail files, now called notes. Everything is linked both ways.
- **Extract and attach.** A new source's ideas go into the principles the library already holds, and new principles are extracted where none fits. He caught a draft that said only "attach": "don't forget that it's about extracting principles too, not just attaching to them." He also rejected a proposal to extract claims as the unit, since lists of claims with no connecting tissue are what he built Know Fu to get away from.
- **Logical merit is judged on the way in.** A proposal for a second reader to audit each ingest against eight questions was refused outright: "I don't want an audit pass after the ingest, that's not the right scope for this. I want some sort of judgement of the logical thinking of the information nodes on the way in, not a full audit thing." And on scoring: "that's how you pigeonhole." What he asked for is that the reader be aware of merit while ingesting, with at most a light classifier. So each principle has a Merit line in the reader's words and names its kind of support, a list 0.5 already had and the rebuild dropped.
- **Retelling is fixed in the instructions.** "Retelling is a writing style or an intent, not a number." The 35% warning is gone. He also pointed out that a test for retelling can't be a blanket rule, since a debate or a case is meant to explain what a source said.
- **Edits are silent.** A principle is rewritten in place and git keeps the history. No history sections in the files.
- **Split near forty.** A topic with about forty principles is split along the groups that link to each other.
- **Deferred:** a domain profile for trading. He raised it as a thought experiment and said not to narrow the scope.

Removed with his agreement: the per-stretch digest paragraphs on a source page (the map is now a line per stretch), the 35% retelling warning and the ratio it printed, and the generated `_index.md`. Brought back from 0.5 at the same time: looking for connections after writing, and testing new principles by having a fresh reader apply them to a case, including one just outside a principle's limit.

After reading the first library built this way, the owner added four things the same day:

- **Names, not codes.** "Once the library builds up there will be all these codes that I don't know what they mean. And some codes will actually be the same person but I won't know it." Evidence headings read "Mara Venn (WKH): states it", written by the checker from the source's page. Prose names the person. Keys stay inside citation brackets, and each topic page ends with a key to them.
- **Two optional lines on a principle**, both from 0.5: what would change it, and the idea in general terms. Written only when there is something to say.
- **Evidence against, weighed with evidence for.** He asked whether it needs its own section and worried about principle files growing. It stays in the one Evidence section, headed "disputes it" or "qualifies it", and the topic page now counts it. That was the agent's recommendation at his request.
- **Gaps stay on the topic page.** He asked whether each principle should have a "Gaps and open questions" section, to help choose the next source. The agent recommended keeping them in the topic page's Open questions, one list that is read whole, with each question naming its principle and what would settle it. Also at his request, and his to overrule.

Two sources that share nothing but a method are separate sources, and the count says so. He corrected a grader's note that two unconnected teachers were "the same school".

How the agent got here matters for next time. It proposed the audit after sending a subagent to skim outside prior art, and found the owner's answer only when it read 0.5's own lineage page and note guide. Read the project's earlier versions before looking elsewhere.

### 23 November 2026: how a video's frames are chosen

The owner's starting point: "I think it needs to be based on what it reads from the time-coded transcript." A frame once a minute is "kinda random and not targeted". He approved this division after asking for it to be explained in full, because an unexplained rebuild is how capability was lost before:

- **The transcript drives.** The reader decides where to look. If a point can't be restated with its specifics without the picture, it looks.
- **Code makes a map and no choices.** A filmstrip of the moments the screen changed and settled, so the reader knows what is there to ask about. The owner: "the code-based frame picker is just for the filmstrip."
- **Any second can be asked for**, and the screen for a sentence comes back settled, because the drawing lands after the words.
- **Skipping shows.** Each digest lists the frames opened, and the checker compares that with what was opened.
- **Sizes**, from the owner's test on chart frames: 1080p as it is, larger sources at 2,576 px, smaller ones enlarged to 2,576 px, and a crop when a detail needs it.

Removed with his agreement: the frame sampled once a minute. The filmstrip replaces it.

### 23 November 2026: one transcriber, taught the library's vocabulary

The owner's earlier video work used two OpenAI models per recording, one for accurate words and one for timestamps. OpenAI shuts the timestamp model, `whisper-1`, down on 26 February 2027. A test on one of the owner's trading lessons put one hosted model, MAI-Transcribe 2 through OpenRouter, level with the better of the pair on words and ahead of the other on timing, at about a sixth of the cost. The owner's decision: "Switch to MAI-Transcribe 2, lock it in."

He later ruled out a second model run beside it: "I don't reckon we need a 2nd transcriber, MAI does the job. And if the video is from YouTube then Know Fu can grab the 2nd transcript from that anyway." A video added by link keeps the page's captions for that purpose.

The same test found that the model hears a subject's terms when it is told them. The owner agreed that each recording should be transcribed with the vocabulary of the topic it joins, so transcripts improve as the library grows. Hosted transcription over local (September 2026) stands: no local model tested better.

### 23 November 2026: dependencies are welcome when they earn their place

The 0.6 rebuild wrote "no installed dependencies" into the commitments table and "never needs a package" into AGENTS.md. Both were the agent's choice. The owner never asked for either, and reversed them when he found out (punctuation tidied):

> I was completely okay with dependencies. The local element is the point, dependencies are what weaponizes that. I'm completely okay with dependencies if it means better performance. I don't want dependencies for the sake of it, but I'm not against it if it's better.

And on what he had asked the rebuild for: "I wanted optimization as in improving it." Lighter was never the goal.

The rule now: a dependency is welcome when a test shows it improves ingestion, retrieval or checking. It is optional and found at runtime, so a clean clone still runs without it. What the owner agreed on the same day:

- **Add now:** the video tools 0.5 had and 0.6 dropped (a crop from the native frame, a filmstrip of candidate frames, padded audio chunks, word-level timestamps), yt-dlp for video links, and OCR for scanned PDFs.
- **Test first:** a layout-aware PDF converter for tables and formulas, and a reranker.
- **Leave out:** a graph database (his own 12 October decision stands) and a local embedding model (the hosted one is better and already on).

A review on this date compared 0.7 with 0.5 and found capability the rebuild had removed without listing it. The list is in [the rebuild record](REBUILD.md#correction-23-november-2026-capability-the-rebuild-dropped-without-listing).

### 10 November 2026: the rebuild

The owner asked for the architecture to be assessed from scratch, left the direction to the agent ("I'm trusting your intelligence to come up with the best architecture… if you want to completely revamp it then I would probably trust that"), and asked that the old version be kept in case he wants to go back. The assessment found the 0.5 design built around the wrong unit of knowledge, and version 0.6 replaced it. What changed, decided by the agent under that instruction and recorded in [the rebuild record](REBUILD.md#earlier-owner-decisions-what-happens-to-each):

- The Markdown files are the library. JSON records, releases, proposals, jobs, lifecycle plans, the ledger, modules and the evaluation harness are gone. History and rollback are git.
- Domain, then topic. A topic is a folder with a principles page. This changes the 17 October decision, following the owner's own 23 October thinking.
- One library for every agent. This settles a question the owner had deferred.
- A topic the owner pins to a project loads there without invoking the skill. Use is otherwise still deliberate.
- No local embedding model, QMD, Docling or Python environment. Embeddings through an API are an optional second search channel (see the owner's review below). The blanket rule behind this bullet, no installed dependencies, was reversed on 23 November.

The owner chose the size of the acceptance run: three chapters, within five subagents.

After reading the result the same day, the owner corrected three things, and each changed the build:

- **Performance, not cost.** "Cost wasn't really my worry anyway. I was more concerned about sluggish speeds or ineffective ingestion or retrieval at some point in the future, context bloat. I wanna optimize for performance." And on length: "Isn't the important thing that the searchable L1 bit is short? Can't the deeper stuff be longer since the AI will have deliberately selected that document to read anyway?" He is right, and the first 0.6 guides had drifted toward economy. The delta rule stays as a rule about what goes in. The pressure on account length is gone, the retelling warning sits at 35% (recorded here as the owner's figure; on 24 November he said it was the agent's suggestion and never his, and 0.12 removed the warning; it followed a first move to 50% that he called too close to the 63% retelling this rebuild exists to prevent) and is described as a description and never a target, and recall loads whole accounts up to a larger default budget.
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

Six failure modes to watch, because each has already happened once:

- **Stripping.** A change makes the system lighter by removing something it could do. "Optimize" means better at its job. Before a change removes or replaces a capability, list what the system will no longer do and get the owner's yes.
- **Retelling.** The compiled layer follows its sources' order and voice instead of holding ideas a reader can use. Read a sample of what an ingest wrote; no number shows it.
- **Pigeonholing.** A judgment is turned into a score, a quota or a fixed list of questions, and agents start aiming at it. 0.5's evidence levels came out 91% "moderate", and the 35% retelling warning made a reader trim a good note. Teach the judgment in the guide and let the reader make it.
- **Claim lists.** Ingestion breaks a source into free-standing claims with nothing joining them. This is the failure the owner started Know Fu to escape. Every idea lands in a principle or under one.
- **Machinery.** A component is added to guard against a risk a single-user library doesn't have. Ask what a person with one library and git would need.
- **Slogans.** The principles fill with statements that are true of everything. Each principle needs a boundary and more than one thing it explains.

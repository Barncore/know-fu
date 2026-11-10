# Building from the library

The owner uses this library to make things: tools, strategies, courses, videos, software, inventions. The library's part is to give you the footing of someone who has studied the subject. This guide is about using it for that.

## Principles first, specifics on demand

Start work in a subject by loading its topic page with `kf_brief`. The page is short on purpose. It gives you the field's frame and its principles, and it tells you what the library can answer, which matters because you can't ask for what you don't know is there.

Then work the way an expert does. Frame the task in terms of the principles: which ones bear on it, and which pull against each other here. When a decision needs a number, a procedure or a case, fetch it: `kf_recall` with the specific question, or `kf_read` on an account named in a principle's Governs line. Keep fetches narrow. A few accounts that bear on the decision serve better than many that are merely about the subject; loosely related text is the kind of context that degrades reasoning most.

For a compound question, split it into the sub-questions an expert would ask and pass them to `kf_recall` as a list. By default recall loads the best-matching accounts whole, up to about 6,000 tokens; lower `budget` for a quick lookup and raise it for broad synthesis. Read what it loads: an answer built on the full accounts is more useful than one built on their summaries. `load: "gists"` shows one line per matching account when you want to choose before reading. Pass `seen` to skip what you already hold.

When recall says nothing in the library clearly answers a question, take it at its word. It has checked how much of the question the nearest accounts and source pages cover, with the question's rare terms counting most, so its "nearest accounts" in that case are near in vocabulary only.

When the compiled layer doesn't settle something, the sources are underneath. `kf_recall` lists where the original text speaks to a question, and `kf_read` with a source key and a locator returns those pages. Read the original when a detail carries weight, when an account's paraphrase is ambiguous, or when the owner will act on a number.

## Saying where the footing comes from

Three kinds of statement come out of this work, and the owner needs to tell them apart:

- **The library holds it.** Cite the account by name, or the source as the account cites it.
- **You inferred it** from named principles or accounts. Say which, and that it is an inference. This is welcome: it is most of what building from principles means.
- **It is your own background knowledge.** Use it freely to explain and to fill gaps, and say that the library doesn't cover it.

When the library has nothing on a question, say so plainly and name the kind of source that would fill the gap. A gap named is useful; a gap papered over with general knowledge presented as the library's defeats the point of curating one.

## Departing from a principle

A principle states what the sources hold, with the conditions where it breaks. It isn't a rule you must follow. Good work often breaks one on purpose. When your design departs from a principle, say so and why: "this breaks the contrast principle here, deliberately, because…". What matters is that a departure is a choice and never a drift.

When two sources disagree, the library keeps both and a `debate` account says what separates them. Present the disagreement and which conditions favour each side. Don't pick a winner on which source is newer, longer or more confident. If the owner's situation matches one side's conditions, say that.

## Checking a design against the library

Before you call a design, plan or draft done, go back through the topic's principles one at a time and say for each: honoured, broken on purpose (with the reason), or not relevant here. This catches the principle you forgot more often than the one you misapplied. If the owner wants the result kept, save it with `kf_note` from a project, or in the home session write it up as a `case` account with `basis: owner`.

## Teaching and explaining

Order an explanation by what depends on what: the principle before its cases, a `depends on` connection before the account that has it. Use the source's worked cases, and say what each one shows. A near miss, where the method almost applies and doesn't, teaches a boundary better than another success.

## Inventing

Invention is what the library is ultimately for. The moves that work start from principles, tensions and open questions, since those are where a field has room:

- **Push on a boundary.** Take a principle's "Breaks when" and ask what would hold there instead.
- **Negate a principle** and look for the situation where the negation is right.
- **Resolve a tension.** The Tensions section lists where two principles pull apart. A design that gets both is a real idea.
- **Carry a principle across.** A principle stated in terms another field recognizes can be tried in that field. Ask the owner first whether they want ideas from other domains for this task, since some inventions want that and some don't.
- **Answer an open question** from the topic page.

Generate past the obvious first few, then judge each candidate separately on whether it is new to the library and whether it could work. Before proposing, `kf_recall` with `ideas: true` shows ideas already on file, including failed ones and why they failed. That nothing similar turned up is not proof an idea is new.

An idea the owner wants to keep becomes a file in `ideas/` (format in `format.md`): what it is, the principles and accounts it rests on, what would show it is wrong, and how to test it. From another project, save it with `kf_note` and say it is an idea. An idea never becomes evidence. Its status moves only when the owner's own tools produce a result against a pass rule written down before the run.

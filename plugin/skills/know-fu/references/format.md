# The library's file format

Contents: layout · frontmatter · the topic page · a principle · a note · citations and quotes · links and connections · the source page · ideas · what the checker enforces.

The Markdown files are the library. There is no other copy. `kf_check` holds the format, so write freely and let it tell you what it needs.

## Layout

```
INDEX.md                                  generated
log.md                                    one line per change, written on commit
knowledge/<domain>/DOMAIN.md
knowledge/<domain>/<topic>/TOPIC.md       the front page: the frame, then every principle in a line
knowledge/<domain>/<topic>/principles/<id>.md
knowledge/<domain>/<topic>/notes/<name>.md
sources/<id>/source.md
sources/<id>/text.txt, units.json         the extraction; never edit
sources/<id>/captions.txt                 a fetched video's own captions, when the page had them; never edit
sources/<id>/original/                    the file as added; never edit
sources/<id>/pages/, frames/              page images; a video's screen map, filmstrips and opened frames (a cache)
sources/<id>/exhibits/                    video frames kept because a claim relies on them
ideas/<name>.md
inbox/<date>-<name>.md
```

The library's git history holds every Markdown file and the extracted text. `original/`, `pages/`, `frames/` and `exhibits/` are left out of git: they sit in the folder. `pages/` and `frames/` can be made again from the original; `exhibits/` can't once a video has moved, so it is never cleared.

A domain is a broad area (audio, trading). A topic is a subject inside it (mixing, mastering). A principle is an idea that explains several specific things, and a note holds the detail behind principles. Names are lower-case words joined by hyphens. Every note, idea and source needs a name no other one has, because a bare `[[name]]` link finds it anywhere in the library. A principle's name only has to be its own within its topic.

## Frontmatter

A strict subset of YAML: each key holds one string or one list, on one line or as `- item` lines. Mappings, nesting and block scalars are refused. Quote a string that contains a colon followed by a space, or that starts with a bracket or a quote mark.

| File | Required | Optional |
|---|---|---|
| principle | `type: principle`, `title`, `summary`, `support`, `updated` | `keywords` |
| note | `type: note`, `title`, `summary`, `kind`, `principles`, `sources`, `basis`, `updated` | `keywords`, `status`, `retired_reason` |
| topic | `type: topic`, `title`, `summary`, `updated` | `keywords` |
| domain | `type: domain`, `title`, `summary` | `updated` |
| source | `type: source`, `title`, `key`, `kind`, `family`, `added`, `status` | `authors`, `year`, `url`, `note`, and the fields the engine writes |
| idea | `type: idea`, `title`, `summary`, `status`, `premises`, `updated` | `topics` |

- `summary` of a principle: the line the topic page shows for it. The principle with its limit, as in "X, because Y, until Z".
- `support` of a principle: the kind of support it rests on. One of `review of studies`, `controlled comparison`, `measured data`, `worked cases`, `reasoned argument`, `bare assertion`, `our inference`. The ingest guide says what each means.
- `kind` of a note: `mechanism` (how or why something works), `method` (what to do, in order, with decision points), `case` (a worked example or a near miss), `reference` (numbers, a table), `debate` (how two positions relate), `definition` (a term the sources use in their own way, when it needs more than a line of Vocabulary).
- `basis` of a note: `source` when it reports what sources say, `synthesis` when the connection across sources is yours, `owner` for the owner's own notes and results.
- `principles` of a note: the ids of the principles it rests on, which are their file names. For a principle in another topic, `domain/topic#id`. May be `[]`, and the checker will ask why.
- `sources`: citation keys, like `[WKH, ATK]`. Every key the text cites must be listed.
- `status: retired` with a `retired_reason` takes a note out of recall without deleting it. Use it when a source turns out wrong or out of date.
- Dates are `YYYY-MM-DD`.

## The topic page

```markdown
---
type: topic
title: Wood firing
summary: Firing stoneware in a wood kiln, from the climb to the cool.
updated: 2026-11-10
---
# Wood firing

## Frame

Two to four paragraphs on how the subject hangs together: what a practitioner is trying to do, the few forces that decide the outcome, and how the principles below relate.

## Principles

- [Heat work matures ware](principles/heat-work-matures-ware.md): Ware matures by temperature held over time, so the schedule matters as much as the peak, until the chamber is too uneven for one schedule. (reasoned argument; 1 separate source; 2 notes)

## Tensions

- Evenness against character: a hold evens the chamber and flattens ash runs. See [[hold-or-stop-at-cone-9]].

## Decision map

- Choosing a firing schedule: start at [[hold-at-cone-9]], then read the debate if surface matters more than evenness.

## Vocabulary

- **Heat work:** temperature integrated over time; what a cone measures.

## Open questions

- Does a ten minute hold keep the ash runs?
```

Everything under `## Principles` is written by `kf_check` from the principle files: each one's title, its `summary`, its `support`, how many separate sources state or imply it (sources that share a `family` count once), and how many notes rest on it. Don't write there. The one thing that is yours is the order: put the lines in the order a reader should meet them, foundations first, and the checker keeps it. A new principle is added at the end. Notes that name no principle are listed under the principles, so nothing is hidden.

Frame is required. Add the other sections as the topic earns them. Vocabulary is for terms the sources use in their own way, not a glossary of the field. Open questions holds what the sources leave unanswered.

The page is meant to be read whole. Detail belongs in the principle files and the notes.

## A principle

One file per principle, in the topic's `principles/` folder. The file name is its id.

```markdown
---
type: principle
title: Heat work matures ware
summary: Ware matures by temperature held over time, so the schedule matters as much as the peak, until the chamber is too uneven for one schedule.
support: reasoned argument
updated: 2026-11-10
---
# Heat work matures ware

Ware matures by temperature held over time, so the schedule matters as much as the peak.

- **Why:** glaze and body reactions need time at temperature, and a cone measures both together [WKH p.31].
- **Breaks when:** Inferred: a chamber so uneven that no single schedule suits every shelf. The handbook states no limit.
- **Merit:** The reason follows from how a cone works, which any potter can watch. The handbook measures nothing, and a speaker who stops at cone 9 shows that maturity is not the only goal a firing can have.

## Evidence

### WKH: states it

Gives the mechanism and the practice that follows: a slow climb to a lower peak can mature a glaze that a fast climb leaves raw, which is why potters read cones and not only a pyrometer [WKH p.31].

### ATK: qualifies it

Accepts the mechanism and refuses the conclusion that every shelf must mature: the speaker stops when cone 9 is flat at the front and takes an uneven chamber as part of the work [ATK 1:10].

## Connections

- conflicts with [[wood-firing#ash-needs-a-moving-flame]]: the hold that evens heat work is what flattens ash runs
```

The opening paragraph is the statement. **Why**, **Breaks when** and **Merit** are required. Merit is your weighing of the logic, in a sentence or three: does the reason follow, what is the strongest objection, where is the support thin. Start a line with "Inferred:" where it is your reading and not the source's.

`## Evidence` has one entry per source that bears on the principle, headed with the source's key and how it stands: `states it`, `implies it` (you read it out of what the source does), `qualifies it` or `disputes it`. Under the heading, say what that source brings that the principle didn't already have: a reason, a case, a number, a limit. Keep it to a few lines. A source that only agrees gets one line and its citation. The reason itself is written once, in Why, and detail belongs in a note. For what no single source holds, head an entry `### Synthesis` and say which sources it joins; for the owner's own results, `### Owner`.

`## Connections` is optional. Don't write a `## Notes` section: `kf_check` adds one, listing by title the notes whose `principles` name this file, and rewrites it on every run. To put a note under a principle, add the principle's id to the note's `principles`.

## A note

```markdown
---
type: note
kind: method
title: Hold forty minutes once cone 9 bends
summary: A forty minute hold at cone 9 evens a chamber that can differ by two cones front to back.
principles: [heat-work-matures-ware]
sources: [WKH]
basis: source
keywords: [soak, even temperature]
updated: 2026-11-10
---
The point first, then why, then the specifics with their pages [WKH p.31], then where it breaks.

## Connections

- depends on [[wood-firing#heat-work-matures-ware]]: the hold adds heat work without adding temperature
- qualifies [[some-other-note]]: what it changes about that note
```

Sections inside a note are optional and yours to choose; a method often wants "When to use", "Steps" and "Failure modes". The file name is the note's name.

## Citations and quotes

A citation is a source key and a locator in square brackets: `[WKH p.112]`, `[WKH p.112-118]`, `[NOTES s.3]` for a section of a text file, `[ATK 12:34]` or `[ATK 12:34-15:00]` for what a recording said, and `[ATK 12:36 screen]` for what its screen showed at that moment. Pages are the file's physical pages, counted from 1, which is what `kf_read` shows; note a printed-page offset in the source's About section if it helps.

Put the citation right after what it supports. Cite every specific: a number, a rule, a claim someone might check. One bracket holds one citation; for two places write two brackets, `[WKH p.31] [ATK 1:10]`.

Text in double quotes immediately before a citation is a quotation, and the checker verifies that those words are in that part of the source, give or take a page. Mark a cut with `…`. To paraphrase, leave the quotation marks off. Words quoted before a screen citation are words printed on the screen, which no transcript holds: the checker verifies that a frame at that time was opened, and asks that a frame cited from a principle, a note or a topic page be kept. Quote sparingly: for a definition, a rule stated exactly, or wording that matters. Double quotes are for a source's exact words and nothing else, in every line including Merit: a paraphrase in quote marks reads as the source speaking. The checker warns about a quotation of five words or more with no citation after it.

## Links and connections

`[[name]]` links a note, idea or source. `[[domain/topic]]` links a topic. `[[domain/topic#principle-id]]` links a principle, `[[topic#principle-id]]` works when the topic's name is unique, and `[[#principle-id]]` links a principle in the same topic.

A link in running text is a mention. A link in a bullet under `## Connections` is a typed connection: the bullet starts with one of `depends on`, `supports`, `qualifies`, `conflicts with`, `example of`, `extends`, `see also`, then the link, then a colon and the reason. The reason is the point: say what the connection is. `qualifies` and `conflicts with` matter most, because recall always shows a note that disputes or qualifies what it loads. Connections work the same in a principle file and in a note, and `kf_connect` walks them in both directions.

## The source page

`kf_source` writes it with placeholders. You fill in:

- **About:** who made it, what it sets out to do, and how far to trust it (experience, measurement, argument).
- **Map:** one `### Title [p.A-B]` heading per stretch, in order, each with a line saying what the stretch covers. Ranges use the source's own locators (`[s.1-4]`, `[0:00-12:30]`), and together they cover every unit that has text. A stretch with nothing worth keeping still gets a heading and a line saying so. Inside this file, cite with a bare locator, `[p.68]`, with no key: it is resolved against this source and checked like any citation.
- **What it changed:** which principles this source added, strengthened, sharpened, qualified or disputed, which notes are new or revised, and what it leaves open.

A video with a screen adds two things, both described in the video guide. Each map entry ends with a `- **Frames:**` line naming the frames that were opened, like `12:36, 13:02`, or `none` and why. And an optional `## Exhibits` section holds one `### 12:36 What the frame shows` heading for each frame kept with `kf_source` action "keep", with its record underneath: what it shows, its marks as data with how each number was read, what was said, and what it supports.

Set `status: compiled` when all three are written. `family` groups sources that share an origin, such as a book and its author's talk on the same material, or two lessons by one teacher, so they count once when the topic page says how many separate sources hold a principle. It defaults to the first author's name, which is right for one teacher's lessons. Set it by hand when two authors share an origin (a student teaching a mentor's method) or one author's works really are independent studies. Use `owner` for the owner's own notes.

## Ideas

A candidate invention, kept apart from knowledge.

```markdown
---
type: idea
title: A ten minute hold
summary: A short hold might even the chamber and keep the ash runs.
status: candidate
premises: [hold-at-cone-9, ceramics/wood-firing#heat-work-matures-ware]
updated: 2026-11-10
---
What the idea is, why it might work given its premises, what would show it is wrong, and how to test it.

## Results

- 2026-11-03, owner's kiln, pass rule set beforehand ("ash runs visible on 3 of 4 test tiles"): passed, 4 of 4. One firing.
```

`status` is `candidate`, `testing`, `passed`, `failed` or `parked`, and it moves only when a result from the owner's own tools is recorded under Results, against a pass rule written down before the run, with how many variants were tried. A failed idea stays, with why. Nothing in `knowledge/` or `sources/` may link to an idea. When an idea has been borne out, what was learned becomes a note with its own evidence and `basis: owner`.

## What the checker enforces

Errors block a commit: malformed or unknown frontmatter, a link or citation that points at nothing, quoted words that aren't in the source, a cited key missing from a note's `sources`, a principle with no statement, Why, Breaks when or Merit, a principle whose `support` isn't one of the kinds, a principle with no evidence entry, an evidence entry that doesn't say how its source stands or cites nothing from it, a note naming a principle that doesn't exist, knowledge linking to an idea, a compiled source with placeholders or with pages no map entry covers, an exhibit record with no kept frame or no time in its heading, a screen citation at a moment no frame was opened, a page whose summary is still the placeholder, two things with one name, and a topic still laid out the way Know Fu was before 0.12.

Warnings are judgment calls, each worded as the question to answer: a stretch of video where the screen changed three or more times and the map entry has no Frames line, a Frames line naming a frame nobody opened, a kept frame with no record, a screen citation whose frame isn't kept, a principle that cites a source it has no evidence entry for, a quotation of five words or more with no citation after it, a note under 80 or over 1,500 words, a summary over 60 words, a note under no principle, two notes with nearly the same title, a topic page too long to read whole, and a topic near 40 principles.

A library made before 0.12 is moved with `node <plugin>/engine/cli.ts migrate` (`--dry-run` shows what it would do). It moves each principle into its own file and renames `accounts/` to `notes/`. It can't judge, so it leaves each principle's `support`, Merit line and evidence entries as TODO for a reader to write.

# The library's file format

Contents: layout · frontmatter · the topic page · an account · citations and quotes · links and connections · the source page · ideas · what the checker enforces.

The Markdown files are the library. There is no other copy. `kf_check` holds the format, so write freely and let it tell you what it needs.

## Layout

```
INDEX.md                                  generated
log.md                                    one line per change, written on commit
knowledge/<domain>/DOMAIN.md
knowledge/<domain>/<topic>/TOPIC.md
knowledge/<domain>/<topic>/_index.md      generated: every account under its principle
knowledge/<domain>/<topic>/accounts/<name>.md
sources/<id>/source.md
sources/<id>/text.txt, units.json         the extraction; never edit
sources/<id>/original/                    the file as added; never edit
sources/<id>/pages/, frames/              page images and video frames, rendered when asked for
ideas/<name>.md
inbox/<date>-<name>.md
```

The library's git history holds every Markdown file and the extracted text. `original/`, `pages/` and `frames/` are left out of git: they sit in the folder and don't change.

A domain is a broad area (audio, trading). A topic is a subject inside it with its own principles (mixing, mastering). Names are lower-case words joined by hyphens. Every account, idea and source needs a name no other one has, because a bare `[[name]]` link finds it anywhere in the library.

## Frontmatter

A strict subset of YAML: each key holds one string or one list, on one line or as `- item` lines. Mappings, nesting and block scalars are refused. Quote a string that contains a colon followed by a space, or that starts with a bracket or a quote mark.

| File | Required | Optional |
|---|---|---|
| account | `type: account`, `title`, `summary`, `kind`, `principles`, `sources`, `basis`, `updated` | `keywords`, `status`, `retired_reason` |
| topic | `type: topic`, `title`, `summary`, `updated` | `keywords` |
| domain | `type: domain`, `title`, `summary` | `updated` |
| source | `type: source`, `title`, `key`, `kind`, `family`, `added`, `status` | `authors`, `year`, `url`, `note`, and the fields the engine writes |
| idea | `type: idea`, `title`, `summary`, `status`, `premises`, `updated` | `topics` |

- `kind` of an account: `mechanism` (how or why something works), `method` (what to do, in order, with decision points), `case` (a worked example or a near miss), `reference` (numbers, a table, terms), `debate` (how two positions relate).
- `basis`: `source` when the account reports what sources say, `synthesis` when the connection across sources is yours, `owner` for the owner's own notes and results.
- `principles`: ids from this topic's page (the heading, in lower case with hyphens). For a principle in another topic, `domain/topic#id`. May be `[]`, and the checker will ask why.
- `sources`: citation keys, like `[WKH, ATK]`. Every key the text cites must be listed.
- `status: retired` with a `retired_reason` takes an account out of recall without deleting it. Use it when a source turns out wrong or out of date.
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

### Heat work matures ware

Ware matures by temperature held over time, so the schedule matters as much as the peak.

- **Why:** glaze and body reactions need time at temperature, and a cone measures both together.
- **Breaks when:** Inferred: a chamber so uneven that no single schedule suits every shelf. The source states no limit.
- **Held by:** WKH (stated, p.31); ATK (inferred)

## Tensions

- Evenness against character: a hold evens the chamber and flattens ash runs. See [[hold-or-stop-at-cone-9]].

## Decision map

- Choosing a firing schedule: start at [[hold-at-cone-9]], then read the debate if surface matters more than evenness.

## Vocabulary

- **Heat work:** temperature integrated over time; what a cone measures.

## Open questions

- Does a ten minute hold keep the ash runs?
```

Under each principle heading, the first paragraph is its statement. **Why**, **Breaks when** and **Held by** are yours to write. Cite the page where the source says it, and start the line with "Inferred:" where it is your own reading. Don't write a **Governs** line: `kf_check` adds one under each principle, listing the accounts that name it, and rewrites it on every run. To put an account under a principle, add the principle's id to the account's `principles`.

A principle's id is its heading in lower case, with punctuation dropped and spaces turned to hyphens: "The ear is the detector" is `the-ear-is-the-detector`, and "Loud isn't level, it's contrast" is `loud-isnt-level-its-contrast`. Write the heading as a plain statement and the id follows. The topic's `_index.md` lists every id, and a wrong one gets a checker error that names the right ones.

Frame and Principles are required. Add the other sections as the topic earns them; Vocabulary is for terms the sources use in their own way, not a glossary of the field.

The page is meant to be read whole, at about 2,000 to 4,000 tokens. Detail belongs in accounts.

## An account

```markdown
---
type: account
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
- qualifies [[some-other-account]]: what it changes about that account
```

Sections inside an account are optional and yours to choose; a method often wants "When to use", "Steps" and "Failure modes". The file name is the account's name.

## Citations and quotes

A citation is a source key and a locator in square brackets: `[WKH p.112]`, `[WKH p.112-118]`, `[NOTES s.3]` for a section of a text file, `[ATK 12:34]` or `[ATK 12:34-15:00]` for a recording. Pages are the file's physical pages, counted from 1, which is what `kf_read` shows; note a printed-page offset in the source's About section if it helps.

Put the citation right after what it supports. Cite every specific: a number, a rule, a claim someone might check.

Text in double quotes immediately before a citation is a quotation, and the checker verifies that those words are in that part of the source, give or take a page. Mark a cut with `…`. To paraphrase, leave the quotation marks off. Quote sparingly: for a definition, a rule stated exactly, or wording that matters.

## Links and connections

`[[name]]` links an account, idea or source. `[[domain/topic]]` links a topic. `[[domain/topic#principle-id]]` links a principle, and `[[topic#principle-id]]` works when the topic's name is unique.

A link in running text is a mention. A link in a bullet under `## Connections` is a typed connection: the bullet starts with one of `depends on`, `supports`, `qualifies`, `conflicts with`, `example of`, `extends`, `see also`, then the link, then a colon and the reason. The reason is the point: say what the connection is. `qualifies` and `conflicts with` matter most, because recall always shows an account that disputes or qualifies what it loads.

## The source page

`kf_source` writes it with placeholders. You fill in:

- **About:** who made it, what it sets out to do, and how far to trust it (experience, measurement, argument).
- **Map:** one `### Title [p.A-B]` heading per stretch, in order, each with its digest. Ranges use the source's own locators (`[s.1-4]`, `[0:00-12:30]`), and together they cover every unit that has text. Inside this file, cite with a bare locator, `[p.68]`, with no key: it is resolved against this source and checked like any citation.
- **What it changed:** the principles and accounts this source added or altered, and what it leaves open.

Set `status: compiled` when all three are written. `family` groups sources that share an origin, such as a book and its author's talk on the same material, so they count once when asking how many sources hold a principle. Use `owner` for the owner's own notes.

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

`status` is `candidate`, `testing`, `passed`, `failed` or `parked`, and it moves only when a result from the owner's own tools is recorded under Results, against a pass rule written down before the run, with how many variants were tried. A failed idea stays, with why. Nothing in `knowledge/` or `sources/` may link to an idea. When an idea has been borne out, what was learned becomes an account with its own evidence and `basis: owner`.

## What the checker enforces

Errors block a commit: malformed or unknown frontmatter, a link or citation that points at nothing, quoted words that aren't in the source, a cited key missing from `sources`, a principle with no statement, Why, Breaks when or Held by, a principle that governs no account, an account naming a principle that doesn't exist, knowledge linking to an idea, a compiled source with placeholders or with pages no digest covers, two things with one name.

Warnings are judgment calls, each worded as the question to answer: an account under 80 or over 1,500 words, a summary over 60 words, an account under no principle, a principle governing a single account, two accounts with nearly the same title, a topic page too long to read whole, and accounts citing a source that total more than 35% of the length of what was read.

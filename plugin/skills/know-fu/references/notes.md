# Writing notes

A note is one unit of understanding: a mechanism, a procedure, a concept, a lesson, a judgment about a disagreement, or an open question. You write it as Markdown with a short frontmatter block, and `kb_write {job_id, notes:[...]}` turns a batch of them into canonical records. The engine does the tedious parts for you. It creates the passages for the units you cite, checks your quotes against the source text, turns `links` into relationship records, and fills in every identity, hash and default. Then the normal validation runs.

Put your effort into the prose. Write something a reader can actually learn from: why the thing works, what it rests on, where it stops working, and an example. The frontmatter only carries what the engine and later readers need to find, connect and weigh the note.

## A complete example

```markdown
---
id: holm-step-down
type: knowledge
form: procedure
title: Holm step-down: order, threshold and stopping rule
summary: Sort p-values, compare the i-th with alpha/(m-i+1), and stop at the first failure.
holds_when: [a planned family of m hypotheses, valid marginal p-values]
not_for: [choosing the family after seeing the results]
facets:
  purpose:
    - text: Control the chance of any false rejection across a planned family of tests
      abstract: Limit the chance of any false alarm across many related checks
  mechanism:
    - text: Compare sorted p-values with thresholds that loosen step by step, stopping at the first failure
      abstract: Test candidates in order of strength against a bar that relaxes after each pass
cites:
  - unit: source:aa5fa1c71338d0d380e7a97e3503:unit-34
    quote: "Holm's step-down procedure"
  - source:aa5fa1c71338d0d380e7a97e3503:unit-37
uses: [family-wise-error]
links:
  - depends_on: family-wise-error
    why: The thresholds only make sense once the comparison family is fixed.
  - qualifies: post-hoc-comparisons
    why: Against a control, Holm rejects at least as much as Bonferroni-Dunn at the same alpha.
---
For m planned hypotheses, sort the p-values ascending and compare p(i) with alpha/(m-i+1),
starting at i=1. Keep rejecting until the first failure, then retain that hypothesis and every
one after it. ...
```

The same batch can hold the `family-wise-error` concept and the `post-hoc-comparisons` note. Slugs resolve inside a batch and across later batches of the same job, so you can refer to notes by their short names throughout.

## Fields

| Field | Use |
|---|---|
| `id` | Required. A short lowercase slug, unique within the job. Other notes refer to it. |
| `type` | `knowledge`, `concept`, `learning`, `judgment` or `question`. |
| `title` | A sentence or claim-like phrase, not a topic label. |
| `form` | knowledge: `mechanism`, `procedure`, `explanation`, `synthesis`, `assertion`. learning: `primer`, `lesson`, `worked_example`, `near_miss`, `application`, `teaching_sequence`. |
| `summary` | One or two sentences a reader can choose from. Defaults to the first paragraph. |
| `cites` | Evidence. A unit id from `kb_read {kind:"unit"}` becomes a located passage. `{unit, quote}` also stores a verified quote. A record id (`passage:...@1`, `knowledge:...@2`) cites existing library material. |
| `uses` | Notes or records this one builds on. Concepts listed here become the knowledge's concepts; knowledge listed on a lesson becomes what it teaches. |
| `links` | Typed relationships from this note: `supports`, `challenges`, `qualifies`, `depends_on`, `explains`, `exemplifies`, `applies_to`, `derived_from`. Each needs `why`. `depends_on` points at the prerequisite. |
| `holds_when`, `not_for` | Conditions and exclusions. They travel with the note into every recall. |
| `epistemic` | Defaults to `source_account` for a single-source knowledge or concept note and `synthesis` otherwise. Use `inference` or `hypothesis` when you go beyond the sources, `illustration` for an invented example. |
| `domains` | Defaults to the job's domains. |
| `revises` | A published record id. The note becomes its next revision and inherits every field you leave out. Needs `change` or `reaffirm`. |
| `change`, `reaffirm` | Why this revision exists. `reaffirm` alone, with no body, keeps the record as it is and records that new evidence was considered. |
| `facets` | What the note does, so other fields can find it by function. Required on new `mechanism` and `procedure` notes: at least one `purpose` and one `mechanism`, each `{text, abstract}`. Optional slots: `preconditions`, `failure_modes`, `evaluation_method`. See "Saying what a note does" below. |
| `decisions` | Optional, on `procedure` notes: the choices the procedure turns on, each `{at, decide, options: [{if, then}], check, cite, stated}`. See "Writing down the decisions" below. |
| `assess` | Optional: `{evidence: {level, basis, why}}`, and `{level, why}` for `fidelity` and `applicability`. Levels are `low`, `moderate`, `high` and `unknown`. Each level needs a one-line `why`. See "Assessing a note" below. |

Family fields: a concept may set `definition`, `meaning_scope` and `aliases`. A learning note lists what it teaches under `uses` and may set `objectives`. A judgment sets `issues` (the accounts it weighs), `outcome` (`different_scope`, `compatible`, `qualified`, `provisional_preference`, `superseded_interpretation`, `unresolved`), optional `alternatives` and `preferred`, and `what_would_change`. A question sets `related`, `known`, `unknown`, `impact`, `next_action` and `priority: {impact, effort, why}`.

## Saying what a note does

Facets are how the library finds a useful idea in a field that shares no words with the problem. A volatility-targeting rule in a trading book and a compressor in a mastering book do the same job, and only their facets would show it. So every new `mechanism` and `procedure` note says what it's for (`purpose`) and how it works (`mechanism`), and each entry gets two wordings:

- `text`: a short phrase in the source's own terms, 30 words or fewer.
- `abstract`: the same thing with the field's own vocabulary taken out, 15 words or fewer. Name the specific subproblem it solves, not the field's overall goal. "Limit the chance of any false alarm across many related checks" works; "improve statistical rigour" doesn't, because half the library could claim it.

```yaml
facets:
  purpose:
    - text: Keep portfolio volatility near a target
      abstract: Hold a fluctuating output near a set level
  mechanism:
    - text: Scale position size inversely to recent realized volatility
      abstract: Reduce input gain when measured disturbance rises
  failure_modes:
    - Volatility jumps faster than the lookback window can see
```

One to four entries per slot, and one each is usually right; add a second only for a genuinely separate job or step. For a decision rule, the purpose is the decision it supports and the mechanism is the test it applies. `preconditions`, `failure_modes` and `evaluation_method` are optional plain phrases with no abstract wording; add them only when the source states them. Each entry's `basis` defaults to `source_stated` for a source's own account and `inferred` otherwise; set `basis: proposed` for a function you're suggesting rather than reporting. Write facets while the page is open, because that's when they're cheap. A revision keeps the facets it inherits unless you give new ones, and a reaffirmation doesn't need them; `kb_brief` counts the accounts still missing them.

## Writing down the decisions

A procedure's steps are the easy part to copy from a book. What an expert actually carries around is where the steps branch: the moment a choice comes up, what they're deciding, what they do in each case, and how they check they chose right. `decisions` records that, and `kb_recall` shows it as a small tree for `teach` and `apply`.

```yaml
decisions:
  - at: After the first full listen on small speakers
    decide: Is the low end masking the kick?
    options:
      - if: The kick disappears under the bass
        then: Duck the bass under the kick with a sidechain
      - if: Both stay clear
        then: Leave the low end and move on to stereo width
    check: A/B at low volume on the small speakers
    cite: source:…:unit-12
  - at: Before limiting
    decide: How much gain reduction is acceptable?
    options:
      - if: The genre expects dense masters
        then: Up to about 3 dB on peaks
      - if: Otherwise
        then: Keep it under 1 dB
    stated: false
```

`at` is the cue, 20 words or fewer. `decide` is the question being settled, 25 or fewer. Each decision has two to five options, and "Otherwise" is a fine `if`. Keep each `if` and `then` to 30 words or fewer, and `check` to 25. `cite` takes a unit or passage, which becomes a page label in the tree and is added to the note's evidence if it isn't there already.

Books often skip decisions an expert makes without thinking. When you can see a choice the source never states, still record it, with `stated: false`. The tree marks it "inferred: the source doesn't state this choice", so the reader knows it's yours. On a source's own account, decisions default to stated, so mark every one the source skips. Up to 12 per note. A revision keeps the decisions it inherits unless you give new ones, and `decisions: []` removes them. Adding them counts as a real change to the procedure, so lessons built on it go pending until someone looks.

## Assessing a note

Every level you set will be shown to every later session, right on the note's identity line with its reason. That's what makes assessments useful, and also why a careless one does damage. So assess what you actually checked, and leave the rest out.

| Dimension | What it judges | Assess it when |
|---|---|---|
| `evidence` | How well the claim is supported: the design, sample, replication and checks behind it | The note is a claim a decision could rest on, such as a procedure, a mechanism or a recommendation. Skip definitions and illustrations |
| `fidelity` | How faithfully the note renders the source | You checked the wording, numbers or table against the original page or frame. Reserve `high` for after that check. It matters most on tables, figures, OCR pages, multi-column layouts and any claim that carries a number |
| `applicability` | How well the note fits one specific case | You applied it to a case, in the check stage or a worked application. Put the case in `context` |

An evidence level also names its `basis`, the kind of support the source actually shows. Pick it while the page is open:

| `basis` | The source offers |
|---|---|
| `review_of_studies` | A pooled review of many studies with a stated method |
| `controlled_comparison` | An experiment, trial or A/B test with a comparison group |
| `measured_observation` | Data without a control: surveys, datasets, field counts, benchmarks |
| `worked_case` | Cases, examples or the author's own experience |
| `reasoned_argument` | A derivation or argument from stated premises, including a proof |
| `bare_assertion` | The claim, stated without support |
| `our_inference` | Your inference across records, not the source's claim |

`high` from a `worked_case`, a `bare_assertion` or `our_inference` needs at least two independent source families behind the note; the engine refuses it otherwise. Repeating one source, or citing its summary, never adds a family.

```yaml
assess:
  evidence: {level: moderate, basis: measured_observation, why: One benchmark of 14 datasets and no independent replication}
  fidelity: {level: high, why: Table 3 checked cell by cell against the page image}
```

`unknown` means you looked and couldn't tell. Leaving a dimension out means nobody looked, and on a revision a dimension you leave out keeps its earlier value. A guessed level is worse than none, because later sessions will trust it. And levels never pick a winner: when accounts conflict, recall shows both sides' levels next to each other, and it's a judgment note that settles or keeps the disagreement, with reasons.

## Revising and reaffirming

```markdown
---
id: handling-still-holds
revises: knowledge:handling@1
reaffirm: The ventilation notice adds a humid-room wait but leaves the dry-room procedure unchanged.
---
```

That's a complete reaffirmation: one line saying why the old account still holds. A revision with a body replaces the prose; one without keeps it. `holds_when`, `not_for`, `objectives` and `preferred` replace the inherited values when you set them, while `cites`, `uses`, `issues`, `alternatives`, `related` and `aliases` add to them. Retiring an input or a link is a lifecycle change, not a revision.

## Before you call

- Ground every knowledge, learning, judgment and question note in `cites` or `uses`. The engine rejects ungrounded notes.
- Copy quotes exactly. If a quote fails, the engine sends back the closest wording in the source; fix it or drop the quote.
- Run `dry_run:true` on a big batch first. It validates everything and stages nothing.
- Send at most 60 notes per call, and keep related notes in the same batch so their slugs resolve.
- Keep the author's account apart from your synthesis: one note says what the source says, another says what follows from combining it with other sources.

# Writing notes

A note is one unit of understanding: a mechanism, a procedure, a concept, a lesson, a judgment about a disagreement or an open question. Write it as Markdown with a short frontmatter block. `kb_write {job_id, notes:[...]}` turns a batch of notes into canonical records. It creates the passages for the units you cite, checks your quotes against the source text, turns `links` into relationship records and fills every identity, hash and default. Then the normal validation runs.

Write prose a reader can learn from: why the thing works, what it rests on, where it stops working, an example. The frontmatter carries only what the engine and later readers need to find, connect and weigh the note.

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

The batch can hold the `family-wise-error` concept and the `post-hoc-comparisons` note too; slugs resolve inside the batch and across later batches of the same job.

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
| `assess` | Optional: `{evidence: {level, basis, why}}`, and `{level, why}` for `fidelity` and `applicability`. Levels are `low`, `moderate`, `high` and `unknown`. Each level needs a one-line `why`. See "Assessing a note" below. |

Family fields: a concept may set `definition`, `meaning_scope` and `aliases`. A learning note lists what it teaches under `uses` and may set `objectives`. A judgment sets `issues` (the accounts it weighs), `outcome` (`different_scope`, `compatible`, `qualified`, `provisional_preference`, `superseded_interpretation`, `unresolved`), optional `alternatives` and `preferred`, and `what_would_change`. A question sets `related`, `known`, `unknown`, `impact`, `next_action` and `priority: {impact, effort, why}`.

## Assessing a note

Recall shows every level you set to every later session, on the note's identity line and with its reason. So assess what you actually checked, and leave the rest out.

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

`unknown` means you looked and couldn't tell. Leaving a dimension out means nobody looked; on a revision, a dimension you leave out keeps its earlier value. A guessed level is worse than none, because later sessions will weigh it. Levels never pick a winner: when accounts conflict, recall shows both sides' levels next to each other, and a judgment note settles or keeps the disagreement with reasons.

## Revising and reaffirming

```markdown
---
id: handling-still-holds
revises: knowledge:handling@1
reaffirm: The ventilation notice adds a humid-room wait but leaves the dry-room procedure unchanged.
---
```

A revision with a body replaces the prose; one without keeps it. `holds_when`, `not_for`, `objectives` and `preferred` replace the inherited values when you set them. `cites`, `uses`, `issues`, `alternatives`, `related` and `aliases` add to them. Retiring an input or a link is a lifecycle change, not a revision.

## Before you call

- Ground every knowledge, learning, judgment and question note in `cites` or `uses`. The engine rejects ungrounded notes.
- Copy quotes exactly. A failed quote returns the closest wording in the source; fix it or drop the quote.
- Run `dry_run:true` on a large batch first. It validates everything and stages nothing.
- At most 60 notes per call. Send related notes in the same batch so their slugs resolve.
- Keep the author's account apart from your synthesis: one note says what the source says, another says what follows from combining it with other sources.

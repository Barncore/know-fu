# Architecture and storage

[Package overview](../README.md) · [Setup](setup.md) · [Schemas](../contracts/README.md)

How Know Fu stores knowledge, and how the pieces fit together. One thing to know up front: the engine version and the schema version are separate numbers, and the bundled [contract manifest](../engine-contracts.json) records both.

## Who does what

```text
Book / PDF / video / other source
  -> original copied and never changed; extraction into located units
  -> the AI reads text and visuals, rebuilds the argument, writes notes
  -> the engine validates and publishes canonical JSON records + Markdown prose
       -> wiki (generated)
       -> FalkorDB graph (generated, optional for answering)
       -> QMD keyword and vector search (generated)
  -> kb_brief, kb_recall, kb_connect, exact reads of records and source pages
  -> explanation, teaching, application, new ideas, corrections, new questions
  -> kb_file sends worth-keeping answers back in as cited syntheses
```

The split is simple. The AI writes the meaning, and the engine keeps it honest: it checks structure, references, scope, reading coverage, quotes and that publication is consistent. Those checks can't tell you an interpretation is *right*, only that it's well-formed and grounded. The wiki, graph and search index are all generated from the same published records. Think of them as three windows onto one library, not three separate readings of the source.

## Records

Everything in the library is a record. The [record schema](../contracts/schemas/record.schema.json) gives every record the same shared metadata, plus a payload for its family:

| Family | What it holds |
|---|---|
| `source` | An original source's identity and how it was extracted |
| `passage` | A located piece of a source, including evidence tied to page images or frames |
| `concept` | A definition, its scope and the distinctions that matter |
| `knowledge` | An assertion, explanation, mechanism, procedure or synthesis |
| `relationship` | A typed, reasoned link between exact record revisions |
| `judgment` | A reasoned assessment of competing or overlapping accounts |
| `learning` | A primer, lesson, worked example, near miss, application or teaching sequence |
| `question` | A gap in the library, what it's grounded in, and whether it's resolved |

The shared fields are `id`, `revision`, `corpus_id`, `maintenance_module`, `scope`, `provenance`, `epistemic`, `assessments`, `depends_on`, `supersedes`, `lifecycle`, `archived`, optional `extensions`, and an optional `body` path and hash. The full explanation lives in `body.md`. Metadata never stands in for the prose.

### Identity, provenance and labels

An id plus a revision names one exact meaning at one point in time, a bit like a commit. A release says which revisions are current. Provenance ties each meaning to its sources and to the records it was built from. Epistemic labels keep a source's own account apart from synthesis, inference, hypothesis, judgment and illustration, so you always know whose claim you're looking at.

### Assessments

Three questions get answered separately, because they really are different: did we read the source right (fidelity), how well supported is the claim (evidence), and does it hold in this case (applicability). A faithful account of an author can still be a badly supported rule.

Each assessment is a level (`low`, `moderate`, `high` or `unknown`, or `not_assessed` when nobody looked) with a rationale and an optional context. An evidence assessment also names its `basis`, the kind of support the source actually shows, from `review_of_studies` through `bare_assertion` to `our_inference`. `kb_write` refuses three things: a level without a reason, an evidence level without a basis, and `high` from a worked case, a bare assertion or an inference unless at least two independent source families stand behind the note.

Recall puts the levels to work. It shows them on each account's identity line with their reasons, and wherever a challenge link or a judgment joins two accounts, it sets both sides next to each other. `kb_brief` does the same for live disagreements. What levels never do is change the ranking or pick a winner.

### Extensions

Three optional extensions carry extra structure. `extensions.navigation` holds an authored one-line summary where the record's own fields don't give one. `extensions.citations` holds verbatim quotes from the record's cited passages, and each quote is checked against the passage text when the record is staged and again at publication.

`extensions.functional_facets` says what an account does, so a record from another field can be matched by function rather than topic. Its slots are `purpose`, `mechanism`, `preconditions`, `failure_modes` and `evaluation_method`; each entry has `text` in the source's terms, an optional `abstract` wording in domain-free words, a `basis` and evidence refs. `kb_write` requires a purpose and a mechanism, both with abstract wordings, on every new `mechanism` and `procedure` note, and checks that each wording is short and that the abstract doesn't just repeat the text. A revision that only adds or edits facets isn't a change of meaning: it doesn't reopen dependents, clear pending flags or make a primer stale. `kb_brief` counts mechanism and procedure accounts that still lack facets. Nothing searches the facets yet; they're there so far-analogy retrieval can be built on them.

### Rules that keep history trustworthy

Only CURRENT and the releases it descends from can be read by exact revision. A candidate release left behind by an interrupted publication doesn't count as evidence. Its object files don't block a corrected retry either: when the same revision number is published again with different content, the leftovers are removed, but only after proving no committed release includes that revision. Ordinary edits keep lifecycle, archive and supersession state as they were. A revision keeps its record family and owning module; changing ownership is its own operation, not a relabel slipped into a proposal. Whole-library export and format generation need read access to every module, and restore needs write access to every module too.

Relationship predicates are `supports`, `challenges`, `qualifies`, `depends_on`, `explains`, `exemplifies`, `applies_to` and `derived_from`. A relationship is itself a record, so its rationale can be revised and cited like anything else. There's deliberately no `analogous_to`.

A judgment can find that two accounts cover different scopes, are compatible, that one qualifies the other, that there's a provisional preference, that one interpretation is superseded, or that the question is unresolved. Conflicts stay in the library to reason with. Supersession is a justified revision, never the deletion of the losing source.

## What's on disk

Paths are relative to the library folder, and some only appear after their first use.

```text
corpus.json                         Library identity, modules, domains, project bindings
dimensions.json                     Registered applicability dimensions, when configured
CURRENT                             The current release id
objects/
  <record-id-with-colon-as-underscore>/<revision>/
    record.json                     Canonical structured meaning
    body.md                         Canonical explanatory prose, when present
sources/
  <source-hash-prefix>/1/
    original.<extension>            The original bytes
    registration.json               Registration metadata
    extractions/<job-id>/           Extracted units, locators and page or frame images
releases/
  <release-id>.json                 Revisions in the release, their paths and hashes
  <release-id>.impacts.json         Accounts awaiting reassessment after the release
jobs/<job-id>/                      Requests, staged records, coverage, receipts, note slugs
audit/events/<event-id>.json        Authoritative operation events
audit/events.jsonl                  Derived event stream, appended per event
audit/journal-state.json            Tells the journal when it must be rebuilt
log.md                              Derived readable activity log
lifecycle/ledger-generation.json    Which generation of the deletion ledger matches this library
retrieval-receipts/                 One receipt per recall, read or retrieval call
views/
  receipt.json                      Which views are ready for which release
  <release-id>/
    wiki/_index.md                  Orientation index of active records
    wiki/_topics/<domain-hash>.md   Topic pages: primers, summaries, typed connections
    wiki/_records.md                Every record and piece of evidence
    wiki/<record-id-hash>.md        One generated page per record
    catalogue.json                  Exact identities and navigation summaries
    search/<module-hash>/           Search documents per module
    search-map.json                 Search document to exact record mapping
    file-hashes.json                Integrity hashes for the views
```

Jobs can also hold raw API responses and reservations for paid requests, and publication uses short-lived journal and lock files. Treat this listing as a map: the schemas and the engine define the exact structures. Reindexing clears out the view folders of older releases, except one holding a wiki edit that hasn't been imported yet.

The wiki has full record pages, topic pages and an orientation index, built from authored summaries and existing primers. It never generates summaries on the fly, so a missing summary stays visibly missing. Summary and body search documents point at the same record and never count as two sources. These files contain the whole library, which is why scoped tools filter what they reveal before showing any title, count or membership.

If you want to change a generated page, import the edit with `kb_maintain {action:"wiki_edit"}` and publish it as canonical prose. Rebuilding won't overwrite an edit you haven't imported, and if a later publication has moved on, `wiki_edit` still finds the edit in the older view it was kept in (or the one you name with `view_release`) and tells you which revision it was made against. Topic pages and catalogues can always be rebuilt, and their hashes and release binding stop a same-sized edit from passing as current.

## The recall index

This is the 1.2.0 "reading desk". `kb_recall`, `kb_brief` and `kb_connect` all read from a `LibraryIndex`: one scoped snapshot of a release, held in memory. It contains the usable records and their bodies, a BM25 index over titles, summaries, bodies and passage text, and a map of every link.

Links come from several places: relationship records (weighted by predicate), concept, knowledge, issue and related references, judgment alternatives, record-to-record inputs and passage citations. Every link also knows how it reads in each direction ("builds on" one way, "is a prerequisite for" the other) and carries the relationship's rationale. The snapshot is built once per combination of control signature (binding, deletion ledger, CURRENT), release and scope, then reused for as long as the MCP process lives. It applies the reading rules before anything else sees the data: scope and source restrictions, withdrawal anywhere in a record's exact inputs, archive state and pending reassessment. Reliance is worked out by `blockedIds` in `core.ts`, a fixed-point calculation that progressive reading uses too, so the answer never depends on the order records are visited or on cycles that later revisions create.

### kb_recall

Recall ranks with three channels and fuses them by reciprocal rank (k = 60):

- BM25 keyword search.
- The QMD semantic index, but only when keyword coverage of the query looks weak, or when the caller forces it.
- Personalized PageRank seeded from the best text matches. It spreads along links for many steps, fading as it goes, which is how an account three links away can surface with no words in common with the question.

Purpose, domain, pending reassessment and filed-answer priors nudge the score. Packing then follows rank order inside the budget, costing each account by the block it will actually render as, and the best match always arrives whole. Each packed account brings its baggage with it: the accounts or passages that qualify or challenge it, and its current judgments. Explain and teach also bring conceptual prerequisites and a foundations-first reading order.

Then comes the guard pass, and it's the part that must never be skipped. Recall hands the loaded matches to the same resolver progressive reading uses, `ResearchView.materialContext`. That resolver follows each account's exact premises and returns what has to travel with it: premises with their own conditions, validity limits or pending reassessment, plus qualifications, challenges and current judgments on any of them, including ones published after a pinned release. Each guard is packed if it fits, or named under "Caveats not loaded" if it doesn't, whatever the rank, graph setting or budget. Premises that only repeat a boundary the loaded accounts already show are left out.

Anything that doesn't fit gets listed rather than silently dropped. The optional lists (related accounts, open questions) are trimmed to what the budget has left, and the reported `budget.used` is the whole delivered briefing; a briefing that runs over says so. The briefing is Markdown; the API also returns the item list, each channel's status and the budget, and every call writes a retrieval receipt.

### kb_brief

The brief uses the same snapshot to sketch each domain: its newest primer, and whether any account in the domain was published or revised in a later release (in which case the primer may be stale); the most central accounts by global PageRank; unresolved judgments; open questions ranked by impact and effort; and what recent in-scope ingestion reports say they added.

### kb_connect

Connect searches the same link map. Give it two endpoints and it runs a best-first search over simple paths up to `max_hops` (default 4). Each hop costs according to its link weight, plus a small penalty for passing through a highly connected hub, so chains through specific accounts beat chains through some catch-all idea. It returns the strongest distinct chains, with each hop's direction and rationale. Give it one endpoint and it lists accounts two or more hops out, split into other topics and the same topic, each with its strongest chain. Endpoints can be ids or a few words, which resolve to the best keyword match.

### kb_file

A filed answer goes through the normal proposal compiler and publishes without an ingestion job. Its provenance method is `filed_answer`, its inputs are the exact revisions it cites, and its sources are theirs, so it can never count as an extra source. When any cited revision changes, knowledge impact marks it pending like any other dependent account.

## Progressive reading

`kb_retrieve {mode:"progressive"}` returns orientation candidates, necessary reading and traceable support, and `kb_read` opens catalogues, topics, accounts, batches of up to 12 accounts, sections and material context. The [reading request](../contracts/schemas/reading-request.schema.json) and [response](../contracts/schemas/reading.schema.json) contracts are interface version 1.0.0.

These, along with the packet route (`kb_retrieve` with no mode), stay around for comparison; `kb_recall` is the routine route. Why not progressive reading? A comparison on 4 October 2026 found it cost more than the packet in total, because every extra reading turn resends the whole conversation.

Its rules still matter, though. Qualifications, challenges, conceptual prerequisites and current judgments are resolved from the canonical records, independently of the graph. The engine follows exact inputs to find inherited caveats without loading every supporting body. Keep the two kinds of dependency straight: a record's top-level `depends_on` lists its exact inputs and drives invalidation, while a relationship with predicate `depends_on` states a conceptual prerequisite. Both keep their direction. Sections are bound to the release, the exact revision and the body hash, and a section read is always marked partial.

## Note authoring

`kb_write` parses Markdown notes with YAML frontmatter and builds a proposal for the job. Slugs become local references, saved in `jobs/<job>/slugs.json` so later batches can use them. Cited unit ids become passages copied exactly from the extraction mapping, reusing a passage that already holds the same unit. `links` become relationship records with the note as subject. A `revises` note starts from the current revision of its target and inherits whatever it leaves out. Then the proposal goes through exactly the same validation as `kb_propose`.

## Ingestion and evaluation

Ingestion jobs use workflow version 2. The reweave plan covers explanations, lessons and questions affected by changed inputs, or by new, changed or retired material relationships. A revised or reaffirmed decision needs a staged revision behind it; unresolved or out-of-scope targets stay pending. Decisions are bound to the staged meaning and expire if it changes. The check receipt records what understanding was added, which revisions changed, what's unresolved and which checks were actually run, plus a digest of exactly what was staged. Publication refuses if staging changed after the check (`CHECK_STALE`), and a proposal that arrives after the check sends the job back to it. The ingestion report survives an interrupted publication. Older jobs keep their original workflow, and `coverage_all` marks every remaining unit of the current stage in one go.

Version 3 evaluations freeze the implementation, cases and rubrics, release, scope, model, budgets and conditions. Interactive conditions read through a pinned, read-only MCP reader, and fixed-packet and source-only controls keep their own names. The reader records chosen summaries, opened bodies and sections, graph routes, repeat reads, delivered characters and unmet requirements. Codex-reported input includes repeated context. The input-token ceiling is checked after the run, while tool-call, evidence and time limits are enforced during it. Separate quality dimensions and decisive failures stop a good average from hiding a lost condition. Sending extra source text to a grader needs a per-run authorization naming exact references or hashes. [Operations](../skills/know-fu/references/operations.md) has the details.

## Graph and search storage

FalkorDB holds a generated graph named `kb_` plus the first 24 characters of the SHA-256 of the `corpus_id`. Each record becomes a `Record` node, and dependency and provenance references become `INPUT` edges. A relationship sits as a node between its two ends:

```text
subject Record --SUBJECT_OF--> relationship Record --OBJECT--> object Record
```

The relationship node holds the predicate, but meaning and evidence are always read from the canonical files. A `Projection` node names the release. Rebuilding clears and recreates this library's graph, so editing the database directly is never a way to author anything. Since 1.2.0, answering doesn't need the graph at all. It stays as a view for visual exploration and Cypher queries, and the older retrieval routes use it when it's running.

The original WSL deployment keeps FalkorDB's data under `/var/lib/research-knowledge` in Redis RDB and AOF formats, with service configuration under `/opt/research-knowledge`. Those are database files, not the research record.

QMD keeps a local keyword and vector index over the generated Markdown, grouped by module, in its own storage. Its configuration and model cache live under the state folder (`KB_STATE_DIR`, or the engine's `.runtime/` by default), and its status command reports on the index. All of it can be rebuilt from the library.

The engine also keeps verified canonical files in a bounded cache. Access policy, the deletion ledger, its generation and the release pointer are reread on every request and checked again before anything is returned. A cached file is only reused if its path and filesystem fingerprint still match; a changed file gets reread and checked against its expected hash. So the cache makes repeat reads fast without ever becoming an authority. It does assume an ordinary local filesystem, not an adversary who can fake file identity and every timestamp.

Graph writes go in bounded batches, check node and edge counts, and write the release marker last. Search runs through QMD's SDK in a reusable local worker that closes its database and model handles after each request, exits after 60 seconds idle, and restarts after a timeout or crash. Reindex and purge stop it first. It's an internal process, not a service you install, and no local reasoning model is involved.

## Scope and recovery

One library can hold several maintenance modules and domain tags. Project bindings decide which modules a calling project may read or write. These are checks inside the application, not an operating-system security boundary against someone with direct file access. Cross-domain use stays scoped rather than blending everything into universal advice.

Keep the library together with its deletion ledger, which lives under the state folder's `ledgers/` (by default the engine's `.runtime/ledgers/`). The ledger sits outside the library on purpose: restoring an old library can't quietly bring back knowledge you purged. It blocks whole ids, and also exact historical revisions (`blocked_refs`): when an account was revised to independent material before its source was purged, the current revision stays, and the earlier source-derived revisions are deleted and refused. And the generated wiki, search and graph are not a backup. [Setup](setup.md) covers the rest.

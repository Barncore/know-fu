# Architecture and storage

[Package overview](../README.md) · [Setup](setup.md) · [Schemas](../contracts/README.md)

How Know Fu stores knowledge and how the parts fit. The engine version and the schema version are separate numbers; the bundled [contract manifest](../engine-contracts.json) records both.

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

The AI writes the meaning. The engine checks structure, references, scope, reading coverage, quotes and publication consistency. Those checks don't prove an interpretation is true. The wiki, graph and search index are all generated from the same published records; they are three views of one library, not three readings of the source.

## Records

The [record schema](../contracts/schemas/record.schema.json) gives every record shared metadata plus a payload for its family:

| Family | What it holds |
|---|---|
| `source` | An original source's identity and how it was extracted |
| `passage` | A located piece of a source, including evidence tied to page images or frames |
| `concept` | A definition, its scope and the distinctions that matter |
| `knowledge` | An assertion, explanation, mechanism, procedure or synthesis |
| `relationship` | A typed, reasoned link between exact record revisions |
| `judgment` | A reasoned assessment of competing or overlapping accounts |
| `learning` | A primer, lesson, worked example, near miss, application or teaching sequence |
| `question` | A gap in the library, what it is grounded in, and whether it is resolved |

Shared fields include `id`, `revision`, `corpus_id`, `maintenance_module`, `scope`, `provenance`, `epistemic`, `assessments`, `depends_on`, `supersedes`, `lifecycle`, `archived`, optional `extensions` and an optional `body` path and hash. Full explanations live in `body.md`; metadata never stands in for the prose.

An id plus a revision names an exact meaning at a point in time. A release says which revisions are current. Provenance ties a meaning to its sources and to the records it was built from. Epistemic labels keep a source's own account apart from synthesis, inference, hypothesis, judgment and illustration. The three assessments stay separate too: fidelity (did we read the source right), evidence (how well supported the claim is) and applicability (does it hold in a given context). A faithful account of an author is not automatically a well-supported rule. Each assessment is a level (`low`, `moderate`, `high` or `unknown`, or `not_assessed` when nobody looked) with a rationale and an optional context. An evidence assessment also names its `basis`, the kind of support the source shows, from `review_of_studies` through `bare_assertion` to `our_inference`. `kb_write` refuses a level without a reason, an evidence level without a basis, and `high` from a worked case, a bare assertion or an inference unless at least two independent source families stand behind the note. Recall shows assessed levels on each account's identity line with their reasons, and puts both sides' levels next to each other wherever a challenge link or a judgment joins two accounts; `kb_brief` does the same for live disagreements. Levels never change ranking or pick a winner.

Two optional extensions carry extra structure. `extensions.navigation` holds an authored one-line summary where the record's own fields don't give one. `extensions.citations` holds verbatim quotes from the record's own cited passages; each quote is checked against the passage text when the record is staged and again at publication.

Only CURRENT and the releases it descends from can be read by exact revision. A candidate release left behind by an interrupted publication is not readable evidence. Ordinary edits keep lifecycle, archive and supersession state. A revision keeps its record family and owning module; changing ownership would be its own operation, not a relabel inside a proposal. Whole-library export and format generation need read access to every module, and restore also needs write access to every module.

Relationship predicates are `supports`, `challenges`, `qualifies`, `depends_on`, `explains`, `exemplifies`, `applies_to` and `derived_from`. A relationship is itself a record, so its rationale can be revised and cited. There is no `analogous_to`.

A judgment can find two accounts to be about different scopes, compatible, one qualifying the other, a provisional preference, a superseded interpretation, or unresolved. Conflicts are kept for reasoning. Supersession is a justified revision, never the deletion of the losing source.

## Library files

Paths are relative to the library folder. Some appear only after their first use.

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

Jobs can hold raw API responses and reservations for paid requests. Publication also uses short-lived journal and lock files. This listing is a map; the schemas and the engine define the exact structures. Reindexing removes the view folders of older releases, except one that holds an unimported wiki edit.

The wiki holds full record pages, topic pages and an orientation index, built from authored summaries and existing primers. It never generates summaries on read. A missing summary stays visibly missing. Summary and body search documents map to the same record, so they never count as two sources. These files contain the whole library; scoped tools filter what they reveal before showing titles, counts or memberships.

To change a generated page, import the edit with `kb_maintain {action:"wiki_edit"}` and publish it as canonical prose. Rebuilding refuses to overwrite an unimported edit. Topic pages and catalogues are rebuildable; their hashes and release binding stop a same-sized edit from looking current.

## The recall index

`kb_recall`, `kb_brief` and `kb_connect` read from a `LibraryIndex`: one scoped snapshot of a release holding the usable records, their bodies, a BM25 index over titles, summaries, bodies and passage text, and a map of every link. Links come from relationship records (weighted by predicate), concept, knowledge, issue and related references, judgment alternatives, record-to-record inputs and passage citations. Each link also records how it reads in each direction ("builds on" and "is a prerequisite for") and the relationship's rationale. The snapshot is built once for each combination of control signature (binding, deletion ledger, CURRENT), release and scope, and reused while the MCP process lives. It applies the reading rules: scope and source restrictions, withdrawal anywhere in a record's exact inputs, archive state and pending reassessment.

`kb_recall` ranks with three channels fused by reciprocal rank (k = 60): BM25; the QMD semantic index, run when keyword coverage of the query looks weak or when the caller forces it; and personalized PageRank seeded from the best text matches, which spreads along links for many steps with fading weight. Purpose, domain, pending reassessment and filed-answer priors adjust the score. Packing follows rank order inside the budget. The best match always arrives whole. Each packed account brings the accounts or passages that qualify or challenge it and its current judgments; explain and teach also bring conceptual prerequisites and a foundations-first reading order. What doesn't fit is listed. The briefing is Markdown; the API also returns the item list, each channel's status and the budget, and each call writes a retrieval receipt.

`kb_brief` uses the same snapshot to describe each domain: its newest primer and whether any account in the domain was published or revised in a later release, the most central accounts by global PageRank, unresolved judgments, open questions ranked by impact and effort, and what recent in-scope ingestion reports say they added.

`kb_connect` searches the same link map. With two endpoints it runs a best-first search over simple paths of up to `max_hops` (default 4), costing each hop by its link weight plus a small penalty for passing through highly connected hubs, and returns the strongest distinct chains with each hop's direction and rationale. With one endpoint it lists accounts two or more hops out, split into other topics and the same topic, each with its strongest chain. Endpoints can be ids or a few words, which resolve to the best keyword match.

`kb_file` compiles a filed answer through the normal proposal compiler and publishes it without an ingestion job. Its provenance method is `filed_answer`, its inputs are the exact revisions it cites, and its sources are theirs. When any cited revision changes, knowledge impact marks it pending like any other dependent account.

## Progressive reading

`kb_retrieve {mode:"progressive"}` returns orientation candidates, necessary reading and traceable support, and `kb_read` opens catalogues, topics, accounts, batches of up to 12 accounts, sections and material context. The [reading request](../contracts/schemas/reading-request.schema.json) and [response](../contracts/schemas/reading.schema.json) contracts are interface version 1.0.0. These and the packet route (`kb_retrieve` without a mode) remain for comparison; `kb_recall` is the routine route. A 2026-10-04 comparison found progressive reading cost more than the packet in total, because every extra reading turn resends the conversation.

Qualifications, challenges, conceptual prerequisites and current judgments are resolved from the canonical records, independently of the graph. The engine follows exact inputs to find inherited caveats without loading every supporting body. A record's top-level `depends_on` lists exact inputs and drives invalidation; a relationship with predicate `depends_on` states a conceptual prerequisite. Both keep their direction. Sections are bound to the release, exact revision and body hash, and a section read is always partial.

## Note authoring

`kb_write` parses Markdown notes with YAML frontmatter and builds a proposal for the job. Slugs become local references and are saved in `jobs/<job>/slugs.json` for later batches. Cited unit ids become passages copied exactly from the extraction mapping, reusing a passage that already holds the same unit. `links` become relationship records with the note as subject. A `revises` note starts from the current revision of its target and inherits whatever it omits. The proposal then goes through the same validation as `kb_propose`.

## Ingestion and evaluation

Ingestion jobs use workflow version 2. Their reweave plan covers explanations, lessons and questions affected by changed inputs or by new, changed or retired material relationships. A revised or reaffirmed decision needs a staged revision; unresolved or out-of-scope targets stay pending. Decisions are bound to the staged meaning and expire if it changes. The check receipt records what understanding was added, which revisions changed, what is unresolved and which checks were actually run. The ingestion report survives an interrupted publication. Older jobs keep their original workflow. `coverage_all` marks every remaining unit of the current stage at once.

Version 3 evaluations freeze the implementation, cases and rubrics, release, scope, model, budgets and conditions. Interactive conditions use a pinned, read-only MCP reader; fixed-packet and source-only controls keep their own names. The reader records chosen summaries, opened bodies and sections, graph routes, repeat reads, delivered characters and unmet requirements. Codex-reported input includes repeated context. The input-token ceiling is checked after the run; tool-call, evidence and time limits are enforced during it. Separate quality dimensions and decisive failures stop a good average from hiding a lost condition. Sending extra source text to a grader needs a per-run authorization naming exact references or hashes. See [operations](../skills/know-fu/references/operations.md).

## Graph and search storage

FalkorDB holds a generated graph named `kb_` plus the first 24 characters of the SHA-256 of the `corpus_id`. Each record becomes a `Record` node, and dependency and provenance references become `INPUT` edges. A relationship is a node between its ends:

```text
subject Record --SUBJECT_OF--> relationship Record --OBJECT--> object Record
```

The relationship node holds the predicate; meaning and evidence are always read from the canonical files. A `Projection` node names the release. Rebuilding clears and recreates this library's graph, so editing the database directly is not a way to author anything. Since 1.2.0, answering does not need the graph; it is kept as a view for visual exploration and Cypher queries, and the older retrieval routes use it when it is running.

The original WSL deployment keeps FalkorDB's data under `/var/lib/research-knowledge` in Redis RDB and AOF formats, with service configuration under `/opt/research-knowledge`. These are database files, not the research record.

QMD keeps a local keyword and vector index over generated Markdown grouped by module, in its own storage. Its configuration and model cache live under the state directory (`KB_STATE_DIR`, or the engine's `.runtime/` by default); its status command reports the index. All of it can be rebuilt from the library.

The engine caches verified canonical files in a bounded cache. Access policy, the deletion ledger, its generation and the release pointer are reread on every request and checked again before returning. A cached file is reused only if its path and filesystem fingerprint still match; a changed file is reread and checked against its expected hash. The cache speeds repeat reads without becoming an authority. It assumes an ordinary local filesystem, not an adversary able to fake file identity and every timestamp.

Graph writes go in bounded batches, check node and edge counts, and write the release marker last. Search uses QMD's SDK in a reusable local worker that closes its database and model handles after each request, exits after 60 seconds idle, and restarts after a timeout or crash. Reindex and purge stop it first. It is an internal process, not a service to install, and no local reasoning model is involved.

## Scope and recovery

One library can have several maintenance modules and domain tags. Project bindings decide which modules a calling project may read or write. These are application checks, not an operating-system security boundary against someone with direct file access. Cross-domain use stays scoped instead of merging everything into universal advice.

Keep the library together with its deletion ledger, which lives under the state directory's `ledgers/` (by default the engine's `.runtime/ledgers/`). The ledger sits outside the library on purpose, so restoring an old library cannot quietly bring back purged knowledge. The generated wiki, search and graph are not a backup. See [setup](setup.md).

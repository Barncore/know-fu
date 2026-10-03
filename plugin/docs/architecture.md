# Architecture and storage contract

[Package overview](../README.md) · [Setup](setup.md) · [Schemas](../contracts/README.md)

This describes the implemented storage model. Engine version and schema version are separate; the bundled [contract manifest](../engine-contracts.json) records both.

## Ownership and flow

```text
Book / PDF / video / other source
  -> immutable original + versioned extraction with locators
  -> AI reads text and visuals, reconstructs reasoning, integrates and reviews
  -> engine validates and publishes canonical JSON records + Markdown bodies
       -> generated readable wiki
       -> FalkorDB relationship projection
       -> QMD keyword/vector search projection
  -> scoped retrieval + exact source reads
  -> teaching, application, hypotheses, corrections and further questions
```

The AI authors meaning. The engine checks structure, references, scope, reading coverage and publication consistency. These checks do not prove that an interpretation is true. Wiki, graph and search derive from the same published records; they are not three independent AI interpretations of the source.

## What a record contains

The [record schema](../contracts/schemas/record.schema.json) combines common metadata with a payload for its record family:

| Family | Purpose |
|---|---|
| `source` | Original source identity and extraction provenance |
| `passage` | Located source content, including evidence associated with visual assets |
| `concept` | A definition with its scope and relevant distinctions |
| `knowledge` | Assertion, explanation, mechanism, procedure or synthesis |
| `relationship` | A qualified, evidenced connection between exact record revisions |
| `judgment` | A reasoned assessment of competing or overlapping knowledge |
| `learning` | Primer, lesson, worked example, near miss, application or teaching sequence |
| `question` | A knowledge gap, its grounding and resolution state |

Common fields include `id`, `revision`, `corpus_id`, `maintenance_module`, `scope`, `provenance`, `epistemic`, `assessments`, `depends_on`, `supersedes`, `lifecycle`, `archived`, and an optional `body` path/hash. Full explanations live in `body.md`; metadata does not replace the prose.

An ID and revision identify an exact meaning at a point in time. A release selects the current set of revisions. Provenance links that meaning to sources and earlier records. Source accounts, synthesis, inference, hypotheses and judgments carry different epistemic labels. Fidelity, evidence and applicability assessments remain separate: a faithful report of an author is not automatically a well-supported general rule.

Only CURRENT and its committed ancestry authorize exact-revision reads. An orphaned candidate release from an interrupted publication is not readable evidence. Ordinary semantic edits preserve lifecycle/archive/supersession state. A revision retains its record family and maintenance owner; changing ownership requires a separately designed operation, not relabeling an existing identity in a proposal. Whole-library exports and format generation require unrestricted corpus-wide read authority; restore also requires corpus-wide write authority.

Relationship predicates are `supports`, `challenges`, `qualifies`, `depends_on`, `explains`, `exemplifies`, `applies_to` and `derived_from`. A relationship is itself a record, so its rationale and qualifications can be revised and cited. There is no `analogous_to` relation.

Judgments can identify different scope, compatibility, qualification, provisional preference, superseded interpretation or an unresolved issue. Conflicts are preserved for reasoning; supersession is a justified revision, not automatic deletion of the losing source.

## Corpus files

Paths below are relative to the configured corpus. Some appear only after their first operation.

```text
corpus.json                         Library identity, modules, domains, project bindings
dimensions.json                     Registered applicability dimensions, when configured
CURRENT                             Current published release ID
objects/
  <record-id-with-colon-as-underscore>/<revision>/
    record.json                     Canonical structured meaning
    body.md                         Canonical explanatory prose, when present
sources/
  <source-hash-prefix>/1/
    original.<extension>            Preserved input bytes
    registration.json               Source registration metadata
    extractions/<job-id>/           Versioned extracted units, locators and assets
releases/
  <release-id>.json                 Revision references, paths and integrity hashes
  <release-id>.impacts.json         Affected knowledge requiring reassessment
jobs/<job-id>/                      Requests, proposals, reading coverage, resumable work
audit/events/<event-id>.json         Authoritative operation events
audit/events.jsonl                  Derived event stream
log.md                              Derived readable activity log
lifecycle/ledger-generation.json    Link to the independent deletion ledger generation
views/
  receipt.json                      Which projections are ready for which release
  <release-id>/
    wiki/_index.md                  Active, unarchived record navigation
    wiki/_topics/<domain-hash>.md    Summarized topic accounts, primers and typed connections
    wiki/_records.md                Full record/evidence directory
    wiki/<record-id-hash>.md         Generated record pages
    catalogue.json                  Exact identities and authored navigation summaries
    search/<module-hash>/            Generated module-scoped search documents
    search-map.json                 Search document -> exact record/source mapping
    file-hashes.json                Projection integrity information
```

Jobs can contain raw API responses and paid-request reservations. Publication also uses transient journal/lock files. This diagram is a navigation guide; the schemas and engine define the exact structures.

The wiki materializes complete record pages, topic indexes and an orientation index. It uses authored summaries and existing learning primers; it does not invent a textbook hierarchy or generate model summaries on each read. Optional `extensions.navigation` version 1.0.0 supplies an authored summary where existing fields are insufficient. A missing summary is explicit. Summary and body search documents map to the same exact record identity, not separate corroborating sources. These owner-level files contain the corpus; scoped tools filter visibility before exposing metadata, memberships or counts.

Editing a generated account page requires importing that edit through `wiki_edit` and publishing it as canonical prose. Rebuilding detects unimported body changes. Topic indexes and catalogues are rebuildable navigation. Their integrity hashes and release binding prevent a same-count edit from appearing fresh.

## Progressive reading

`kb_retrieve {mode:"progressive",query,purpose}` returns orientation candidates, necessary reading and traceable supporting refs. `kb_read` opens a catalogue, topic, complete account, batch of up to 12 accounts, stable sections or material context. The [reading request](../contracts/schemas/reading-request.schema.json) and [response](../contracts/schemas/reading.schema.json) contracts have interface version 1.0.0. Existing exact full-record reads and `mode:"packet"` remain available.

Packet retrieval remains the API default for routine answers. Progressive reading is available for navigation and selected reading, but the controlled small-library comparison did not meet the preset efficiency/completeness criteria for default adoption. Fewer delivered bodies do not necessarily mean less cumulative model input: each reading turn can resend previous context. The workflow keeps that distinction explicit.

Known qualifications, challenges, conceptual prerequisites and current judgments are resolved from canonical records independently of optional graph exploration. The engine traces exact input metadata to find inherited caveats without automatically loading every supporting body. Top-level `depends_on` binds inputs and invalidation; a relationship with predicate `depends_on` expresses a conceptual prerequisite. Both retain their direction and provenance.

Each account read carries scope, applicability, freshness and material context. Sections bind release, exact revision and body hash; section reads remain partial. Pagination, unavailable context and required reads remain explicit. A successful tool call establishes delivered content, not complete understanding. The [retrieval workflow](../skills/know-fu/references/retrieval.md) describes purpose-specific decisions and stopping criteria.

## Cumulative ingestion and evaluation

New ingestion jobs use workflow version 2. Their reweave plan includes dependent explanations, teaching and questions affected by changed inputs or material relationships. A revised or reaffirmed decision requires a staged canonical revision; unresolved or out-of-scope targets remain pending. Decisions are bound to staged meaning and expire if that meaning changes. Check receipts record added understanding, revised refs, unresolved issues and actual capability checks. The ingestion report is recoverable after a committed publication. Legacy jobs retain their original workflow contract.

Version 3 evaluation freezes implementation, case/rubric material, release, scope, model, budgets and conditions. Interactive conditions use a pinned read-only MCP reader; fixed-packet and original-passage controls retain distinct names. The reader records chosen summaries, inspected bodies/sections, graph routes, repeated reads, delivered characters and unmet requirements. Codex-reported cumulative usage includes repeated context. The input-token ceiling is measured after completion, while tool-call, evidence and wall-time limits are enforced during execution. Separate quality dimensions and decisive failures prevent a favorable average from hiding a lost condition. Additional grader source payloads require an explicit per-run authorization bound to exact refs or hashes. See [operations](../skills/know-fu/references/operations.md) for the boundaries.

## Database and search layout

FalkorDB stores a derived graph named `kb_` plus the first 24 characters of the SHA-256 of `corpus_id`. Each selected record becomes a `Record` node. Dependency/provenance references become `INPUT` edges. A relationship is represented as:

```text
subject Record --SUBJECT_OF--> relationship Record --OBJECT--> object Record
```

The relationship node holds the predicate; exact meaning and evidence are read from canonical files. A `Projection` node identifies the release. Graph rebuilding clears and recreates this corpus's projection, so direct database edits are not a supported authoring route.

The current WSL deployment stores FalkorDB persistence under `/var/lib/research-knowledge` using Redis RDB/AOF formats. These are database-managed files, not Markdown or the authoritative research record. Service configuration is under `/opt/research-knowledge`.

QMD maintains the local keyword/vector index, using generated Markdown grouped by maintenance module. It has its own internal search storage; it does not replace FalkorDB with a SQLite research graph. QMD configuration/model-cache directories are selected under the configured state directory (`KB_STATE_DIR`, default engine `.runtime/`); its status command reports its index details. Generated projections can be rebuilt from the canonical corpus.

The engine reuses verified canonical file contents in a bounded cache. It rereads access policy, the deletion ledger, generation and release pointer for each request and checks them again before returning. A canonical file's path and metadata fingerprint are rechecked before reusing its verified bytes; changed files are reread and checked against their expected hash. This speeds repeated reads without making the cache an authority. It assumes ordinary local filesystem semantics, not an adversary able to falsify file identity and every timestamp.

Graph writes use bounded batches, validate record/edge counts and write the release marker last. Search uses QMD's official SDK in a reusable local worker. The worker closes its database and model handles after each request, stops after 60 seconds idle and restarts after a timeout or crash. Reindex and purge stop it first. This is an internal process, not an additional service to install. CPU embedding and semantic lookup still have their own costs; no local reasoning model is added.

## Scope and recovery

One corpus can have multiple maintenance modules and domain tags. Project bindings restrict the modules a calling project can read or write. These are application checks, not an OS security boundary against someone with direct filesystem access. Cross-domain use remains scoped rather than merging all sources into unqualified universal advice.

Keep the corpus and the matching independent deletion ledger under the configured state directory's `ledgers/` (legacy default: engine `.runtime/ledgers/`). The latter is deliberately outside the corpus so restoring an old corpus cannot silently restore purged knowledge. Generated wiki/search/graph data alone are not a complete backup. See [setup and recovery](setup.md).

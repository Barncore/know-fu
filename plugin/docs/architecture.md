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
    wiki/<record-id-hash>.md         Generated record pages
    search/<module-hash>/            Generated module-scoped search documents
    search-map.json                 Search document -> exact record/source mapping
    file-hashes.json                Projection integrity information
```

Jobs can contain raw API responses and paid-request reservations. Publication also uses transient journal/lock files. This diagram is a navigation guide; the schemas and engine define the exact structures.

The wiki currently materializes record pages, including authored synthesis and learning records. It does not invent a separate textbook hierarchy automatically. Its filenames are stable hashes; `_index.md` supplies readable titles. Editing a generated page requires importing that edit through `wiki_edit` and publishing it as canonical prose. Rebuilding detects unimported changes.

## Database and search layout

FalkorDB stores a derived graph named `kb_` plus the first 24 characters of the SHA-256 of `corpus_id`. Each selected record becomes a `Record` node. Dependency/provenance references become `INPUT` edges. A relationship is represented as:

```text
subject Record --SUBJECT_OF--> relationship Record --OBJECT--> object Record
```

The relationship node holds the predicate; exact meaning and evidence are read from canonical files. A `Projection` node identifies the release. Graph rebuilding clears and recreates this corpus's projection, so direct database edits are not a supported authoring route.

The current WSL deployment stores FalkorDB persistence under `/var/lib/research-knowledge` using Redis RDB/AOF formats. These are database-managed files, not Markdown or the authoritative research record. Service configuration is under `/opt/research-knowledge`.

QMD maintains the local keyword/vector index, using generated Markdown grouped by maintenance module. It has its own internal search storage; it does not replace FalkorDB with a SQLite research graph. QMD configuration/model-cache directories are selected under the configured state directory (`KB_STATE_DIR`, default engine `.runtime/`); its status command reports its index details. Generated projections can be rebuilt from the canonical corpus.

## Scope and recovery

One corpus can have multiple maintenance modules and domain tags. Project bindings restrict the modules a calling project can read or write. These are application checks, not an OS security boundary against someone with direct filesystem access. Cross-domain use remains scoped rather than merging all sources into unqualified universal advice.

Keep the corpus and the matching independent deletion ledger under the configured state directory's `ledgers/` (legacy default: engine `.runtime/ledgers/`). The latter is deliberately outside the corpus so restoring an old corpus cannot silently restore purged knowledge. Generated wiki/search/graph data alone are not a complete backup. See [setup and recovery](setup.md).

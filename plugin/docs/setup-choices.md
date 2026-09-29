# Setup decisions: requirements versus preferences

This records why the original installation took its particular shape and where another user can safely choose differently. **Implemented** means the code has that interface; **deployment unverified** means that environment still needs its own acceptance checks. Alternatives must retain source provenance, scope, review and publication contracts.

| Decision | Original reason/choice | Options and current support |
|---|---|---|
| Reasoning harness | Codex desktop and its signed-in model | Codex is the tested adapter. MCP/CLI make another harness feasible, but corpus integration and evaluation currently identify Codex. Another harness is a compatibility task; shared concurrent writers remain deferred |
| Engine language | TypeScript/Node matched local tooling and MCP/client libraries | Implementation dependency. Rewriting in another language is not a setup preference |
| Graph database | Regular FalkorDB, influenced by ste-bah's recommendation and rejection of a limited SQLite research-graph fallback | Keep FalkorDB for this release. Other graph databases need a real adapter and equivalent behavior, not a name substitution |
| Graph deployment | Ubuntu WSL2 preferred over Docker by the original owner | Original managed WSL service, or `falkordb-external` for an already configured Docker/native/other server. External mode never invokes the WSL start helper. Docker provisioning is deployment-unverified here |
| Graph persistence location | Original service chose `/var/lib/research-knowledge` | Ask first. A Docker named volume or explicit bind mount, or an administrator-selected Linux data directory, can work. That location belongs to server configuration, not `KB_CORPUS`. Customizing the legacy WSL installer's fixed path requires updating its service/config consistently |
| Knowledge library location | A sibling folder near the development workspace | User-selected absolute `KB_CORPUS`; recommended: a backed-up SSD data folder such as Documents/KnowFu/library or a chosen larger drive. Keep outside the code checkout and ordinary live-sync folders |
| Runtime state and deletion ledger | Initially engine `.runtime/` | User-selected `KB_STATE_DIR`; recommended Windows `%LOCALAPPDATA%/KnowFu/state`, macOS `~/Library/Application Support/KnowFu/state`, Linux `~/.local/state/know-fu`. Ledger must be backed up with the library's recovery plan; it is not expendable cache. Existing installs retain `.runtime/` if no override is set |
| Search | QMD CPU keyword/vector search fitted a 32 GB machine with no discrete GPU | Implemented QMD path. It currently forces CPU. GPU acceleration, another index or hosted embeddings requires a tested configuration/code change; do not promise a toggle that does not exist |
| Reranking | Slow CPU measurement led to reranking being off by default | Optional `rerank:true`; evaluate latency/quality on the user's hardware. Reasoning still happens in the harness |
| Transcription | Hosted APIs chosen because long local transcription was too slow for the original owner's needs | Existing API adapter accepts configured compatible HTTPS decoders. Local transcription is a valid preference: ingest externally generated TXT/SRT/VTT now; integrated local audio/video decoding requires an adapter. Never present a transcript-only ingest as verified video/visual ingestion |
| Decoder count | Two complementary API decoders for wording and timing/comparison | Configurable `models[]`; one or more are accepted. Fewer decoders reduce cost but remove independent comparison; preserve this limitation. No fixed count proves accuracy |
| Provider/cost | Explicit per-job allowance, credentials in environment, uncertain requests not blindly retried | Provider/model/price are configurable. Check current endpoint/format support and price before spending. A harness subscription is not a speech-API allowance |
| Media utilities | FFmpeg/FFprobe in Ubuntu already available | `KB_MEDIA_RUNTIME=wsl` with `KB_WSL_DISTRO`, or `native` for executables on PATH. Native Windows routing has contract tests; each actual binary installation needs a probe |
| PDF/EPUB conversion | Docling plus direct readers, visual checks and stable locators | Existing conversion adapters. A replacement parser/OCR tool must preserve coverage, original bytes, page/asset locators and uncertainty; it is adapter work |
| Hardware | Windows 11, Ryzen-class desktop CPU, 32 GB RAM, integrated GPU | This motivated defaults, not a minimum specification or performance guarantee. Test representative sources; large corpus/media volumes change time/storage needs |
| Library scope | One modular research corpus with explicit project/module/domain boundaries | Choose domains and project bindings at setup. Separate corpora are possible with unique IDs and their own recovery ledgers. Promotion tiers and operational memory are not setup defaults |
| Knowledge ownership | Canonical immutable revisions plus full explanatory prose; graph/search/wiki derived | Architectural invariant. Do not make a copied wiki or database an independent competing writer |
| Contradictions | Qualified judgments and scoped supersession, preserving evidence | Architectural invariant. Do not replace it with newest-wins or an unexplained scalar confidence score |
| Evaluation | Source-grounded regressions plus independent application checks | User-selected model and material; isolated Codex runner needs verified access restrictions. Other harness evaluators need their own isolation evidence |
| Retention | Archive, withdrawal and explicitly authorized purge | Choose backup/retention policy. Originals are preserved until authorized purge; backups and external provider copies require their own handling |

## Recommended storage conversation

Before creating anything, show actual resolved paths for **(1) code, (2) canonical library, (3) runtime state/ledger, (4) graph persistence, (5) backups**. Ask the user to accept or edit them together. If they have a large SSD/data drive, favor it for original media. Explain that graph and search are rebuildable while original sources, canonical records and deletion history need preservation.

For a small single-user install, prefer a local disk and one writer. Keep active database files out of OneDrive/Dropbox-style live synchronization; use the backup/export workflow instead. This is a consistency recommendation, not a ban on placing backup archives in synced storage.

Changing `KB_STATE_DIR` on an existing installation does not move its ledger or config. Moving a library/state store is a reviewed migration with backups and validation, not a fresh-init shortcut. Never create an empty ledger to bypass missing deletion history.

## Docker/native server selection

The engine connects through a FalkorDB host/port and password file. Set `deployment: "falkordb-external"` and `graph.auto_start: false`; see [the example](../examples/runtime.external.example.json). Provision the service separately using the [official FalkorDB instructions](https://github.com/FalkorDB/FalkorDB), select a compatible pinned image/version, a persistent data volume and a loopback port mapping. Confirm the image's actual internal persistence path before configuring the volume. Do not expose an unauthenticated database to the network.

The repository's legacy WSL installer is specifically for its original managed service. Choosing Docker does not mean running that script inside a container. Docker/native deployment has not been installed or restart-tested as part of this release; test persistence, authentication and graph rebuild on the selected service.

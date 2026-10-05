# Setup choices: what's required and what's just preference

The original installation looks the way it does for reasons, and most of those reasons belonged to one person's machine. This page says why each choice was made and where you can safely choose differently. "Implemented" means the code supports it. "Unverified" means that environment still needs its own acceptance checks. Whatever you pick has to keep source provenance, scope, review and publication working; those aren't negotiable.

| Decision | Original choice and why | Your options |
|---|---|---|
| Coding agent | Codex desktop and its signed-in model | Codex is the tested adapter. Anything that speaks MCP or can run the CLI can work, but library bindings and evaluation currently assume Codex, so another agent means compatibility work. Several agents writing to one library is a decision for later |
| Engine language | TypeScript on Node, matching the local tooling and the MCP and graph client libraries | Fixed. A rewrite in another language isn't a setup option |
| Graph database | Regular FalkorDB, on ste-bah's recommendation, after a limited SQLite graph fallback was rejected | FalkorDB stays. Since 1.2.0 it's an optional view: `kb_recall`, `kb_brief` and `kb_connect` follow links in process and work without it, and the older packet and progressive routes use it when it's running. Another graph database would need a real adapter, not a name change |
| Graph deployment | Ubuntu WSL2, which the original owner preferred over Docker | The managed WSL service, or `falkordb-external` for a Docker, native or other server you run. External mode never calls the WSL start helper. Docker setup is unverified here |
| Graph data location | `/var/lib/research-knowledge` on the original service | Ask first. A Docker named volume, a bind mount or an admin-chosen Linux data folder all work. This belongs to the server's configuration, not `KB_CORPUS`. Changing the legacy WSL installer's fixed path means updating its service and config together |
| Library location | A folder next to the development workspace | Any absolute `KB_CORPUS`. A good default is a backed-up SSD data folder such as `Documents/KnowFu/library`, or a bigger drive. Keep it outside the code checkout and outside live-sync folders |
| Runtime state and deletion ledger | The engine's `.runtime/` folder at first | Any `KB_STATE_DIR`. Good defaults: `%LOCALAPPDATA%/KnowFu/state` on Windows, `~/Library/Application Support/KnowFu/state` on macOS, `~/.local/state/know-fu` on Linux. Back up the ledger with the library, because it isn't a cache. Installs with no override keep using `.runtime/` |
| Search | QMD keyword and vector search on the CPU, which fits a 32 GB machine with no discrete GPU | QMD as implemented, forced to the CPU. GPU acceleration, another index or hosted embeddings would each need a tested code change; there's no switch for them |
| Reranking | Off by default, after slow CPU measurements | Optional `rerank:true`. Measure latency and quality on your own hardware. All the reasoning still happens in the agent |
| Transcription | Hosted APIs, because long local transcription was too slow for the original owner | The API adapter accepts any compatible HTTPS decoder you configure. Preferring local transcription is fine: today you'd ingest TXT, SRT or VTT transcripts made elsewhere, and integrated local audio and video decoding needs an adapter. A transcript-only ingest never counts as verified video or visual ingestion |
| Number of decoders | Two API decoders, one for wording and one for timing and comparison | `models[]` takes one or more. Fewer decoders cost less but lose the independent comparison, so record that limit. No number of decoders proves accuracy |
| Provider and cost | A spending allowance per job, keys in environment variables, uncertain requests never blindly retried | Provider, model and price are all configurable. Check current endpoints, formats and prices before spending. An agent subscription isn't a speech-API budget |
| Media tools | FFmpeg and FFprobe inside Ubuntu, already installed | `KB_MEDIA_RUNTIME=wsl` with `KB_WSL_DISTRO`, or `native` for tools on PATH. Native Windows routing has contract tests; each real installation still needs a probe |
| PDF and EPUB conversion | Poppler and Docling with direct readers, visual checks and stable locators | The existing converters. A replacement parser or OCR tool is adapter work, and it has to keep coverage, original bytes, page and asset locators, and stated uncertainty |
| Hardware | Windows 11, a Ryzen desktop CPU, 32 GB RAM, integrated graphics | These shaped the defaults. They aren't a minimum or a performance promise. Test with representative sources, because big libraries and lots of media change both time and storage needs |
| Library scope | One modular research library with explicit project, module and domain boundaries | Choose domains and bindings at setup. Separate libraries are possible, each with a unique id and its own deletion ledger. Promotion tiers and operational memory aren't defaults |
| Who owns meaning | Immutable canonical revisions plus full prose; graph, search and wiki are generated | Fixed. Never make a copied wiki or database a second writer |
| Contradictions | Judgments and scoped supersession that keep the evidence | Fixed. Never swap them for "newest wins" or a bare, unexplained confidence number |
| Evaluation | Source-grounded regression checks plus independent application checks | Your model and material. The isolated Codex runner needs its access restrictions verified, and another agent's evaluator needs its own isolation evidence |
| Retention | Archive, withdrawal and explicitly authorized purge | Choose a backup and retention policy. Originals are kept until an authorized purge; backups and copies held by external providers need their own handling |

## The storage conversation

This is the conversation to have before creating anything. Show the real resolved paths for five things together: the code, the library, the runtime state and ledger, the graph data, and backups. Let the person accept or edit them in one go. If they have a large SSD or data drive, original media should live there. Explain the one distinction that matters most: the graph and the search index can be rebuilt, but originals, canonical records and deletion history can't.

For a small single-user install, use a local disk and one writer. Keep live database files out of OneDrive or Dropbox-style sync, and use the export workflow for backups instead. Putting backup archives in synced storage is fine.

Changing `KB_STATE_DIR` on an existing install doesn't move its ledger or config. Moving a library or state folder is a migration: back it up and validate it, and never treat it as a fresh `init`. Never create an empty ledger to get past missing deletion history.

## Running FalkorDB in Docker or natively

The engine just needs a FalkorDB host and port, plus a password file. Set `deployment: "falkordb-external"` and `graph.auto_start: false`; see [the example](../examples/runtime.external.example.json). Set up the server separately with the [official FalkorDB instructions](https://github.com/FalkorDB/FalkorDB): a pinned compatible image or version, a persistent data volume, and a port mapped to loopback only. Check where the image actually keeps its data before configuring the volume, and never expose an unauthenticated database to the network.

The repository's WSL installer is only for its original managed service; choosing Docker doesn't mean running that script in a container. Docker and native deployments haven't been installed or restart-tested in this release, so test persistence, authentication and a graph rebuild on whichever one you pick.

# Setup, configuration and portability

[Package overview](../README.md) · [Ask your AI to set it up](setup-ai.md) · [Options and their tradeoffs](setup-choices.md)

## Decide before running anything

The engine lives in the repository; the plugin folder on its own is not enough. Read the [decision matrix](setup-choices.md) and settle the storage locations, the graph deployment, the media tools and the transcription route first. The original Windows and Ubuntu installation is one tested setup, not a requirement.

The engine already supports a different state or library folder, a FalkorDB server you run yourself, and FFmpeg either native or inside a chosen WSL distribution. Docker and fully native installs still need their own live checks. Local speech decoding and adapters for agents other than Codex are not a matter of changing a setting; they need code.

## Dependencies

- Node 24.14.x. Exact package versions and integrity hashes are in `package-lock.json`. The build generates schema types and applies a version-guarded patch to the official FalkorDB client.
- Regular FalkorDB. The original deployment ran server 4.20.7 with Redis 8.0.5. A Docker or native server should use a reviewed compatible version, a password, persistent storage and a loopback connection by default. Since 1.2.0, `kb_recall`, `kb_brief` and `kb_connect` work without it.
- QMD, installed with the Node dependencies, plus its model files for vector search. Search is forced onto the CPU; reranking is optional and can be slow. Model and native-module downloads are separate from the source code.
- Python 3.12 with `requirements.lock.txt` for document and image conversion; the original was 3.12.14. CPU PyTorch wheels may need their CPU package index. A pip lock does not install operating-system libraries or guarantee wheels on every platform.
- Poppler `pdftotext` for every PDF profile, on PATH or set with the runtime `pdftotext` key or `KB_PDFTOTEXT`. Technical PDFs get both Poppler and Docling by default; `pdf_profile:"prose"` skips Docling and `"ocr"` forces full-page OCR. Every profile keeps the original page images. SVG previews in EPUBs use the pinned `@resvg/resvg-js`; other image previews use Pillow. Original asset bytes are always kept.
- FFmpeg and FFprobe for media, native or through WSL. Speech API keys are only needed for hosted transcription.

Run the `package.json` scripts from the repository root. Building and testing do not create the database service, download every optional model or initialize a real library. There is no automated clean-machine bootstrap yet.

## Where configuration lives

| Location | What it holds |
|---|---|
| `plugin/.mcp.json` | The generated machine-local launcher: Node, engine path, library, state, media mode and optional project identity. Ignored by Git |
| `<state>/config.json` | The Python executable, the FalkorDB endpoint and password-file reference, optional speech and evaluation settings |
| `<corpus>/corpus.json` | Library identity, domains and modules, and allowed projects. Created by `init` |
| `<corpus>/dimensions.json` | Applicability dimensions and their units |
| `<state>/ledgers/` | The deletion history. Back it up and keep it with the library |
| The server's own volume or folder | FalkorDB's data, separate from the library and the engine state |

`KB_STATE_DIR` chooses `<state>`; without it the engine uses its own `.runtime/` folder. `KB_CORPUS` chooses `<corpus>`. Neither variable moves an existing installation's data. `kb_status` reports the engine, state and library locations.

## Graph setups

The managed WSL setup uses the [runtime example](../examples/runtime.example.json) with `deployment: "ubuntu-wsl2-direct"`. The legacy setup and service scripts assume Ubuntu, port 6387, `/opt/research-knowledge` and `/var/lib/research-knowledge`. `scripts/setup-wsl.sh` downloads and checks the pinned module, writes the service configuration and starts it; it expects Redis, its system account, curl and Python to be installed already. Read it before running it as root. To use a different data folder, change the related service and config paths together. `auto_start` starts an existing installation; it does not create one.

A server you manage yourself uses the [external runtime example](../examples/runtime.external.example.json) with `deployment: "falkordb-external"` and `graph.auto_start: false`. Docker, native Linux or an existing FalkorDB service can provide the endpoint; set it up with the [official instructions](https://github.com/FalkorDB/FalkorDB), with persistent storage and a password. In this mode the engine never starts the WSL service. Remote access is advanced: use authenticated, encrypted transport and network restrictions. `graph.tls` exists but has not been tested live.

The password file, readable from Windows, holds the server's password. Never commit it. Database data and service configuration belong to the deployment, not the library.

## Library and launcher

Adapt [corpus.example.json](../examples/corpus.example.json) with a unique library ID, your domains and modules, and the exact allowed project path. The library ID selects graph and search namespaces and the deletion history, so different libraries need different IDs.

From the engine folder, with the chosen state folder exported in `KB_STATE_DIR`:

```powershell
node dist/cli.js init --corpus 'C:/KnowFuData/library' --project 'C:/Research' --input 'corpus.local.json'
node dist/cli.js kb_status --corpus 'C:/KnowFuData/library' --project 'C:/Research' --input 'status.local.json'
```

The paths are examples. `corpus.local.json` is your adapted configuration and `status.local.json` contains `{}`. `init` creates the ledger and audit state the library needs; copying a corpus JSON by hand does not. A restore uses the matching existing ledger, never a fresh init.

Run `node scripts/configure-plugin.mjs --help`, then pass the chosen absolute library and state paths and `--media native` or `--media wsl` (with `--distro` for WSL). It writes a local `.mcp.json` without moving data or installing services, and refuses to overwrite an existing one.

`KB_MEDIA_RUNTIME` chooses where media tools run and `KB_WSL_DISTRO` which distribution. Neither redirects the legacy graph service helper; with a custom graph distribution or service, use external-server mode unless you adapt the helper on purpose.

`KB_PROJECT` sets the calling project's identity; without it the working directory is used, and it must match a binding. Never borrow another project's identity to get past a scope error. After `init`, authorized module, domain and binding changes go through `kb_maintain configure`, described in [operations](../skills/know-fu/references/operations.md).

`node scripts/install-plugin.mjs` copies the configured plugin to the local plugin-source folder. It does not register a marketplace or install anything else. Use Codex's supported local plugin registration or reinstall flow for the installed version, restart the chat and check that the MCP server is really discovered. A generic [MCP example](../examples/mcp.example.json) is included for reference.

## Transcription and evaluation

Text, PDF and EPUB need no speech API keys. For hosted audio and video transcription, add the `transcription` object from [the example](../examples/transcription.example.json), set the API-key environment variables for the server process and authorize a per-job allowance. Check current provider support and prices. `media_plan` estimates the requests without uploading anything; the reservation does not guarantee the provider's final bill.

A local transcriber can already produce TXT, SRT or VTT for ingestion. Those are treated as text sources: their timestamps are not verified media locators, and the visuals stay outside a transcript-only ingest. A real local decoder integration would need to keep media mappings, raw decoder output, coverage and uncertainty, so it is not a drop-in setting.

Evaluation needs a configured `codex_executable`, a normal sign-in and a verified isolation receipt. Its model calls and speech charges are billed separately. Confirm that private material is allowed to go where the evaluation sends it.

## Backup and checks

Back up the library together with its matching deletion ledger. The graph, the QMD index and the wiki can be rebuilt, but active jobs may hold receipts for paid requests, so keep those too. A missing or stale ledger blocks a restored library from serving, rather than quietly bringing purged material back.

Check a throwaway ingestion, exact source reads, publication, all three views, recall, a service restart, and backup and restore on the chosen deployment. Unit tests do not prove a fresh machine or a real source works. Keep the local setup record outside Git, and update the change log and docs when a setup change affects supported behavior.

Keep the bundled schema copies in step with the engine:

```powershell
node scripts/package-plugin.mjs
node scripts/package-plugin.mjs --check
```

The check compares the copied schema and config bytes, validates the corpus example and checks relative Markdown links. The private library, state, credentials and `.mcp.json` stay out of the release.

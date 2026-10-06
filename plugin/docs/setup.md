# Setup, configuration and portability

[Package overview](../README.md) · [Ask your AI to set it up](setup-ai.md) · [Options and their trade-offs](setup-choices.md)

## Decide before you run anything

The engine lives in the repository, so the plugin folder on its own won't get you far. Read the [decision matrix](setup-choices.md) first and settle four things: where storage goes, how the graph runs, which media tools you'll use, and how transcription happens. The original Windows and Ubuntu installation is one setup that's been tested, not a requirement.

Some alternatives already work: a different state or library folder, a FalkorDB server you run yourself, and FFmpeg either native or inside a WSL distribution of your choice. Docker and fully native installs still need their own live checks before anyone should trust them. Local speech decoding isn't a setting you flip; it needs code.

Two agents are supported from the same `plugin/` folder: Codex reads `plugin/.codex-plugin/plugin.json`, and Claude Code reads `plugin/.claude-plugin/plugin.json`. They share the skill and its guides, and each one tells the engine its name (`KB_ACTOR`), so every record says which agent wrote it. Only Codex runs the isolated evaluation bench.

## Dependencies

- Node 24.14.x. Exact package versions and integrity hashes are in `package-lock.json`. The build generates schema types and applies a version-guarded patch to the official FalkorDB client.
- Regular FalkorDB. The original deployment ran server 4.20.7 with Redis 8.0.5. A Docker or native server should use a reviewed compatible version, a password, persistent storage and a loopback connection by default. Since 1.2.0 it's optional for answering: `kb_recall`, `kb_brief` and `kb_connect` all work without it.
- QMD, installed with the Node dependencies, plus its model files for vector search. Search is forced onto the CPU, and reranking is optional and can be slow. Model and native-module downloads come separately from the source code.
- Python 3.12 with `requirements.lock.txt` for document and image conversion (the original was 3.12.14). CPU PyTorch wheels may need their CPU package index. A pip lock won't install operating-system libraries, and it can't promise wheels exist for every platform.
- Poppler `pdftotext` for every PDF profile, on PATH or set with the runtime `pdftotext` key or `KB_PDFTOTEXT`. Technical PDFs get both Poppler and Docling by default; `pdf_profile:"prose"` skips Docling and `"ocr"` forces full-page OCR. Every profile keeps the original page images. SVG previews in EPUBs use the pinned `@resvg/resvg-js`, and other image previews use Pillow. Original asset bytes are always kept.
- FFmpeg and FFprobe for media, native or through WSL. You only need speech API keys for hosted transcription.

Run the `package.json` scripts from the repository root. Building and testing won't create the database service, download every optional model or initialize a real library, and there's no automated clean-machine bootstrap yet.

## Where configuration lives

| Location | What it holds |
|---|---|
| `plugin/.mcp.json` | Codex's generated machine-local launcher: Node, engine path, library, state, media mode, `KB_ACTOR=codex` and optional project identity. Ignored by Git |
| `plugin/.claude-plugin/plugin.json` | Claude Code's launcher, committed: it runs `../dist/mcp.js` from the plugin folder with `KB_ACTOR=claude` and the session's project folder, and takes the library, state and media settings from the plugin's options |
| Claude Code's plugin options | The library and state folders, media tools and the specialist-tools switch you enter when enabling the plugin, kept in your Claude Code settings |
| `<state>/config.json` | The Python executable, the FalkorDB endpoint and password-file reference, optional speech and evaluation settings |
| `<corpus>/corpus.json` | Library identity, domains and modules, and allowed projects. Created by `init` |
| `<corpus>/dimensions.json` | Applicability dimensions and their units |
| `<state>/ledgers/` | The deletion history. Back it up and keep it with the library |
| The server's own volume or folder | FalkorDB's data, separate from the library and the engine state |

`KB_STATE_DIR` picks `<state>`; without it, the engine uses its own `.runtime/` folder. `KB_CORPUS` picks `<corpus>`. Neither variable moves an existing installation's data, so changing one points the engine somewhere new rather than migrating anything. `kb_status` tells you where the engine, state and library actually are.

## Graph setups

### Managed WSL

Use the [runtime example](../examples/runtime.example.json) with `deployment: "ubuntu-wsl2-direct"`. The legacy setup and service scripts assume Ubuntu, port 6387, `/opt/research-knowledge` and `/var/lib/research-knowledge`. `scripts/setup-wsl.sh` downloads and checks the pinned module, writes the service configuration and starts it. It expects Redis, its system account, curl and Python to be there already. Read it before you run it as root. If you want a different data folder, change the related service and config paths together. `auto_start` starts an existing installation; it won't create one.

### A server you run yourself

Use the [external runtime example](../examples/runtime.external.example.json) with `deployment: "falkordb-external"` and `graph.auto_start: false`. Docker, native Linux or an existing FalkorDB service can all provide the endpoint; set it up with the [official instructions](https://github.com/FalkorDB/FalkorDB), with persistent storage and a password. In this mode the engine never touches the WSL service. Remote access is advanced territory: use authenticated, encrypted transport and network restrictions. `graph.tls` exists but hasn't been tested live.

Either way, the password lives in a file readable from Windows, and that file never gets committed. Database data and service configuration belong to the deployment, not the library.

## Library and launcher

Adapt [corpus.example.json](../examples/corpus.example.json) with a unique library id, your domains and modules, and the exact allowed project path. The library id picks the graph and search namespaces and the deletion history, so two libraries need two ids.

For a personal library, use one module and separate topics with domains. Invent's bridges can only cross what a project is allowed to read, and moving records between modules later is its own operation, so a second module is only for material that has to stay apart, such as a client's.

From the engine folder, with the chosen state folder exported in `KB_STATE_DIR`:

```powershell
node dist/cli.js init --corpus 'C:/KnowFuData/library' --project 'C:/Research' --input 'corpus.local.json'
node dist/cli.js kb_status --corpus 'C:/KnowFuData/library' --project 'C:/Research' --input 'status.local.json'
```

The paths are just examples. `corpus.local.json` is your adapted configuration, and `status.local.json` contains `{}`. `init` creates the ledger and audit state the library needs, which is why copying a corpus JSON by hand doesn't work. A restore uses the matching existing ledger, never a fresh `init`.

`KB_MEDIA_RUNTIME` chooses where media tools run and `KB_WSL_DISTRO` which distribution. Neither one redirects the legacy graph service helper. If your graph runs in a custom distribution or service, use external-server mode unless you deliberately adapt the helper.

`KB_PROJECT` sets the calling project's identity, and it has to match a binding. If you hit a scope error, fix the binding; never borrow another project's identity to get past it. After `init`, authorized module, domain and binding changes go through `kb_maintain configure`, described in [operations](../skills/know-fu/references/operations.md).

Five specialist tools (`kb_lifecycle`, `kb_evaluate`, `kb_propose`, `kb_change`, `kb_retrieve`) stay out of everyday sessions to save context. `KB_ADVANCED_TOOLS=1` lists them, and the CLI always has them.

### Codex

Run `node scripts/configure-plugin.mjs --help`, then pass the chosen absolute library and state paths and `--media native` or `--media wsl` (add `--distro` for WSL, and `--advanced-tools` if this installation does maintenance). It writes a local `.mcp.json` with `KB_ACTOR=codex`, without moving data or installing services, and refuses to overwrite one that already exists. Without `--project`, Codex's working directory is the project identity.

`node scripts/install-plugin.mjs` copies the configured plugin into the local plugin-source folder, and that's all it does. It doesn't register a marketplace or install anything else. Use Codex's supported local plugin registration or reinstall flow for the installed version, restart the chat, and check that the MCP server really shows up. A generic [MCP example](../examples/mcp.example.json) is included for reference.

### Claude Code

Claude Code installs the plugin straight from this checkout, so build the engine here first (`npm ci`, `npm run build`, and the Python converters). Then, in Claude Code:

```text
/plugin marketplace add <path to this repository>
/plugin install know-fu@know-fu
```

Claude Code asks for the plugin's options when you enable it: the library folder (already initialized with `init`), the state folder, where media tools run, the WSL distribution, and whether to list the specialist tools. The plugin loads in place from `plugin/`, starts `node ../dist/mcp.js` with `KB_ACTOR=claude`, and passes the session's project folder as `KB_PROJECT`, because Claude Code otherwise starts plugin servers in the plugin's own folder. So a pull and rebuild of this checkout updates the plugin at the next session, and every project that uses the library needs its own binding. A one-command install from GitHub doesn't work yet: Claude Code would copy only the plugin folder, and the engine's native modules and Python converters need building where they run.

Node has to be on PATH for Claude Code, at version 24.14. Start a new session in a bound project and call `kb_status` to see the engine, library and scope it actually reports.

## Transcription and evaluation

Text, PDF and EPUB need no speech API keys. For hosted audio and video transcription, add the `transcription` object from [the example](../examples/transcription.example.json), set the API-key environment variables for the server process, and authorize an allowance per job. Check current provider support and prices first. `media_plan` estimates the requests without uploading anything, but the reservation can't guarantee what the provider finally bills.

A local transcriber can already produce TXT, SRT or VTT for ingestion. Those come in as text sources: their timestamps aren't verified media locators, and the visuals stay outside a transcript-only ingest. Proper local decoder integration would need to keep media mappings, raw decoder output, coverage and uncertainty, so it's real work, not a setting.

Evaluation needs a configured `codex_executable`, a normal sign-in and a verified isolation receipt. Its model calls and any speech charges are billed separately. Before running one, confirm that private material is allowed to go where the evaluation sends it.

## Backups and checks

Back up the library together with its matching deletion ledger. The graph, the QMD index and the wiki can all be rebuilt, but active jobs may hold receipts for paid requests, so keep those too. If the ledger is missing or stale, a restored library refuses to serve, which beats quietly bringing purged material back.

On whatever deployment you choose, try a throwaway ingestion, exact source reads, publication, all three views, recall, a service restart, and a backup and restore. Unit tests don't prove a fresh machine or a real source works. Keep your local setup record outside Git, and update the change log and docs when a setup change affects supported behavior.

Keep the bundled schema copies in step with the engine:

```powershell
node scripts/package-plugin.mjs
node scripts/package-plugin.mjs --check
```

The check compares the copied schema and config bytes, validates the corpus example and checks relative Markdown links. The private library, state, credentials and `.mcp.json` stay out of the release.

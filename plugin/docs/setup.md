# Setup reference

[Package overview](../README.md) · [Set it up with your AI](setup-ai.md) · [Options and their trade-offs](setup-choices.md)

This page holds the facts: what Know Fu depends on, how much disk it takes, where each setting lives, and how each agent runs the engine. For the steps, follow [setting up Know Fu with an AI](setup-ai.md), which also works as a checklist if you're installing by hand.

The engine lives in the repository, so the plugin folder on its own won't get you far. The original Windows installation is one setup that's been tested, not a requirement. Some alternatives already work: a different state or library folder, and FFmpeg either native or inside a WSL distribution of your choice. WSL is only needed if you pick it for FFmpeg. Other operating systems still need their own live checks before anyone should trust them. Local speech decoding isn't a setting you flip; it needs code.

Two agents are supported from the same `plugin/` folder: Codex reads `plugin/.codex-plugin/plugin.json`, and Claude Code reads `plugin/.claude-plugin/plugin.json`. They share the skill and its guides, and each one tells the engine its name (`KB_ACTOR`), so every record says which agent wrote it. Only Codex runs the isolated evaluation bench.

## Dependencies

- Node 24.14.x. Exact package versions and integrity hashes are in `package-lock.json`. The build generates schema types.
- QMD, installed with the Node dependencies, plus its model files for vector search. Search is forced onto the CPU, and reranking is optional and can be slow. Model and native-module downloads come separately from the source code.
- Python 3.12 with `requirements.lock.txt` for document and image conversion (the original was 3.12.14). The CPU PyTorch wheels come from PyTorch's CPU package index. A pip lock won't install operating-system libraries, and it can't promise wheels exist for every platform.
- Poppler `pdftotext` for every PDF profile, set with the runtime `pdftotext` key or `KB_PDFTOTEXT`, or found on PATH. On Windows, the `pdftotext` that Git for Windows puts on PATH is Xpdf's, not Poppler's; `pdftotext -v` names Poppler on the right one. Technical PDFs get both Poppler and Docling by default; `pdf_profile:"prose"` skips Docling and `"ocr"` forces full-page OCR. Every profile keeps the original page images. SVG previews in EPUBs use the pinned `@resvg/resvg-js`, and other image previews use Pillow. Original asset bytes are always kept.
- FFmpeg and FFprobe for media, native or through WSL. Native FFmpeg on Windows means no WSL at all. You only need speech API keys for hosted transcription.

There's no database server to install: the library's links live in its records, and the engine reads them into memory.

## How big it is

Measured on the development machine (Windows 11) on 12 October 2026, as space on disk after installing. Downloads are smaller, because packages arrive compressed.

| Part | Needed for | Where it goes | On disk |
|---|---|---|---:|
| Node.js 24.14 | Everything | Its own install | 103 MB |
| Engine packages (`npm ci`) | Everything, including QMD search | `node_modules` in the engine folder | 919 MB |
| Python 3.12, when uv installs it | Document and image conversion | uv's Python folder | 69 MB |
| Converter environment: Docling, CPU PyTorch, OCR, Pillow | Document and image conversion | `.venv` in the engine folder | 1.1 GB |
| Docling's models, downloaded at the first PDF conversion | PDFs | The Hugging Face cache in your user folder | 506 MB |
| Poppler (the winget build) | PDFs | Its own install | 42 MB |
| QMD's embedding model, downloaded at the first reindex | Search by meaning | `<state>/cache/qmd/models` | 318 MB |
| QMD's reranker, downloaded only if you turn on `rerank` | Optional reranking | `<state>/cache/qmd/models` | 610 MB |
| The search index | Search | `<state>/cache/qmd` | 3-4 MB for each small test library |
| FFmpeg and FFprobe (the gyan.dev Essentials build, through winget) | Video and audio only | Its own install, or inside WSL | 307 MB, of which `ffplay` is 100 MB that Know Fu doesn't use |

For books and papers that comes to about 3 GB, before the library itself. The library grows with what you ingest: every source keeps its original file and its page images, alongside the records and their prose.

Three things sit outside that total:

- uv keeps a copy of every package it downloads in its own cache (`%LOCALAPPDATA%\uv\cache` on Windows), shared with every other project that uses uv. On the development machine it held 4.0 GB. `uv cache clean` empties it.
- QMD's own command line can download a 1.2 GB query-expansion model. Know Fu never needs it, because the engine writes its own search queries.
- The model sizes come from the files Docling and QMD saved on the development machine.

## Where configuration lives

| Location | What it holds |
|---|---|
| `plugin/.mcp.json` | Codex's generated machine-local launcher: Node, engine path, library, state, media mode, `KB_ACTOR=codex` and optional project identity. Ignored by Git |
| `plugin/.claude-plugin/plugin.json` | Claude Code's launcher, committed: it runs `dist/mcp.js` from the engine folder set in the plugin's options, with `KB_ACTOR=claude` and the session's project folder, and takes the library, state and media settings from the same options |
| Claude Code's plugin options | `engine_dir`, `library_dir`, `state_dir`, `media_runtime`, `wsl_distro` and `advanced_tools`, kept in your Claude Code settings |
| `<state>/config.json` | The converter environment's Python, Poppler's `pdftotext`, and optional speech and evaluation settings. See [the runtime example](../examples/runtime.example.json) |
| `<corpus>/corpus.json` | Library identity, domains and modules, and allowed projects. Created by `init` |
| `<corpus>/dimensions.json` | Applicability dimensions and their units |
| `<state>/ledgers/` | The deletion history. Back it up and keep it with the library |

The engine reads these environment variables, which the launchers set:

| Variable | Meaning |
|---|---|
| `KB_CORPUS` | The library folder |
| `KB_STATE_DIR` | The state folder. Without it, the engine uses its own `.runtime/` folder |
| `KB_PROJECT` | The calling project's identity, which has to match a binding. Without it, the working directory |
| `KB_ACTOR` | The agent that writes, recorded on every record, such as `claude` or `codex`. Records say `unspecified` without it |
| `KB_MEDIA_RUNTIME` | Where media tools run: `native` or `wsl` |
| `KB_WSL_DISTRO` | Which WSL distribution, when media runs in WSL |
| `KB_ADVANCED_TOOLS` | `1`, `true` or `yes` lists the five specialist tools as well as the 11 everyday ones |
| `KB_PDFTOTEXT` | Poppler's `pdftotext`, when `config.json` doesn't name it |

Neither `KB_CORPUS` nor `KB_STATE_DIR` moves an existing installation's data, so changing one points the engine somewhere new rather than migrating anything. `kb_status` tells you where the engine, state and library actually are.

### Upgrading from a FalkorDB setup

Until 12 October 2026 the engine copied the library into a FalkorDB server. An older `config.json` can keep its `deployment` and `graph` keys; the engine ignores them. The server's data still holds a copy of the library as it was at the last reindex, and purges no longer reach it, so stop the server and delete its data yourself. In the original WSL setup that's the `research-knowledge` service and `/var/lib/research-knowledge`.

## The library

`scripts/create-library.mjs` creates a library: one `research` module, your domains, one bound project folder, the deletion ledger and `<state>/config.json`. `node scripts/create-library.mjs --help` lists its options. It wraps `node dist/cli.js init`, which takes a corpus file shaped like [corpus.example.json](../examples/corpus.example.json). `init` creates the ledger and audit state the library needs, which is why copying a corpus JSON by hand doesn't work. A restore uses the matching existing ledger, never a fresh `init`.

The library id picks the search namespace and the deletion history, so two libraries need two ids. For a personal library, use one module and separate topics with domains. Invent's bridges can only cross what a project is allowed to read, and moving records between modules later is its own operation, so a second module is only for material that has to stay apart, such as a client's.

A project is bound by its folder path. Claude Code passes the session's folder with forward slashes (`C:/Research`), and Codex passes its working directory with backslashes (`C:\Research`). Windows paths compare the same however they're written, slashes and letter case included. If you hit a scope error, fix the binding; never borrow another project's identity to get past it. `SCOPE_DENIED` names the project the engine received. After `init`, authorized module, domain and binding changes go through `kb_maintain configure`, described in [operations](../skills/know-fu/references/operations.md).

Five specialist tools (`kb_lifecycle`, `kb_evaluate`, `kb_propose`, `kb_change`, `kb_retrieve`) stay out of everyday sessions to save context. `KB_ADVANCED_TOOLS` lists them, and the CLI always has them.

## How each agent runs the engine

### Claude Code

Claude Code keeps a copy of `plugin/` in its plugin cache (`~/.claude/plugins/cache/know-fu/know-fu/<version>/`). With this marketplace, which is a local git checkout, Claude Code 2.1.296 still reads the plugin from the checkout itself: `CLAUDE_PLUGIN_ROOT` is the checkout's `plugin/` folder, and the skill loads from there. Another local plugin on the development machine has run from its cached copy, though, so the manifest starts the engine from the `engine_dir` option rather than from a path relative to the plugin. It runs `node <engine_dir>/dist/mcp.js` with `KB_ACTOR=claude`, and passes the session's project folder as `KB_PROJECT`. Node has to be on PATH for Claude Code, at version 24.14.

A pull and rebuild of this checkout reaches the engine, the skill and its guides at the next session, or after `/reload-plugins`. `claude plugin update know-fu@know-fu` says whether your version reads the plugin in place. If it ever reports a cached copy instead, a change to the skill or guides needs a version bump and that update. A one-command install from GitHub doesn't work yet: Claude Code would copy only the plugin folder, and the engine's native modules and Python converters need building where they run.

### Codex

`scripts/configure-plugin.mjs` writes Codex's launcher, `plugin/.mcp.json`, with `KB_ACTOR=codex`. It doesn't move data or install services, and it refuses to overwrite a launcher that exists. Without `--project`, Codex's working directory is the project identity. `scripts/install-plugin.mjs` copies the configured plugin into the local plugin-source folder, and that's all it does: it doesn't register a marketplace or install anything else. Codex's own local plugin workflow registers or refreshes it. A generic [MCP example](../examples/mcp.example.json) is included for reference.

## Transcription and evaluation

Text, PDF and EPUB need no speech API keys. For hosted audio and video transcription, add the `transcription` object from [the example](../examples/transcription.example.json), set the API-key environment variables for the server process, and authorize an allowance per job. Check current provider support and prices first. `media_plan` estimates the requests without uploading anything, but the reservation can't guarantee what the provider finally bills.

A local transcriber can already produce TXT, SRT or VTT for ingestion. Those come in as text sources: their timestamps aren't verified media locators, and the visuals stay outside a transcript-only ingest. Proper local decoder integration would need to keep media mappings, raw decoder output, coverage and uncertainty, so it's real work, not a setting.

Evaluation needs a configured `codex_executable`, a normal sign-in and a verified isolation receipt. Its model calls and any speech charges are billed separately. Before running one, confirm that private material is allowed to go where the evaluation sends it.

## Backups and checks

Back up the library together with its matching deletion ledger. The QMD index and the wiki can both be rebuilt, but active jobs may hold receipts for paid requests, so keep those too. If the ledger is missing or stale, a restored library refuses to serve, which beats quietly bringing purged material back.

On whatever setup you choose, try a throwaway ingestion, exact source reads, publication, both views, recall, and a backup and restore. Unit tests don't prove a fresh machine or a real source works. Keep your local setup record outside Git, and update the change log and docs when a setup change affects supported behavior.

Keep the bundled schema copies in step with the engine:

```powershell
node scripts/package-plugin.mjs
node scripts/package-plugin.mjs --check
```

The check compares the copied schema and config bytes, validates the corpus example and checks relative Markdown links. The private library, state, credentials and `.mcp.json` stay out of the release.

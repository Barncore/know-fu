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
| `~/.know-fu/config.json` | Know Fu's settings: for each agent, the engine folder, library, state folder, media tools and specialist tools, plus `deliberate_use`. Written by `scripts/configure-plugin.mjs`; read by the launcher when a chat starts. `KNOW_FU_CONFIG` points elsewhere |
| `plugin/.claude-plugin/plugin.json` | Claude Code's launch, committed: `node <plugin>/scripts/launch.mjs` with `KB_ACTOR=claude` and the session's folder |
| `plugin/hooks/hooks.json` | Claude Code's gate, committed: Know Fu's tools stay closed in a chat until the user invokes `/know-fu:know-fu` |
| `plugin/.mcp.json` | Codex's machine-local launch: `node <engine>/plugin/scripts/launch.mjs` with `KB_ACTOR=codex`. Ignored by Git |
| `<state>/config.json` | The converter environment's Python, Poppler's `pdftotext`, and optional speech and evaluation settings. See [the runtime example](../examples/runtime.example.json) |
| `<corpus>/corpus.json` | Library identity, domains and modules, and allowed projects. Created by `init` |
| `<corpus>/dimensions.json` | Applicability dimensions and their units |
| `<state>/ledgers/` | The deletion history. Back it up and keep it with the library |

The engine reads these environment variables. The launcher sets them from Know Fu's settings file, and a variable that's already set wins:

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
| `KNOW_FU_CONFIG` | Where the launcher and the gate look for Know Fu's settings, instead of `~/.know-fu/config.json` |

Neither `KB_CORPUS` nor `KB_STATE_DIR` moves an existing installation's data, so changing one points the engine somewhere new rather than migrating anything. `kb_status` tells you where the engine, state and library actually are.

### Upgrading from a FalkorDB setup

Until 12 October 2026 the engine copied the library into a FalkorDB server. An older `config.json` can keep its `deployment` and `graph` keys; the engine ignores them. The server's data still holds a copy of the library as it was at the last reindex, and purges no longer reach it, so stop the server and delete its data yourself. In the original WSL setup that's the `research-knowledge` service and `/var/lib/research-knowledge`.

## The library

`scripts/create-library.mjs` creates a library: one `research` module, your domains, the home folder (`--home`) bound with every capability, the access other folders get (`--read-from-any-folder` and `--save-from-any-folder` on, `--ingest-from-any-folder` off, each with a `--no-` form for the first two), the deletion ledger and `<state>/config.json`. `node scripts/create-library.mjs --help` lists its options. It wraps `node dist/cli.js init`, which takes a corpus file shaped like [corpus.example.json](../examples/corpus.example.json). `init` creates the ledger and audit state the library needs, which is why copying a corpus JSON by hand doesn't work. A restore uses the matching existing ledger, never a fresh `init`.

The library id picks the search namespace and the deletion history, so two libraries need two ids. For a personal library, use one module and give each broad subject, such as Audio or Trading, its own domain. Invent's bridges can only cross what a project is allowed to read, and moving records between modules later is its own operation, so a second module is only for material that has to stay apart, such as a client's.

A chat's folder is its identity. Claude Code passes the session's folder with forward slashes (`C:/Research`), and Codex passes its working directory with backslashes (`C:\Research`); Windows paths compare the same however they're written, slashes and letter case included. The library's `access` setting names the home folder and says what folders without a binding of their own may read, save and author; a folder's own binding always wins, and with the setting a binding also covers the folders inside it. A library without an `access` setting works as before 0.3.0: only bound folders, matched exactly. If you hit a scope error, its message says what the folder can do and where to go; never borrow another folder's identity to get past it. After `init`, authorized module, domain, binding and access changes go through `kb_maintain configure`, described in [operations](../skills/know-fu/references/operations.md#configuring-modules-and-bindings). An older engine refuses a `corpus.json` that uses the `access` setting or the new binding lists, so move engine and plugin forward together.

Five specialist tools (`kb_lifecycle`, `kb_evaluate`, `kb_propose`, `kb_change`, `kb_retrieve`) stay out of everyday sessions to save context. `KB_ADVANCED_TOOLS` lists them, and the CLI always has them.

## How each agent runs the engine

Both agents start the same launcher, `plugin/scripts/launch.mjs`. It reads the agent's section of `~/.know-fu/config.json` (a section named after `KB_ACTOR` overrides shared top-level values), sets the engine's variables, and imports `<engine>/dist/mcp.js` into its own process, so it adds no memory of its own. The chat's folder becomes `KB_PROJECT`. Without usable settings it still answers, with one `kb_status` tool that returns `KNOWFU_NOT_CONFIGURED` and names the problem, so a missing setup shows up as a message rather than as missing tools.

### Claude Code

The Claude desktop app and the `claude` command load plugins differently. The command reads the installed plugin, `know-fu@know-fu`. The desktop app passes installed plugins to Claude Code itself, as plugin folders taken from the plugin cache (`~/.claude/plugins/cache/know-fu/know-fu/<version>/`), and a plugin passed as a folder gets a different name, `know-fu@inline`. Plugin options saved for `know-fu@know-fu` don't reach that copy. Until 0.3.0 the launch depended on those options, so the desktop app quietly left Know Fu's server out while the terminal worked. That's why the settings now live in Know Fu's own file, and why the manifest may not use plugin options at all (`npm run check:package` enforces it).

The command reads this marketplace's `plugin/` folder in place (seen with 2.1.296), so it picks up plugin changes at the next chat. The desktop app runs the cached copy, so a change to the skill, its guides, the launcher or the gate reaches it only with a new version number, `claude plugin marketplace update know-fu` and `claude plugin update know-fu@know-fu`. The engine is read from the checkout named in the settings, so a pull and rebuild reaches it at the next chat. Node has to be on PATH at version 24.14. A one-command install from GitHub doesn't work yet: the engine's native modules and Python converters need building where they run.

Use is deliberate. The skill sets `disable-model-invocation: true`, so only the user's `/know-fu:know-fu` loads it. The engine's tools are listed in every chat where the plugin is on, though, so `plugin/hooks/hooks.json` adds a gate: a `PreToolUse` hook on Know Fu's tools denies the call, with the reason, until the chat shows the user invoked the skill (the prompt itself, or the invocation recorded in the chat's transcript). If the gate itself fails, it denies rather than letting calls through. `"deliberate_use": false` in the settings file turns it off.

### Codex

`scripts/configure-plugin.mjs --agent codex` writes the `codex` settings section and Codex's launch, `plugin/.mcp.json`, which runs this checkout's launcher by absolute path with `KB_ACTOR=codex`. It refuses to overwrite either without `--replace`. Without `--project`, Codex's working directory is the project identity; in a git worktree that's the worktree checkout, and a chat with no project still has a working folder of its own. `scripts/install-plugin.mjs` copies the configured plugin into the local plugin-source folder, and Codex's own plugin workflow (`codex plugin add`) installs it. Codex runs the installed copy from its cache, so changed plugin files reach it only through that step, even at the same version; it accepts a lower version number too.

The skill is manual-only in Codex through `skills/know-fu/agents/openai.yaml` (`allow_implicit_invocation: false`). Codex documents hooks that can deny a tool call, but in tests on 13 October with codex-cli 0.162.0-alpha.17.2 trusted hooks recorded no callbacks at all, so Know Fu ships no Codex gate and its tools stay callable without the skill there. A generic [MCP example](../examples/mcp.example.json) is included for reference.

## What it costs to run

Every open chat where the plugin is on runs its own engine, whether or not Know Fu is used in it; Claude Code and Codex never share one. Measured on Windows 11 on 12 and 13 October 2026:

| State | Memory |
|---|---|
| Engine just started | about 67 MB working set |
| Engine idle for an hour (Windows trims idle processes) | 28 MB working set, 35 to 73 MB private |
| Search helper while a recall runs | about 165 MB more, closed after 60 seconds idle |
| Engine after recalls over a 1,525-account library, idle | 104 MB working set, 116 MB private, until idle release; then 64 MB and 75 MB |

An engine with no calls for `KB_IDLE_RELEASE_MINUTES` (default 10; `0` or `off` turns it off) drops its recall index and file cache and hands the memory back; the next recall rebuilds the index, which took about 0.65 seconds for that library. On a library of a few records release makes no measurable difference, because most of an idle engine is code and runtime.

So five open chats cost roughly 175 to 350 MB, plus a short spike while one searches. The Claude desktop app's log shows a 30-minute idle timeout set on each session, and Codex documents unloading a chat after 30 minutes without activity; an unloaded or archived Codex chat's engine stops. Neither timeout was timed. With a stand-in host, the engine and its search helper exited within 5 seconds both when the host closed the connection and when it was killed. Compared with a chat itself (a Claude Code session process held 700 to 820 MB), Know Fu adds under a tenth.

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

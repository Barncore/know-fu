# Know Fu plugin

This folder is the adapter for Know Fu, for both Codex and Claude Code: the skill the agent follows, its reference guides, each agent's manifest and MCP launch configuration, and copies of the schemas. Here's the catch: the engine that does the actual work, and the library it builds, both live outside this folder. Copy this folder on its own and you get instructions for a system that isn't there.

## Start here

- [Architecture, schema and folder layout](docs/architecture.md)
- [Setup, configuration, backup and portability](docs/setup.md)
- [Set up with an AI](docs/setup-ai.md) and the [decision matrix](docs/setup-choices.md)
- [Design lineage, and what isn't a dependency](docs/lineage.md)
- [The JSON schemas](contracts/README.md)
- [The skill](skills/know-fu/SKILL.md), with guides for [ingestion](skills/know-fu/references/ingestion.md), [notes](skills/know-fu/references/notes.md), [books and PDFs](skills/know-fu/references/books.md), [video and audio](skills/know-fu/references/video.md), [using the knowledge](skills/know-fu/references/retrieval.md) and [operations](skills/know-fu/references/operations.md)

## Three parts of one system

| Part | What it holds | In this folder? |
|---|---|---|
| Plugin | The skill, its guides, the Codex manifest (`.codex-plugin/`) and the Claude Code manifest (`.claude-plugin/`) | Yes |
| Engine | Conversion, validation, publication, recall, brief, connect, views, lifecycle | No. It's the TypeScript project this folder sits inside |
| Library | Original sources, exact record revisions, explanatory prose, jobs and audit history | No. It's your own data folder |

The schemas in here are verified copies of the engine's contracts. They explain the data model, but they don't replace the engine or set up FalkorDB. [engine-contracts.json](engine-contracts.json) records their versions and hashes.

To see where things really are, ask `kb_status` in a running chat; it reports the actual engine and library paths. On disk, Codex's `.mcp.json` points at the engine's `dist/mcp.js` and sets the library through `KB_CORPUS`, and its absolute paths belong to one machine. Claude Code's manifest runs `../dist/mcp.js` from this folder and takes its paths from the plugin's options. The engine repository's `README.md`, `docs/VALIDATION.md` and `docs/PERFORMANCE.md` cover its dependencies, checks and measured limits.

## Keeping it together

Keep the engine source, contracts, lockfiles, tests, scripts and this adapter together. Keep the live library, credentials, runtime folders, model caches and personal acceptance outputs out of the code repository. A plugin-only copy keeps the instructions and loses most of Know Fu.

The original deployment is Windows plus Ubuntu WSL2, with FalkorDB and QMD, and no cloud database or hosting subscription. The agent does the reasoning, and transcription, when it's used, goes through separately billed APIs. No local Whisper is needed.

Codex's generated `.mcp.json` is machine-local and never committed. There's no clean-machine installer yet, and the Claude Code adapter hasn't run a real ingest yet; [setup](docs/setup.md) lists what's left. Two agents writing to one library at the same time is untested, so keep to one writer at a time.

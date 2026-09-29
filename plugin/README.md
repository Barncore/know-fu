# Know Fu

Ingest specialized research into a connected library that an AI can retrieve from, explain, teach and apply. Original sources, their interpretations and new hypotheses remain distinguishable.

**This folder is the Codex adapter, documentation and schema reference. The executable engine and your knowledge library live outside it. Copying this folder alone does not install a working system.**

## Start here

- [Architecture, schema and directory layout](docs/architecture.md)
- [Setup, configuration, backup and portability](docs/setup.md)
- [Set up with an AI](docs/setup-ai.md) / [decision matrix](docs/setup-choices.md)
- [Design lineage and dependency boundaries](docs/lineage.md)
- [Formal JSON schemas](contracts/README.md)
- [Ingestion and retrieval workflow](skills/know-fu/SKILL.md)
- [Books and PDFs](skills/know-fu/references/books.md) / [video and audio](skills/know-fu/references/video.md)
- [Operations](skills/know-fu/references/operations.md)

## Three parts of one system

| Part | Owns | Included here? |
|---|---|---|
| Plugin | Codex skill, reference guides, MCP launch configuration | Yes |
| Engine | Source conversion, schema validation, publication, graph/search projection, retrieval, lifecycle operations | No; a separate local TypeScript project |
| Corpus | Preserved sources, exact record revisions, explanatory Markdown, ingestion jobs and audit history | No; your separate data directory |

The schema files bundled here are verified copies of the engine contracts. They explain the data model; they do not replace the engine or configure FalkorDB by themselves. See [the contract manifest](engine-contracts.json) for versions and hashes.

In an installed chat, `kb_status` reports the actual engine and corpus paths. On disk, `.mcp.json` identifies the engine's `dist/mcp.js` and the corpus through `KB_CORPUS`. Its absolute paths belong to the local deployment. The engine's own `README.md`, `ACCEPTANCE.md` and `DEPENDENCIES.md` describe that installation and its measured limits.

## Sharing or keeping a private repository

Preserve the engine source, contracts, lockfiles, tests, scripts and this adapter together. Keep the live corpus, credentials, runtime directories, model caches and personal acceptance outputs outside the code repository. A plugin-only repository would preserve instructions but omit most of Know Fu.

The current deployment is local Windows plus Ubuntu WSL2, with FalkorDB and QMD. It has no cloud database or hosting subscription. Codex provides reasoning; optional transcription uses separately billed APIs. No local Whisper is required.

The repository contains the engine alongside this plugin; its machine-local `.mcp.json` is generated during setup and is not committed. A clean-machine installer and verified adapters for other harnesses have not been shipped. [Setup and portability](docs/setup.md) identifies the remaining work. Creating a private repository and allowing multiple harnesses to write the same corpus are separate decisions.

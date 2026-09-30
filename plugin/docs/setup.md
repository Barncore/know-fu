# Setup, configuration and portability

[Package overview](../README.md) · [Ask your AI to set it up](setup-ai.md) · [Options and their tradeoffs](setup-choices.md)

## Choose the installation before running commands

The repository includes the engine; the plugin folder alone does not. Read the setup-choice matrix and agree on storage locations, graph deployment, media utilities and transcription route first. The existing Windows/Ubuntu installation is one tested profile, not a requirement for everyone.

The engine has configurable interfaces for a different state/library directory, a separately managed FalkorDB endpoint, and native or selected-WSL FFmpeg. Docker provisioning and full native installations still need their own live checks. Integrated local speech decoding and non-Codex harness adapters are not implemented by simply changing a setting.

## Dependencies

- Node 24.14.x, with exact JS package versions/integrity in the repository `package-lock.json`. The build generates schema types and applies a version-guarded official FalkorDB client patch.
- Regular FalkorDB; the original deployment used server 4.20.7 with Redis 8.0.5. A Docker/native service should use a reviewed compatible version, authentication, persistent storage and a loopback connection by default.
- QMD from the Node dependencies and its model assets for vector retrieval. Current search forces CPU; reranking is optional and can be slow. Model/native-module downloads are separate from plain source code.
- Python 3.12 and the repository `requirements.lock.txt` for document/visual conversion. The original Python was 3.12.14. CPU PyTorch wheels may require their CPU package index; a pip version lock does not install OS libraries or guarantee cross-platform wheel availability.
- Poppler `pdftotext` for every PDF profile, found on PATH or set through runtime `pdftotext` / `KB_PDFTOTEXT`. Technical PDFs default to complementary Poppler/Docling extraction; `pdf_profile:"prose"` skips Docling and `"ocr"` forces full-page OCR. Each profile retains original-page images. SVG EPUB previews use the pinned `@resvg/resvg-js` package; other image previews use Pillow. Original asset bytes remain preserved.
- FFmpeg/FFprobe for media, selected through native PATH or WSL. Speech API credentials are needed only for the hosted media-transcription route.

Use the engine's `package.json` scripts from repository root. Build/test commands do not create the database service, download every optional model or initialize a real library. A full clean-machine bootstrap has not been automated.

## Configuration locations

| Location | Responsibility |
|---|---|
| `plugin/.mcp.json` | Generated machine-local launcher: Node, engine path, corpus, state, media mode and optional project identity; ignored by Git |
| `<state>/config.json` | Python executable, FalkorDB endpoint/password-file reference, optional speech/evaluation configuration |
| `<corpus>/corpus.json` | Library identity, domains/modules and allowed projects; created through `init` |
| `<corpus>/dimensions.json` | Applicability dimensions and units |
| `<state>/ledgers/` | Independent deletion history; back up and retain with the library's recovery plan |
| Chosen server volume/directory | FalkorDB persistence; distinct from corpus and engine state |

`KB_STATE_DIR` selects `<state>`; the legacy default is engine `.runtime/`. `KB_CORPUS` selects `<corpus>`. Neither variable moves an existing installation's data. `kb_status` reports engine, state and corpus locations.

## Graph profiles

**Managed original WSL profile:** [runtime example](../examples/runtime.example.json), `deployment: "ubuntu-wsl2-direct"`. The legacy setup/service scripts use Ubuntu, port 6387, `/opt/research-knowledge` and `/var/lib/research-knowledge`. `scripts/setup-wsl.sh` downloads and checks the pinned module, writes service configuration and starts it; it assumes Redis, its OS account, curl and Python are already installed. Inspect it before root execution. Choose another storage directory only by adapting the related service/config paths consistently. `auto_start` starts an existing installation; it does not provision one.

**Separately managed server:** [external runtime example](../examples/runtime.external.example.json), `deployment: "falkordb-external"`, `graph.auto_start: false`. Docker, native Linux or an already managed FalkorDB service can expose the same endpoint. Use the [official instructions](https://github.com/FalkorDB/FalkorDB), choose the persistent storage and authenticate it. The engine will not start the WSL service when this profile is selected. Remote access is an advanced deployment: use authenticated encrypted transport and network restrictions; `graph.tls` is available but not live-validated here.

The Windows-readable `password_file` contains the matching service password. Do not commit its contents. Database data and service configuration belong to the chosen deployment, not the canonical corpus.

## Corpus and launcher

Adapt [corpus.example.json](../examples/corpus.example.json) with a unique library ID, domain/module choices and the exact allowed project path. Library IDs select graph/search namespaces and deletion history, so different libraries need different IDs.

From the engine directory, with the accepted state directory exported in `KB_STATE_DIR`:

```powershell
node dist/cli.js init --corpus 'C:/KnowFuData/library' --project 'C:/Research' --input 'corpus.local.json'
node dist/cli.js kb_status --corpus 'C:/KnowFuData/library' --project 'C:/Research' --input 'status.local.json'
```

The paths are examples; `corpus.local.json` is your adapted configuration and `status.local.json` contains `{}`. Initialization creates required ledger/audit state. Copying a corpus JSON manually is not equivalent. Restores use the matching existing deletion ledger rather than fresh initialization.

Run `node scripts/configure-plugin.mjs --help`, then supply the accepted absolute corpus/state paths and `--media native` or `--media wsl`. For WSL media, `--distro` selects the distribution. The generator creates a local `.mcp.json` without moving data or installing services. It refuses to overwrite an existing file.

`KB_MEDIA_RUNTIME` selects media execution and `KB_WSL_DISTRO` selects its distribution. These do not redirect the legacy graph service helper. With a custom graph distribution/service, use external-server mode unless you deliberately adapt the managed helper.

`KB_PROJECT` selects an explicit calling-project identity; absent that, the process working directory is used. A binding must match. Do not reuse another project's identity to evade a scope error. After initialization, authorized module/domain/binding changes go through `kb_maintain configure` as described in [operations](../skills/know-fu/references/operations.md).

Run `node scripts/install-plugin.mjs` to copy the configured plugin to the user's local plugin-source folder. This does not register a new marketplace or install infrastructure. Use the supported Codex local-plugin registration/reinstall workflow for the installed app version; refresh the chat and verify actual MCP discovery. A generic [MCP example](../examples/mcp.example.json) is included for inspection.

## Transcription and evaluation

Text, PDF and EPUB use does not require speech API credentials. For hosted audio/video transcription, add the `transcription` object from [the example](../examples/transcription.example.json), set the API-key environment variables for the server process and authorize a job allowance. Check current provider/model support and costs. `media_plan` estimates requests without uploading; reservations do not guarantee the provider's final bill.

A local transcriber can prepare TXT/SRT/VTT for ingestion now. Those files are handled as textual sources: timestamp strings are not independently verified media locators, and visual evidence remains outside that transcript-only ingest. A full local decoder integration must retain original-media mappings, raw decoder output, coverage and uncertainty. It is not yet a drop-in setting.

Evaluation needs a configured `codex_executable`, normal sign-in and a verified isolation receipt. Its model calls and speech API charges are separate. Confirm private material is authorized for its destination.

## Recovery and verification

Back up canonical corpus data plus its matching independent ledger. The graph, QMD index and generated wiki are rebuildable, but active jobs can contain paid-request receipts that must also be retained. A missing/stale deletion ledger blocks restored service instead of silently reviving purged material.

Verify a synthetic ingestion, exact source reads, publication, all three projections, retrieval, service restart and backup/restore for the selected deployment. Unit tests do not establish fresh-machine or real-source correctness. Keep the local setup record outside Git, and update the change log/docs when a setup change affects supported behavior.

Maintain the bundled schema reference from the engine:

```powershell
node scripts/package-plugin.mjs
node scripts/package-plugin.mjs --check
```

The packaging check verifies copied schema/config bytes, the corpus example and relative Markdown links. Private corpus/state/credentials and `.mcp.json` stay outside the tracked release.

# Setup choices: what's required and what's just preference

The original installation looks the way it does for reasons, and most of those reasons belonged to one person's machine. This page says why each choice was made and where you can safely choose differently. "Implemented" means the code supports it. "Unverified" means that environment still needs its own acceptance checks. Whatever you pick has to keep source provenance, scope, review and publication working; those aren't negotiable.

| Decision | Original choice and why | Your options |
|---|---|---|
| Coding agent | Codex desktop and its signed-in model | Codex and Claude Code are both packaged in `plugin/`, sharing one skill, and each record names the agent that wrote it. Codex is the one with live ingestion history; the Claude Code adapter is installed on the development machine but hasn't run a real ingest yet. Any other MCP agent needs its own launcher. Only Codex runs the evaluation bench. Two agents writing to one library at the same time is untested, so use one writer at a time |
| Engine language | TypeScript on Node, matching the local tooling and the MCP client library | Fixed. A rewrite in another language isn't a setup option |
| Graph | Links live in the records, and the engine follows them in memory. A FalkorDB server, on ste-bah's recommendation, held a copy until 12 October 2026. Nothing answered from it by then, so it went, along with its WSL2 service | Fixed, and there's no server to run. If a library ever outgrows memory, the plan is an index saved on disk beside the files, not a second copy in a database |
| Library location | A folder next to the development workspace | Any absolute `KB_CORPUS`. A good default is a backed-up SSD data folder such as `Documents/KnowFu/library`, or a bigger drive. Keep it outside the code checkout and outside live-sync folders |
| Runtime state and deletion ledger | The engine's `.runtime/` folder at first | Any `KB_STATE_DIR`. Good defaults: `%LOCALAPPDATA%/KnowFu/state` on Windows, `~/Library/Application Support/KnowFu/state` on macOS, `~/.local/state/know-fu` on Linux. Back up the ledger with the library, because it isn't a cache. Installs with no override keep using `.runtime/` |
| Search | QMD keyword search, plus vector search embedded on the CPU, which fits a 32 GB machine with no discrete GPU | Keyword search is QMD as implemented. The embedder for semantic search is your choice: local, an API, or off ([below](#semantic-search-embedder)) |
| Reranking | Off by default, after slow CPU measurements | Optional `rerank:true`. Measure latency and quality on your own hardware. All the reasoning still happens in the agent |
| Transcription | Hosted APIs, because long local transcription was too slow for the original owner | The API adapter accepts any compatible HTTPS decoder you configure. Preferring local transcription is fine: today you'd ingest TXT, SRT or VTT transcripts made elsewhere, and integrated local audio and video decoding needs an adapter. A transcript-only ingest never counts as verified video or visual ingestion |
| Number of decoders | Two API decoders, one for wording and one for timing and comparison | `models[]` takes one or more. Fewer decoders cost less but lose the independent comparison, so record that limit. No number of decoders proves accuracy |
| Provider and cost | A spending allowance per job, keys in environment variables, uncertain requests never blindly retried | Provider, model and price are all configurable. Check current endpoints, formats and prices before spending. An agent subscription isn't a speech-API budget |
| Media tools | FFmpeg and FFprobe inside Ubuntu, already installed | `KB_MEDIA_RUNTIME=wsl` with `KB_WSL_DISTRO`, or `native` for tools on PATH. Native Windows routing has contract tests; each real installation still needs a probe. Native is the way to run on Windows with no WSL at all |
| PDF and EPUB conversion | Poppler and Docling with direct readers, visual checks and stable locators | The existing converters. A replacement parser or OCR tool is adapter work, and it has to keep coverage, original bytes, page and asset locators, and stated uncertainty |
| Hardware | Windows 11, a Ryzen desktop CPU, 32 GB RAM, integrated graphics | These shaped the defaults. They aren't a minimum or a performance promise. Test with representative sources, because big libraries and lots of media change both time and storage needs |
| Library scope | One modular research library with explicit project, module and domain boundaries | One module with domain tags is the recommended layout, so invent can bridge across everything. Add a module only for material that has to stay apart. Separate libraries are possible, each with a unique id and its own deletion ledger. Promotion tiers and operational memory aren't defaults |
| Who owns meaning | Immutable canonical revisions plus full prose; search and wiki are generated | Fixed. Never make a copied wiki or database a second writer |
| Contradictions | Judgments and scoped supersession that keep the evidence | Fixed. Never swap them for "newest wins" or a bare, unexplained confidence number |
| Evaluation | Source-grounded regression checks plus independent application checks | Your model and material. The isolated Codex runner needs its access restrictions verified, and another agent's evaluator needs its own isolation evidence |
| Retention | Archive, withdrawal and explicitly authorized purge | Choose a backup and retention policy. Originals are kept until an authorized purge; backups and copies held by external providers need their own handling |

## Semantic search embedder

Recall answers from keyword search and the library's links, and adds semantic search (matching by meaning) when the best keyword match holds less than 70% of the question's words. Semantic search needs every account and text passage embedded once, by a model. Which model is a setup choice, under `embedder` in `<state>/config.json`, set by `scripts/create-library.mjs --embedder` or changed later with `scripts/configure-embedder.mjs`.

| Choice | What runs | Cost and speed | Choose it when |
|---|---|---|---|
| `local` (default) | QMD's EmbeddingGemma 300M, on this machine's CPU | Free. Version 0.4.0 took 75 to 93 minutes for a 364-page book on a 16-core Ryzen, embedding every record; 0.5.0 embeds about half as many chunks (not yet measured). Runs in the background after publishing | Nothing may leave the machine, or you have no API account |
| `api` | Any OpenAI-compatible `/embeddings` endpoint: OpenRouter, OpenAI, or a local Ollama or LM Studio server | An estimated minute per book (no live run yet). Through OpenRouter, US$0.01 to 0.20 per million tokens, and a book is about 400,000 tokens, so under 10 US cents | You're fine sending the books' text to that provider, or you run a local embedding server |
| `off` | Nothing | None | Keyword and link search are enough |

An `api` embedder needs three things: `base_url` (for OpenRouter, `https://openrouter.ai/api/v1`), `model` (any model the endpoint serves; see the table below), and the key. Give the key one of two ways. `api_key_env` names an environment variable that holds it: set the variable for the app that runs Know Fu, then restart that app so its chats see it. `api_key_file` is the absolute path of a file you create that holds only the key, for a host that doesn't pass your environment variables to Know Fu (Codex may not; untested). Know Fu never writes the key anywhere. With both set, the variable wins. A server on localhost needs no key. Optional settings: `dimensions` keeps only the first N dimensions (only for models trained for that), `batch_size` (default 32) and `max_characters` per document (default 24,000).

### Hosted embedding models and prices

The embedding models OpenRouter listed on 20 October 2026 (`GET https://openrouter.ai/api/v1/embeddings/models`), with its price per million input tokens. Prices change, so check the list before choosing. A 364-page book's search text is about 400,000 tokens, so even the dearest of these costs under 10 US cents per book. The same models are often available straight from their makers, at their own prices.

| Model id on OpenRouter | Price per million tokens | Notes |
|---|---|---|
| `qwen/qwen3-embedding-8b` | US$0.01 | Open weights, 40,960-token context |
| `baai/bge-m3` | US$0.01 | Open weights, 8,194-token context |
| `qwen/qwen3-embedding-4b` | US$0.02 | Open weights, 32,768-token context |
| `openai/text-embedding-3-small` | US$0.02 | 8,192-token context |
| `voyageai/voyage-4-lite` | US$0.02 | 32,000-token context; shares one embedding space with the other Voyage 4 models |
| `voyageai/voyage-4` | US$0.06 | 32,000-token context |
| `mistralai/mistral-embed-2312` | US$0.10 | 8,192-token context |
| `voyageai/voyage-4-large` | US$0.12 | 32,000-token context |
| `openai/text-embedding-3-large` | US$0.13 | 8,192-token context |
| `google/gemini-embedding-001` | US$0.15 | 20,000-token context |
| `google/gemini-embedding-2` | US$0.20 | 8,192-token context; also accepts images, audio and video, which Know Fu doesn't send yet |
| `nvidia/nemotron-3-embed-1b:free` | free | 32,768-token context; free listings can carry rate limits |

A local embedding server (Ollama or LM Studio, with a model such as `nomic-embed-text`) costs nothing to run and keeps the text on your machine; point `base_url` at it, for example `http://localhost:11434/v1`.

Which model matters less than you'd think. Recall leans on keywords and links, the semantic channel only joins when keywords fall short, and the agent can rephrase its own question. Between the strong hosted models, benchmark differences are a few points. What gets embedded matters more, and Know Fu embeds only accounts and text passages, the records recall can return.

Changing the embedder starts a fresh set of vectors: the next reindex embeds everything once. Vectors live under `<state>/cache/vectors/` (API) or `<state>/cache/qmd/` (local) and can be rebuilt. A purge stops any running embedding and deletes the library's stored vectors, so the next reindex embeds the whole library again (with an API embedder, a few cents per book).

## The storage conversation

This is the conversation to have before creating anything. Show the real resolved paths for four things together: the code, the library, the runtime state and ledger, and backups. Let the person accept or edit them in one go. If they have a large SSD or data drive, original media should live there. Explain the one distinction that matters most: the search index and the wiki can be rebuilt, but originals, canonical records and deletion history can't.

For a small single-user install, use a local disk and one writer. Keep live database files out of OneDrive or Dropbox-style sync, and use the export workflow for backups instead. Putting backup archives in synced storage is fine.

Changing `KB_STATE_DIR` on an existing install doesn't move its ledger or config. Moving a library or state folder is a migration: back it up and validate it, and never treat it as a fresh `init`. Never create an empty ledger to get past missing deletion history.

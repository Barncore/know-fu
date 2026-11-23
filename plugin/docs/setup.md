# Setting up Know Fu

[Overview](../../README.md) · [How it works](architecture.md)

These steps install Know Fu for Claude Code or Codex and create a library. An agent can follow them for you: where a step says "ask", it means ask the owner with your question tool before doing it. Paths below use `<repo>` for this repository's folder.

## Before you start

| Need | For | Check |
|---|---|---|
| Node 22.18 or newer (24 recommended) | Everything | `node -v` |
| git | The library's history | `git --version` |
| Poppler | PDFs | `pdftotext -v` must print the word Poppler |
| pandoc | EPUB, DOCX, HTML | `pandoc -v` |
| FFmpeg and FFprobe | Audio and video | `ffmpeg -version` |
| A transcription API key | Audio and video without a transcript | See "Audio and video" below |
| yt-dlp | Adding a video by its link | `yt-dlp --version` |
| Tesseract with its English data | Scanned PDF pages | `tesseract --list-langs` must list `eng` |

Only Node and git are required. Add the others when you first need them, and `kf_status` shows which it found. There are no packages to install and nothing to build. Each tool is found on PATH, or by its full path under `tools` in the config (`pdftotext`, `pdftoppm`, `ffmpeg`, `ffprobe`, `pandoc`, `ytdlp`, `tesseract`).

On Windows, `scoop install yt-dlp tesseract` installs both. Scoop's Tesseract comes without language data: put `eng.traineddata` from the `tesseract-ocr/tessdata_fast` repository on GitHub into its `tessdata` folder, or run `scoop install tesseract-languages` for every language. To read scans in other languages, set `"ocr": {"languages": "eng+deu"}` in the config.

On Windows, the `pdftotext` that Git for Windows puts on PATH is Xpdf's and won't work. Install Poppler with `winget install oschwartz10612.Poppler`. Know Fu looks in the winget folder by itself, so PATH order doesn't matter.

## 1. Choose where the library lives

Ask the owner. The library is a folder of Markdown files plus each source's original file, so it grows with what is ingested: a 360-page PDF adds about 5 MB. Put it somewhere that gets backed up and isn't inside this repository. A session opened in that folder is the home session, the only one that ingests.

## 2. Create it

```sh
node <repo>/plugin/engine/cli.ts init <library folder>
```

This creates the folders, a README for people, an `AGENTS.md` and `CLAUDE.md` for agents opened there, a `.gitignore`, and a git repository. It also writes the library's path to `~/.know-fu/config.json`. If that file already exists, a dated copy is saved beside it first and its other settings are kept.

## 3. Install the plugin

**Claude Code.** From a clone, in a terminal:

```sh
claude plugin marketplace add <repo>
```

```sh
claude plugin install know-fu@know-fu
```

Or straight from GitHub, typed in a Claude Code session (2.1.275 or later): `/plugin install know-fu --marketplace Barncore/know-fu`.

Then restart the app or start a new session. The plugin folder is self-contained, engine included, so it runs wherever Claude Code keeps it. To update later, pull the repository and run `claude plugin update know-fu@know-fu`.

**Codex.** Run:

```sh
node <repo>/scripts/install-codex.mjs
```

It copies the plugin to `~/plugins/know-fu` (keeping the previous copy in `~/.know-fu/codex-plugin-previous`) and writes the machine-local launch file there. Then refresh Codex with `codex plugin add know-fu@personal` and restart it.

## 4. Check it

In a new session, invoke the skill (`/know-fu:know-fu` in Claude Code, `$know-fu` in Codex) and ask for the status. `kf_status` reports the library path, whether this session is the home session, and which extraction tools it found. From a shell, the same check is:

```sh
node <repo>/plugin/engine/cli.ts status
```

## 5. First ingest

Open a session in the library folder, invoke the skill, and name a source and where it belongs: "ingest `<file>` into audio/mixing". The agent follows the ingest guide. For a long book it will ask before starting more than five reader subagents, because they use a lot of tokens.

## Settings

All in `~/.know-fu/config.json`. Set `KNOW_FU_CONFIG` to use a different file.

| Key | Meaning |
|---|---|
| `library` | The library folder |
| `deliberate_use` | `true` (the default) keeps the tools closed in a chat until the skill is invoked there. `false` opens them everywhere |
| `pins` | Project folder to topic paths. Written by `kf_pin`; sessions in a pinned project start with those topics' principles in context |
| `tools` | Full paths for `pdftotext`, `pdftoppm`, `ffmpeg`, `ffprobe`, `pandoc`, when PATH finds the wrong one or none |
| `embedder` | Optional semantic search. See below |
| `transcription` | See below |

### Semantic search

Keyword search works with no setup. To also find accounts by meaning, which helps most when a question uses different words from the library or comes from another field, add an OpenAI-compatible embeddings endpoint:

```json
"embedder": {
  "base_url": "https://openrouter.ai/api/v1",
  "model": "openai/text-embedding-3-small",
  "api_key_file": "<a file that holds only the key>"
}
```

`api_key_env` names an environment variable as an alternative to a file, and a local server such as Ollama needs no key. The next `kf_check` in the home session sends each principle, account and topic frame to that endpoint and stores the vectors in the library's `.knowfu` folder; after that only new or changed ones are sent. Each recall sends the question. Source text is never sent. `min_similarity` (default 0.74, measured on one hosted model) is how close a match must be before recall trusts meaning alone; set it per model. Remove the `embedder` block to turn it off.

### Audio and video

A transcript file (`.srt`, `.vtt`, or text with a timestamp at the start of each line) needs no API. To transcribe recordings, add an OpenAI-compatible transcription endpoint:

```json
"transcription": {
  "endpoint": "https://openrouter.ai/api/v1/audio/transcriptions",
  "model": "microsoft/mai-transcribe-2",
  "api_key_file": "<a file that holds only the key>",
  "cost_per_minute": 0.00167,
  "currency": "USD"
}
```

`api_key_env` names an environment variable to read the key from, as an alternative to a file. The owner creates the key and the file; an agent never handles the key itself. Before any audio is sent, Know Fu estimates the cost from the recording's length and stops until the call carries `max_cost` at or above the estimate, which the agent sets only after the owner approves the amount. Each five-minute chunk's result is saved as it arrives, so a failure never pays for the same audio twice.

The model above is the owner's choice as of 23 November 2026, at 0.10 USD an hour of audio. Any model works that answers `verbose_json` with timestamps. Know Fu asks for word and segment timestamps and uses whichever the model does well: a model that returns a timed word list and few segments gets its sentences cut from the words, so each line of the transcript carries the time it was spoken. A model with no timestamps still transcribes, with one timestamp per five minutes. If you use OpenAI directly, note that `whisper-1`, its only model with timestamps, shuts down on 26 February 2027.

Audio goes up in five-minute chunks with eight seconds of padding either side, and only the words inside each chunk's own five minutes are kept, because a model mishears the word at the edge of what it is given. `kf_source` takes a `topic` and a list of `terms` for a recording. The topic's vocabulary and keywords, with the terms, go to the model as key terms (`keyterms[]`), so it hears the subject's own words. A model that refuses key terms is asked again without them. A busy provider (429, or a server error) is asked again up to five times, waiting as long as it says.

With yt-dlp installed, `kf_source` takes a video link in place of a file. `action: "info"` shows what the link points at first: its title, length, top resolution, whether the page has captions, the transcription cost, and the description, which often names the terms worth sending. Adding the link checks the cost against `max_cost` before anything is fetched, then downloads the video at the best size it has, up to 4K, and keeps it in the source's `original` folder whatever its size. Captions from the page, the uploader's own or automatic ones, are saved as `captions.txt` beside the transcript: a second hearing of the same words, to read where the transcript is in doubt.

## Moving or backing up a library

The library is one folder. Copy it to back it up. To move it, move the folder and change `library` in the config. Nothing else refers to its location. Originals, page images and frames aren't in the library's git history, so back up the folder, not only the repository.

## Coming from 0.5

Version 0.6 doesn't read 0.5 libraries, and it changes nothing in them. A 0.5 library, its state folder and the 0.5 engine checkout keep working as they were, and the 0.5 code is on the `records-engine-0.5` branch. The config file can hold both: 0.5 reads its per-agent sections and 0.6 reads `library`. To bring a 0.5 library's sources into 0.6, ingest them again; the old notes can't be converted, because 0.6 stores a different thing.

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

Only Node and git are required. Add the others when you first need them. There are no packages to install and nothing to build.

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
| `transcription` | See below |

### Audio and video

A transcript file (`.srt`, `.vtt`, or text with a timestamp at the start of each line) needs no API. To transcribe recordings, add an OpenAI-compatible transcription endpoint:

```json
"transcription": {
  "endpoint": "https://api.openai.com/v1/audio/transcriptions",
  "model": "whisper-1",
  "api_key_file": "<a file that holds only the key>",
  "cost_per_minute": 0.006,
  "currency": "USD"
}
```

`api_key_env` names an environment variable to read the key from, as an alternative to a file. The owner creates the key and the file; an agent never handles the key itself. Before any audio is sent, Know Fu estimates the cost from the recording's length and stops until the call carries `max_cost` at or above the estimate, which the agent sets only after the owner approves the amount. Each five-minute chunk's result is saved as it arrives, so a failure never pays for the same audio twice.

## Moving or backing up a library

The library is one folder. Copy it to back it up. To move it, move the folder and change `library` in the config. Nothing else refers to its location. Originals, page images and frames aren't in the library's git history, so back up the folder, not only the repository.

## Coming from 0.5

Version 0.6 doesn't read 0.5 libraries, and it changes nothing in them. A 0.5 library, its state folder and the 0.5 engine checkout keep working as they were, and the 0.5 code is on the `records-engine-0.5` branch. The config file can hold both: 0.5 reads its per-agent sections and 0.6 reads `library`. To bring a 0.5 library's sources into 0.6, ingest them again; the old notes can't be converted, because 0.6 stores a different thing.

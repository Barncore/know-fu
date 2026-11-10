# Working on Know Fu

Start with `docs/NORTH_STAR.md` before you change the architecture, ingestion or retrieval. It holds what the product is for, the theory behind the design, and every decision the owner has made. `plugin/docs/architecture.md` explains how the system works today, and `docs/REBUILD.md` records why 0.6 replaced the earlier design and what has been shown to work. A plan is never evidence that something works.

## The shape of the repository

| Path | What it holds |
|---|---|
| `plugin/` | Everything a host installs: the engine, the skill and its guides, the hooks, the launcher, the docs |
| `plugin/engine/` | The engine. TypeScript that Node runs directly: no build, no dependencies |
| `plugin/skills/know-fu/` | `SKILL.md` and the three guides an agent follows: `ingest.md`, `format.md`, `use.md` |
| `plugin/scripts/` | `launch.mjs` (starts the MCP server), `gate.mjs` (deliberate use), `session.mjs` (pinned topics) |
| `test/` | Tests, with an invented fixture library built in a temp folder |
| `scripts/` | `install-codex.mjs`, `check-release.mjs` |
| `docs/` | Intent and the rebuild record |

The owner's library is never in this repository. It is a separate folder named in `~/.know-fu/config.json`.

## Installing

Follow `plugin/docs/setup.md`. Ask the owner where the library should live before creating it, and keep choices they already made.

## Changing the engine

The Markdown files are the library, and `plugin/skills/know-fu/references/format.md` is the contract for them. The checker (`engine/check.ts`) enforces that contract, so a format change is a change to the guide, the checker and a test together. The engine never calls a model and never needs a package: keep it that way, because "nothing to install" is what makes a clean clone work.

Type stripping only removes types. Use `import type` for types, write `.ts` in import paths, and avoid enums, namespaces and parameter properties.

Three rules hold on every read path, including any you add: retired accounts are never returned, an account that disputes or qualifies a loaded account is always named whatever the budget, and nothing outside `ideas/` is presented as resting on an idea.

Anything mechanical that an agent keeps getting wrong belongs in the checker, not in louder prose in a guide. Anything the checker can't judge (is this a retelling, is this principle a slogan) belongs in the guide as a question, with one example.

## Changing the guides

The guides are read by an agent with none of your context, every time it ingests. State what must be true at the end and why, and keep steps only where their order matters. Before adding a sentence, ask whether the agent would do that anyway. `SKILL.md` stays under about 900 words, because a host keeps only the first 5,000 tokens of a skill after a long conversation is compacted.

Test a guide change the way it will be used: give a fresh agent the skill and a real source, and read what it produced and where it stumbled. The 0.6 guides were tested this way, and the findings are in `docs/REBUILD.md`.

## Before you commit

Run `npm test`. Run `npm run check:release -- --staged`, which looks through the staged files for private paths, credential patterns and broken links, and makes sure the change log came along. Then look at what you're about to push yourself: the repository is public.

A change under `plugin/` bumps the version in `package.json` and both plugin manifests, because hosts key their installed copy by version. Every finished change to behaviour, format, setup or guides gets a dated entry in `CHANGELOG.md` and a matching doc update, or an explicit "Documentation impact: none" with the reason. Things learned the hard way go in `LESSONS.md`.

Docs and tool text call each thing by one name: domain, topic, principle, account, source, idea, unit, home session. Two words for one thing teach the owner and the agents two things.

## Branches

`main` is the official version and `staging` is where work lands first. Commit and push to `staging` unless the owner says to push to `main`. When the owner says `main`, push `staging` too so the two stay level, tag the version on `main` as `v<version>`, and push the tag. Merge with a merge commit, never a squash. Commits use the repository's configured identity.

`records-engine-0.5` holds the 0.5 engine as it was on 20 October 2026. Don't merge it anywhere.

## What never goes in the repository

The owner's library, sources, credentials, the machine-local `.mcp.json` that the Codex install writes, conversation exports, and anything naming a private path or a source the owner ingested. The root `.gitignore` admits only release-owned paths.

## Influences aren't dependencies

`plugin/docs/lineage.md` separates what the code runs on from where ideas came from. Before copying code from any project named there, record its provenance, licence and tests in that file and the change log.

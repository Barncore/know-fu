# The Know Fu plugin

This folder is the whole product. A host (Claude Code or Codex) installs it as it is, and it runs with nothing else to install or build.

| Path | What it is |
|---|---|
| `skills/know-fu/SKILL.md` | The skill an agent follows, with three guides in `references/`: `ingest.md`, `format.md`, `use.md` |
| `engine/` | The engine: extraction, the checker, search and the nine `kf_*` tools. TypeScript that Node runs directly. `engine/cli.ts` is the command line |
| `scripts/launch.mjs` | Starts the MCP server for a chat |
| `scripts/gate.mjs`, `scripts/session.mjs`, `hooks/hooks.json` | Claude Code hooks: deliberate use, and pinned topics at session start |
| `.claude-plugin/`, `.codex-plugin/` | Each host's manifest |
| `docs/` | [Setup](docs/setup.md), [how it works](docs/architecture.md), [lineage](docs/lineage.md) |

In Claude Code (2.1.275 or later) it installs in one step:

```
/plugin install know-fu --marketplace Barncore/know-fu
```

Your library isn't here. It is a folder of your own, named in `~/.know-fu/config.json`. [Setup](docs/setup.md) creates it and covers Codex.

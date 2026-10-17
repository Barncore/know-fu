import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';
const app = path.resolve(import.meta.dirname, '..');
const { values } = parseArgs({
  options: {
    target: { type: 'string' },
    backup: { type: 'string' },
    help: { type: 'boolean' },
  },
});
if (values.help) {
  console.log(`Usage: node scripts/install-plugin.mjs [--target DIR] [--backup DIR]

Copies this checkout's whole plugin folder to Codex's personal plugin folder (default ~/plugins/know-fu) and replaces what was there, so no file from an older version stays behind.
The copy it replaces moves to --backup (default ~/.know-fu/codex-plugin-previous), which holds only the most recent previous install.
It checks the package first and changes nothing in this checkout.
Run scripts/configure-plugin.mjs --agent codex first. Afterwards, refresh Codex with: codex plugin add know-fu@personal`);
  process.exit(0);
}
const stage = path.join(app, 'plugin');
const target = path.resolve(values.target ?? path.join(os.homedir(), 'plugins/know-fu'));
const backup = path.resolve(values.backup ?? path.join(os.homedir(), '.know-fu/codex-plugin-previous'));
const exists = (p) => fs.stat(p).then(() => true, () => false);
if (!(await exists(path.join(stage, '.mcp.json'))))
  throw Error('Run scripts/configure-plugin.mjs --agent codex with the approved storage and media choices before installing.');
// Check, never package: an install must not rewrite the engine's bundled files (setup trial, 17 October 2026).
execFileSync(process.execPath, [path.join(app, 'scripts/package-plugin.mjs'), '--check'], { stdio: ['ignore', 'ignore', 'inherit'] });
// Build the new copy beside the target and swap it in, so a failed copy leaves the old install working.
const fresh = `${target}.installing`;
await fs.rm(fresh, { recursive: true, force: true });
await fs.cp(stage, fresh, { recursive: true });
let previous = null;
if (await exists(target)) {
  await fs.rm(backup, { recursive: true, force: true });
  await fs.mkdir(path.dirname(backup), { recursive: true });
  await fs.cp(target, backup, { recursive: true });
  await fs.rm(target, { recursive: true, force: true });
  previous = backup;
}
await fs.rename(fresh, target);
console.log(JSON.stringify({ plugin: target, engine: app, previous, next: 'codex plugin add know-fu@personal' }));

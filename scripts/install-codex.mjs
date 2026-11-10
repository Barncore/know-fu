// Installs the plugin for Codex: copies this checkout's plugin folder to Codex's personal plugin folder
// (default ~/plugins/know-fu) and writes the machine-local .mcp.json that starts the engine from that copy.
// The copy it replaces moves to ~/.know-fu/codex-plugin-previous. Nothing in this checkout changes.
// Afterwards, refresh Codex with: codex plugin add know-fu@personal
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';

const { values } = parseArgs({ options: { target: { type: 'string' }, backup: { type: 'string' }, help: { type: 'boolean' } } });
if (values.help) {
  console.log('Usage: node scripts/install-codex.mjs [--target DIR] [--backup DIR]');
  process.exit(0);
}
const stage = path.resolve(import.meta.dirname, '..', 'plugin');
const target = path.resolve(values.target ?? path.join(os.homedir(), 'plugins', 'know-fu'));
const backup = path.resolve(values.backup ?? path.join(os.homedir(), '.know-fu', 'codex-plugin-previous'));
const exists = p => fs.stat(p).then(() => true, () => false);

// Build the new copy beside the target and swap it in, so a failed copy leaves the old install working.
const fresh = `${target}.installing`;
await fs.rm(fresh, { recursive: true, force: true });
await fs.cp(stage, fresh, { recursive: true, filter: source => path.basename(source) !== '.mcp.json' });
// Codex runs a plugin from its own cache and doesn't fill in a plugin-folder placeholder, so the launch
// names the launcher in the installed copy by its full path.
const launch = { mcpServers: { 'know-fu': { command: process.execPath, args: [path.join(target, 'scripts', 'launch.mjs')], env: { KB_ACTOR: 'codex' } } } };
await fs.writeFile(path.join(fresh, '.mcp.json'), JSON.stringify(launch, null, 2) + '\n');
let previous = null;
if (await exists(target)) {
  await fs.rm(backup, { recursive: true, force: true });
  await fs.mkdir(path.dirname(backup), { recursive: true });
  await fs.cp(target, backup, { recursive: true });
  await fs.rm(target, { recursive: true, force: true });
  previous = backup;
}
await fs.mkdir(path.dirname(target), { recursive: true });
await fs.rename(fresh, target);
console.log(JSON.stringify({ plugin: target, previous, next: 'codex plugin add know-fu@personal' }));

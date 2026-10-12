import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
const app = path.resolve(import.meta.dirname, '..');
const { values } = parseArgs({
  options: {
    agent: { type: 'string' },
    library: { type: 'string' },
    corpus: { type: 'string' },
    state: { type: 'string' },
    media: { type: 'string' },
    distro: { type: 'string' },
    project: { type: 'string' },
    config: { type: 'string' },
    output: { type: 'string' },
    'specialist-tools': { type: 'boolean' },
    'advanced-tools': { type: 'boolean' },
    'allow-automatic-use': { type: 'boolean' },
    replace: { type: 'boolean' },
    help: { type: 'boolean' },
  },
});
if (values.help) {
  console.log(`Usage: node scripts/configure-plugin.mjs --agent claude|codex --library ABSOLUTE_PATH --state ABSOLUTE_PATH --media native|wsl [--distro Ubuntu] [--specialist-tools] [--allow-automatic-use] [--config FILE] [--replace]
Codex only: [--project ABSOLUTE_PATH] [--output FILE]

Writes this agent's section of Know Fu's config file (default ~/.know-fu/config.json), which the plugin's launcher reads.
The engine folder recorded there is this checkout. For Codex it also writes the machine-local plugin/.mcp.json that starts the launcher.
--specialist-tools also lists kb_lifecycle, kb_propose, kb_change, kb_retrieve and kb_evaluate.
--allow-automatic-use turns off the gate that keeps Know Fu's tools closed until the user invokes the skill (Claude Code).
It refuses to change an existing section unless --replace is given. It doesn't install services, initialize a library or move data.`);
  process.exit(0);
}
const agent = values.agent;
if (!['claude', 'codex'].includes(agent)) throw Error('Choose --agent claude or --agent codex.');
const library = values.library ?? values.corpus;
for (const [key, value] of [['library', library], ['state', values.state]])
  if (!value || !path.isAbsolute(value)) throw Error(`Choose an absolute --${key} path after reviewing storage locations.`);
if (!['native', 'wsl'].includes(values.media)) throw Error('Choose --media native or wsl explicitly.');
if (values.project && !path.isAbsolute(values.project)) throw Error('Use an absolute --project workspace path.');

const section = {
  engine: app,
  library: path.resolve(library),
  state: path.resolve(values.state),
  media: values.media,
  ...(values.media === 'wsl' ? { wsl_distro: values.distro ?? 'Ubuntu' } : {}),
  specialist_tools: Boolean(values['specialist-tools'] || values['advanced-tools']),
};
const configPath = path.resolve(values.config ?? process.env.KNOW_FU_CONFIG ?? path.join(os.homedir(), '.know-fu', 'config.json'));
let config = { schema_version: 1, deliberate_use: true, agents: {} };
try {
  config = JSON.parse(await fs.readFile(configPath, 'utf8'));
} catch (error) {
  if (error.code !== 'ENOENT') throw Error(`Can't read ${configPath}: ${error.message}`);
}
config.agents ??= {};
const previous = config.agents[agent];
// Changing a working installation's paths is a decision, not a side effect of rerunning setup.
if (previous && JSON.stringify(previous) !== JSON.stringify(section) && !values.replace)
  throw Error(`${configPath} already has different settings for ${agent}: ${JSON.stringify(previous)}. Rerun with --replace to change them.`);
config.agents[agent] = section;
if (values['allow-automatic-use']) config.deliberate_use = false;
config.deliberate_use ??= true;

let launcher;
if (agent === 'codex') {
  launcher = path.resolve(values.output ?? path.join(app, 'plugin/.mcp.json'));
  // Refuse before writing anything, so a refused run leaves both files as they were.
  const exists = await fs.access(launcher).then(() => true, () => false);
  if (exists && !values.replace) throw Error(`${launcher} already exists. Look at it, then rerun with --replace to change it.`);
}
await fs.mkdir(path.dirname(configPath), { recursive: true });
await fs.writeFile(configPath, JSON.stringify(config, null, 2) + '\n');
if (launcher) {
  // Codex runs the plugin from its own cache, so point at the launcher in this checkout by absolute path.
  const env = { KB_ACTOR: 'codex', KNOW_FU_CONFIG: configPath };
  if (values.project) env.KB_PROJECT = path.resolve(values.project);
  await fs.mkdir(path.dirname(launcher), { recursive: true });
  await fs.writeFile(launcher, JSON.stringify({ mcpServers: { 'know-fu': { command: process.execPath, args: [path.join(app, 'plugin/scripts/launch.mjs')], env } } }, null, 2) + '\n');
}
console.log(JSON.stringify({ config: configPath, agent, ...section, deliberate_use: config.deliberate_use, ...(launcher ? { codex_launcher: launcher } : {}) }));

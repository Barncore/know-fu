import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const app = path.resolve(import.meta.dirname, '..');
const plugin = path.join(app, 'plugin');
const check = process.argv.includes('--check');
const read = async p => JSON.parse(await fs.readFile(p, 'utf8'));
const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const schemaNames = (await fs.readdir(path.join(app, 'contracts/schemas'))).filter(n => n.endsWith('.schema.json')).sort();
const copies = schemaNames.map(name => [`contracts/schemas/${name}`, `contracts/schemas/${name}`]);
copies.push(['config/transcription.example.json', 'examples/transcription.example.json']);
const manifest = {
  engine_version: (await read(path.join(app, 'package.json'))).version,
  schema_version: (await read(path.join(app, 'contracts/schemas/record.schema.json'))).properties.schema_version.const,
  authority: 'Engine contracts and configuration examples; bundled copies are read-only references.',
  files: []
};
for (const [source, bundled] of copies) {
  const bytes = await fs.readFile(path.join(app, source));
  manifest.files.push({ source, bundled, sha256: digest(bytes) });
  const target = path.join(plugin, bundled);
  if (check) {
    if (digest(await fs.readFile(target)) !== digest(bytes)) throw Error(`Stale bundled file: ${bundled}`);
  } else {
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, bytes);
  }
}
const serialized = JSON.stringify(manifest, null, 2) + '\n';
const manifestPath = path.join(plugin, 'engine-contracts.json');
if (check) {
  if (await fs.readFile(manifestPath, 'utf8') !== serialized) throw Error('Stale contract manifest');
} else await fs.writeFile(manifestPath, serialized);
const bundledNames = (await fs.readdir(path.join(plugin, 'contracts/schemas'))).sort();
if (JSON.stringify(bundledNames) !== JSON.stringify(schemaNames)) throw Error('Unexpected bundled schema; reconcile retired contracts explicitly');

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(await read(path.join(app, 'contracts/schemas/corpus.schema.json')));
if (!validate(await read(path.join(plugin, 'examples/corpus.example.json')))) throw Error(JSON.stringify(validate.errors));

async function walk(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(entries.map(e => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
  return nested.flat();
}
let links = 0;
for (const file of (await walk(plugin)).filter(p => p.endsWith('.md'))) {
  const content = await fs.readFile(file, 'utf8');
  for (const match of content.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const target = match[1].replace(/^<|>$/g, '');
    if (/^[a-z][a-z0-9+.-]*:|^#/i.test(target)) continue;
    const resolved = path.resolve(path.dirname(file), decodeURIComponent(target.split('#')[0]));
    const relative = path.relative(plugin, resolved);
    if (relative.startsWith('..') || path.isAbsolute(relative)) throw Error(`Link leaves package: ${target}`);
    await fs.access(resolved);
    links++;
  }
}
// Both agents load the same plugin folder: Codex through .codex-plugin, Claude Code through .claude-plugin.
const version = (await read(path.join(app, 'package.json'))).version;
const codex = await read(path.join(plugin, '.codex-plugin/plugin.json'));
const claude = await read(path.join(plugin, '.claude-plugin/plugin.json'));
const market = await read(path.join(app, '.claude-plugin/marketplace.json'));
for (const [label, manifest] of [['Codex', codex], ['Claude Code', claude]]) {
  if (manifest.name !== 'know-fu' || manifest.version !== version) throw Error(`${label} manifest name or version is out of step with package.json`);
}
const skill = await fs.readFile(path.join(plugin, 'skills/know-fu/SKILL.md'), 'utf8');
// Using Know Fu is deliberate: the skill never loads on its own, in either agent.
if (!/^disable-model-invocation: true$/m.test(skill.split('---')[1] ?? '')) throw Error('SKILL.md must set disable-model-invocation: true');
if (!/allow_implicit_invocation:\s*false/.test(await fs.readFile(path.join(plugin, 'skills/know-fu/agents/openai.yaml'), 'utf8'))) throw Error('agents/openai.yaml must set allow_implicit_invocation: false');
const server = claude.mcpServers?.['know-fu'];
// The launcher reads Know Fu's own config file. Plugin options don't reach the copy the Claude desktop app loads, so none may appear in the launch.
if (server?.args?.[0] !== '${CLAUDE_PLUGIN_ROOT}/scripts/launch.mjs' || server.env?.KB_ACTOR !== 'claude' || server.env?.KB_PROJECT !== '${CLAUDE_PROJECT_DIR}') throw Error('Claude Code server must start scripts/launch.mjs from the plugin, as claude, bound to the session project');
if (JSON.stringify(claude).includes('user_config') || claude.userConfig) throw Error('The Claude Code manifest must not use plugin options; the launcher reads ~/.know-fu/config.json');
const hooks = await read(path.join(plugin, 'hooks/hooks.json'));
if (!JSON.stringify(hooks.hooks?.PreToolUse ?? []).includes('gate.mjs\\" tool')) throw Error('hooks/hooks.json must gate Know Fu tool calls with scripts/gate.mjs');
for (const script of ['scripts/launch.mjs', 'scripts/gate.mjs']) await fs.access(path.join(plugin, script));
if (market.plugins?.[0]?.name !== claude.name || market.plugins[0].source !== './plugin') throw Error('The Claude Code marketplace must list ./plugin');

// One version number names one set of plugin files. Installed copies are keyed by version, so a change
// shipped under an old number never reaches people who already have it (setup trial, 12 October 2026).
const lockPath = path.join(plugin, 'release.json');
const pluginFiles = (await walk(plugin)).map(p => path.relative(plugin, p).split(path.sep).join('/')).filter(p => p !== 'release.json' && p !== '.mcp.json').sort();
const lines = [];
// Line endings are normalized first: Git may check text files out with CRLF on one machine and LF on another.
for (const file of pluginFiles) lines.push(`${file}\0${digest((await fs.readFile(path.join(plugin, file), 'latin1')).replace(/\r\n/g, '\n'))}`);
const lock = { version, plugin_sha256: digest(lines.join('\n')), files: pluginFiles.length };
const lockText = JSON.stringify(lock, null, 2) + '\n';
let committed = null;
try {
  committed = JSON.parse(execFileSync('git', ['show', 'HEAD:plugin/release.json'], { cwd: app, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }));
} catch {}
if (committed?.version === version && committed.plugin_sha256 !== lock.plugin_sha256)
  throw Error(`Plugin files changed since version ${version} was committed. Bump the version in package.json and both plugin manifests, then run node scripts/package-plugin.mjs.`);
if (check) {
  if ((await fs.readFile(lockPath, 'utf8').catch(() => '')) !== lockText) throw Error('Stale plugin/release.json; run node scripts/package-plugin.mjs');
} else await fs.writeFile(lockPath, lockText);
console.log(JSON.stringify({ mode: check ? 'checked' : 'packaged', schemas: schemaNames.length, examples_valid: true, relative_links: links, manifests: ['codex', 'claude'], version, plugin_files: lock.files }));

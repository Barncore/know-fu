import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';

const app = path.resolve(import.meta.dirname, '..');
const usage = `Usage: node scripts/create-library.mjs --library PATH --state PATH --project PATH --id LIBRARY_ID --agent claude|codex|mcp [--title TITLE] [--domain id=Title]... [--python PATH] [--pdftotext PATH]

Creates a new library with one "research" module, binds it to one project folder, runs init, and writes <state>/config.json.
Paths must be absolute. It refuses to touch a library or config that already exists, so it can't overwrite an install.
--python is the converter environment's interpreter. --pdftotext is Poppler's; without it, the one on PATH is used if it's Poppler.`;
const { values } = parseArgs({
  options: {
    library: { type: 'string' }, state: { type: 'string' }, project: { type: 'string' },
    id: { type: 'string' }, title: { type: 'string' }, agent: { type: 'string' },
    domain: { type: 'string', multiple: true }, python: { type: 'string' }, pdftotext: { type: 'string' },
    help: { type: 'boolean' },
  },
});
if (values.help) { console.log(usage); process.exit(0); }
const fail = (message) => { console.error(`${message}\n\n${usage}`); process.exit(1); };

for (const key of ['library', 'state', 'project'])
  if (!values[key] || !path.isAbsolute(values[key])) fail(`--${key} needs an absolute path.`);
if (!/^[a-z0-9][a-z0-9_-]{2,63}$/.test(values.id ?? '')) fail('--id needs a library id unique to this library: lowercase letters, digits, - and _.');
if (!['claude', 'codex', 'mcp'].includes(values.agent)) fail('--agent is claude, codex or mcp.');
if (!existsSync(path.join(app, 'dist/cli.js'))) fail('Build the engine first: npm ci, then npm run build.');
if (existsSync(path.join(values.library, 'corpus.json'))) fail(`${values.library} already holds a library. Use it as it is; never re-initialize a library.`);
if (existsSync(path.join(values.state, 'config.json'))) fail(`${values.state} already has a config.json. Check it and edit it on purpose instead.`);
if (values.python && !existsSync(values.python)) fail(`No Python at ${values.python}.`);

const domains = (values.domain ?? ['general=General']).map((entry) => {
  const [domain_id, ...rest] = entry.split('=');
  if (!domain_id || !rest.length) fail(`--domain takes id=Title, not "${entry}".`);
  return { domain_id, title: rest.join('=') };
});

// PDF intake needs Poppler. Git for Windows puts Xpdf's pdftotext on PATH, which looks the same but isn't.
const pdftotext = values.pdftotext ?? null;
const probe = spawnSync(pdftotext ?? 'pdftotext', ['-v'], { encoding: 'utf8' });
const version = `${probe.stdout ?? ''}${probe.stderr ?? ''}`;
if (!/pdftotext version/i.test(version)) {
  if (pdftotext) fail(`Couldn't run ${pdftotext}.`);
  console.error('Warning: no pdftotext found. PDF intake needs Poppler; add its path to config.json later as "pdftotext".');
} else if (!/poppler/i.test(version)) {
  fail(`${pdftotext ?? 'The pdftotext on PATH'} isn't Poppler's (Git for Windows ships Xpdf's). Pass --pdftotext with the path to Poppler's pdftotext.`);
}

const research = ['research'];
const corpus = {
  schema_version: '1.1.0',
  corpus_id: values.id,
  title: values.title ?? `Know Fu library (${values.id})`,
  integration: values.agent,
  modules: [{ module_id: 'research', title: 'Research', description: 'Source-grounded knowledge.' }],
  domains,
  default_scope: { read_modules: research, write_modules: research, source_refs: [] },
  project_bindings: [{ project_id: values.project, read_modules: research, write_modules: research }],
};
const input = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'know-fu-library-')), 'corpus.json');
await fs.writeFile(input, JSON.stringify(corpus, null, 2));
await fs.mkdir(values.state, { recursive: true });
execFileSync(process.execPath, [path.join(app, 'dist/cli.js'), 'init', '--corpus', values.library, '--project', values.project, '--input', input], {
  env: { ...process.env, KB_STATE_DIR: values.state },
  stdio: ['ignore', 'ignore', 'inherit'],
});
await fs.rm(path.dirname(input), { recursive: true, force: true });

const config = { schema_version: 1 };
if (values.python) config.python = values.python;
if (pdftotext) config.pdftotext = pdftotext;
// Exclusive creation, so a config written in the meantime is never replaced.
await fs.writeFile(path.join(values.state, 'config.json'), JSON.stringify(config, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ library: values.library, state: values.state, project: values.project, id: values.id, agent: values.agent, config }, null, 2));

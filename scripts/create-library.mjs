import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';

const app = path.resolve(import.meta.dirname, '..');
const usage = `Usage: node scripts/create-library.mjs --library PATH --state PATH --home PATH --id LIBRARY_ID --agent claude|codex|mcp [--title TITLE] [--domain id=Title]... [--python PATH] [--pdftotext PATH]
  [--no-read-from-any-folder] [--no-save-from-any-folder] [--ingest-from-any-folder]

Creates a new library with one "research" module, makes --home its home folder (it can do everything there), runs init, and writes <state>/config.json.
--project is the older spelling of --home and still works.
Access from other folders, each a toggle:
  --read-from-any-folder     any folder may read the library (default on; --no-read-from-any-folder turns it off)
  --save-from-any-folder     any folder may file answers and keep ideas when asked (default on)
  --ingest-from-any-folder   any folder may ingest and write notes (default off; ingest happens in the home folder)
Saving or ingesting from any folder needs reading from any folder. Administering always stays with the home folder.
Paths must be absolute. It refuses to touch a library or config that already exists, so it can't overwrite an install.
--python is the converter environment's interpreter. --pdftotext is Poppler's; without it, the one on PATH is used if it's Poppler.`;

export const options = {
  library: { type: 'string' }, state: { type: 'string' }, home: { type: 'string' }, project: { type: 'string' },
  id: { type: 'string' }, title: { type: 'string' }, agent: { type: 'string' },
  domain: { type: 'string', multiple: true }, python: { type: 'string' }, pdftotext: { type: 'string' },
  'read-from-any-folder': { type: 'boolean', default: true },
  'save-from-any-folder': { type: 'boolean', default: true },
  'ingest-from-any-folder': { type: 'boolean', default: false },
  help: { type: 'boolean' },
};

/**
 * The corpus.json for a new library, from parsed flags. Throws an Error with a plain message
 * when the flags don't make a valid library. Exported so the access choices can be tested
 * without creating a library.
 */
export function libraryConfig(values) {
  const home = values.home ?? values.project;
  if (values.home && values.project && values.home !== values.project) throw Error('--home and --project name the same folder; give one.');
  if (!home || !path.isAbsolute(home)) throw Error('--home needs an absolute path: the folder where the library is ingested into and administered.');
  if (!/^[a-z0-9][a-z0-9_-]{2,63}$/.test(values.id ?? '')) throw Error('--id needs a library id unique to this library: lowercase letters, digits, - and _.');
  if (!['claude', 'codex', 'mcp'].includes(values.agent)) throw Error('--agent is claude, codex or mcp.');
  const read = values['read-from-any-folder'] ?? true;
  const save = values['save-from-any-folder'] ?? true;
  const ingest = values['ingest-from-any-folder'] ?? false;
  if ((save || ingest) && !read)
    throw Error('Saving or ingesting from any folder needs reading from any folder. Add --no-save-from-any-folder, or drop --no-read-from-any-folder.');
  const domains = (values.domain ?? ['general=General']).map((entry) => {
    const [domain_id, ...rest] = entry.split('=');
    if (!domain_id || !rest.length) throw Error(`--domain takes id=Title, not "${entry}".`);
    return { domain_id, title: rest.join('=') };
  });
  const research = ['research'];
  return {
    schema_version: '1.1.0',
    corpus_id: values.id,
    title: values.title ?? `Know Fu library (${values.id})`,
    integration: values.agent,
    modules: [{ module_id: 'research', title: 'Research', description: 'Source-grounded knowledge.' }],
    domains,
    default_scope: { read_modules: research, write_modules: research, source_refs: [] },
    // The home folder reads, saves, authors and administers every module.
    project_bindings: [{ project_id: home, read_modules: research, write_modules: research }],
    access: {
      home_project: home,
      ...(read
        ? { any_project: { read_modules: research, save_modules: save ? research : [], author_modules: ingest ? research : [] } }
        : {}),
    },
  };
}

async function main() {
  const fail = (message) => { console.error(`${message}\n\n${usage}`); process.exit(1); };
  let values;
  try {
    ({ values } = parseArgs({ options, allowNegative: true }));
  } catch (error) {
    fail(error.message);
  }
  if (values.help) { console.log(usage); process.exit(0); }
  for (const key of ['library', 'state'])
    if (!values[key] || !path.isAbsolute(values[key])) fail(`--${key} needs an absolute path.`);
  let corpus;
  try {
    corpus = libraryConfig(values);
  } catch (error) {
    fail(error.message);
  }
  const home = corpus.access.home_project;
  if (!existsSync(path.join(app, 'dist/cli.js'))) fail('Build the engine first: npm ci, then npm run build.');
  if (existsSync(path.join(values.library, 'corpus.json'))) fail(`${values.library} already holds a library. Use it as it is; never re-initialize a library.`);
  if (existsSync(path.join(values.state, 'config.json'))) fail(`${values.state} already has a config.json. Check it and edit it on purpose instead.`);
  if (values.python && !existsSync(values.python)) fail(`No Python at ${values.python}.`);

  // PDF intake needs Poppler. Git for Windows puts Xpdf's pdftotext on PATH, which looks the same but isn't.
  const pdftotext = values.pdftotext || null;
  const probe = spawnSync(pdftotext ?? 'pdftotext', ['-v'], { encoding: 'utf8' });
  const version = `${probe.stdout ?? ''}${probe.stderr ?? ''}`;
  if (!/pdftotext version/i.test(version)) {
    if (pdftotext) fail(`Couldn't run ${pdftotext}.`);
    console.error('Warning: no pdftotext found. PDF intake needs Poppler; add its path to config.json later as "pdftotext".');
  } else if (!/poppler/i.test(version)) {
    fail(`${pdftotext ?? 'The pdftotext on PATH'} isn't Poppler's (Git for Windows ships Xpdf's). Pass --pdftotext with the path to Poppler's pdftotext.`);
  }

  const input = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'know-fu-library-')), 'corpus.json');
  await fs.writeFile(input, JSON.stringify(corpus, null, 2));
  await fs.mkdir(values.state, { recursive: true });
  execFileSync(process.execPath, [path.join(app, 'dist/cli.js'), 'init', '--corpus', values.library, '--project', home, '--input', input], {
    env: { ...process.env, KB_STATE_DIR: values.state },
    stdio: ['ignore', 'ignore', 'inherit'],
  });
  await fs.rm(path.dirname(input), { recursive: true, force: true });

  const config = { schema_version: 1 };
  if (values.python) config.python = values.python;
  if (pdftotext) config.pdftotext = pdftotext;
  // Exclusive creation, so a config written in the meantime is never replaced.
  await fs.writeFile(path.join(values.state, 'config.json'), JSON.stringify(config, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ library: values.library, state: values.state, home, id: values.id, agent: values.agent, access: corpus.access, config }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
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
console.log(JSON.stringify({ mode: check ? 'checked' : 'packaged', schemas: schemaNames.length, examples_valid: true, relative_links: links }));

// Looks through the files git tracks (or, with --staged, the staged versions) before a push to a public
// repository: paths that must never be released, private installation paths, credential patterns, and
// relative links that point at nothing. With --staged it also checks that the change log came along.
// A pass means these patterns weren't found. It doesn't prove nothing private is there: read the diff.
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const app = path.resolve(import.meta.dirname, '..');
const staged = process.argv.includes('--staged');
const git = (...args) => execFileSync('git', args, { cwd: app, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const files = git('ls-files', '-z').split('\0').filter(Boolean);
if (!files.length) throw Error('No tracked files: stage the reviewed files first.');
const changed = staged ? git('diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z').split('\0').filter(Boolean) : [];
const deleted = staged ? new Set(git('diff', '--cached', '--name-only', '--diff-filter=D', '-z').split('\0').filter(Boolean)) : new Set();

const contents = new Map();
for (const file of files) {
  if (deleted.has(file)) continue;
  if (/^(?:test-output|node_modules|dist|\.runtime|\.venv|\.bench)\//.test(file) || /(?:^|\/)\.mcp\.json$/.test(file) || /(?:^|\/)(?:\.env(?:\..*)?|[^/]*\.(?:secret|key))$/.test(file))
    throw Error('This path must not be released: ' + file);
  if (/\.(?:jpg|jpeg|png|gif|webp|pdf)$/i.test(file)) continue;
  const content = staged ? git('show', ':' + file) : await fs.readFile(path.join(app, file), 'utf8');
  // Report the file only; never echo something that might be a credential.
  if (/(?:[A-Z]:[\\/]Users[\\/](?!<|you\b|name\b|me\b)[A-Za-z]|[A-Z]:[\\/]\d_(?:Storage|Other Projects))/.test(content)) throw Error('A private installation path in ' + file);
  if (/(?:gh[pousr]_[A-Za-z0-9]{30,}|sk-(?:proj-|or-)?[A-Za-z0-9_-]{35,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/.test(content)) throw Error('Something shaped like a credential in ' + file);
  contents.set(file, content);
}

let links = 0;
for (const [file, content] of contents) {
  // The change log is history: its older entries name files as they were when the entry was written.
  if (!file.endsWith('.md') || file === 'CHANGELOG.md') continue;
  const prose = content.replace(/```[\s\S]*?```/g, '');
  for (const match of prose.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
    const target = match[1].replace(/^<|>$/g, '');
    if (/^[a-z][a-z0-9+.-]*:|^#/i.test(target)) continue;
    const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(file), decodeURIComponent(target.split('#')[0])));
    if (!contents.has(resolved) && !files.some(p => !deleted.has(p) && p.startsWith(resolved.replace(/\/$/, '') + '/'))) throw Error(`Broken link in ${file}: ${target}`);
    links++;
  }
}

if (staged && changed.some(p => /^(?:plugin|scripts|test)\//.test(p))) {
  if (!changed.includes('CHANGELOG.md')) throw Error('A change to the plugin, scripts or tests needs a staged CHANGELOG entry.');
  const docs = changed.some(p => p === 'README.md' || /^docs\/.+\.md$/.test(p) || /^plugin\/(?:docs|skills)\/.+\.md$/.test(p));
  if (!docs && !/Documentation impact:\s*none/i.test(contents.get('CHANGELOG.md') ?? '')) throw Error('Update the affected docs, or record "Documentation impact: none" with the reason in the change log.');
}

const version = JSON.parse(contents.get('package.json')).version;
for (const manifest of ['plugin/.claude-plugin/plugin.json', 'plugin/.codex-plugin/plugin.json'])
  if (JSON.parse(contents.get(manifest)).version !== version) throw Error(`${manifest} is at a different version from package.json (${version}).`);

console.log(JSON.stringify({ files: contents.size, relative_links: links, staged, changed: changed.length, version, checks: 'passed' }));

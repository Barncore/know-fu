// Registering a source: copy the original, extract its text into citable units, and write the
// source page the agent fills in as it reads.
import fs from 'node:fs';
import path from 'node:path';
import type { Config } from './config.ts';
import { assemble, extract, isMedia, isVideo, sampleFrames, pdfPageImage, pdfText, frameAt } from './extract.ts';
import { formatFrontmatter, asText } from './frontmatter.ts';
import { loadLibrary, resolveLoc, unitText, unitLabel } from './library.ts';
import type { Library, Source } from './library.ts';
import { exists, fail, fileSha, isSlug, parseTime, slugify, today, writeJson, writeText } from './util.ts';

export type AddOptions = {
  file: string;
  title?: string;
  id?: string;
  key?: string;
  kind?: string;
  authors?: string[];
  year?: string;
  /** Sources that share an origin (a book and its author's talk on the same material) share a family, and count once as support. */
  family?: string;
  url?: string;
  max_cost?: number;
  fetcher?: typeof fetch;
};

const SKIP = new Set(['a', 'an', 'the', 'of', 'and', 'to', 'in', 'for', 'with', 'on', 'by', 'at', 'from']);

function deriveKey(title: string, taken: Set<string>): string {
  const words = title
    .replace(/[^A-Za-z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter(w => w && !SKIP.has(w.toLowerCase()));
  let base = words
    .slice(0, 5)
    .map(w => w[0].toUpperCase())
    .join('');
  if (base.length < 2) base = (words[0] ?? 'SRC').slice(0, 3).toUpperCase().padEnd(2, 'X');
  if (!/^[A-Z]/.test(base)) base = 'S' + base;
  let key = base;
  for (let n = 2; taken.has(key); n++) key = `${base}${n}`;
  return key;
}

export const SOURCE_KINDS = ['book', 'paper', 'article', 'video', 'audio', 'course', 'transcript', 'notes', 'other'];

export async function addSource(config: Config, options: AddOptions) {
  const file = path.resolve(options.file);
  if (!exists(file) || !fs.statSync(file).isFile()) fail('NOT_FOUND', `No file at ${file}.`);
  const lib = loadLibrary(config.library);
  const title = (options.title ?? path.basename(file, path.extname(file)).replace(/[._]+/g, ' ')).trim();
  const surname = options.authors?.[0]?.trim().split(/\s+/).at(-1) ?? '';
  // The folder name comes from the author and the title up to any subtitle, so it stays short enough to type in a link.
  const id = options.id ? options.id : slugify(`${surname} ${title.split(/[:—–(]/)[0]}`).split('-').slice(0, 7).join('-');
  if (!isSlug(id)) fail('INVALID', `A source id is lower-case words joined by hyphens; got "${id}".`);
  const taken = new Set([...lib.accounts.map(a => a.slug), ...lib.ideas.map(i => i.slug), ...lib.sources.map(s => s.id)]);
  if (taken.has(id)) fail('EXISTS', `"${id}" is already used in this library. Pass a different id, or see the existing source with kf_read.`);
  const sha = fileSha(file);
  const same = lib.sources.find(s => asText(s.fm.sha256) === sha);
  if (same) fail('EXISTS', `This exact file is already in the library as ${same.id} (${same.key}).`);
  const keys = new Set(lib.sources.map(s => s.key));
  const key = options.key ? options.key.toUpperCase() : deriveKey(title, keys);
  if (!/^[A-Z][A-Z0-9]{1,11}$/.test(key)) fail('INVALID', `A citation key is 2 to 12 capitals and digits starting with a letter; got "${key}".`);
  if (keys.has(key)) fail('EXISTS', `The citation key ${key} is already used by another source. Pass a different key.`);
  const kind = options.kind ?? (isMedia(file) ? (isVideo(file) ? 'video' : 'audio') : /\.(srt|vtt)$/i.test(file) ? 'transcript' : 'book');
  if (!SOURCE_KINDS.includes(kind)) fail('INVALID', `kind is one of ${SOURCE_KINDS.join(', ')}; got "${kind}".`);

  const dir = path.join(config.library, 'sources', id);
  // Build in a sibling folder and rename at the end, so a failed extraction never leaves half a source behind.
  const staging = dir + '.adding';
  fs.rmSync(staging, { recursive: true, force: true });
  fs.mkdirSync(path.join(staging, 'original'), { recursive: true });
  try {
    const extracted = await extract(config, file, { workDir: path.join(config.library, '.knowfu', 'transcribe', sha.slice(0, 16)), maxCost: options.max_cost, fetcher: options.fetcher });
    if (!extracted.units.length) fail('EXTRACTION_FAILED', `No text came out of ${file}.`);
    const { text, units } = assemble(extracted);
    writeText(path.join(staging, 'text.txt'), text);
    writeJson(path.join(staging, 'units.json'), units);
    const size = fs.statSync(file).size;
    // Large recordings stay where they are; the library records where, and the hash proves which file it was.
    const copied = size <= 300 * 1024 * 1024;
    if (copied) fs.copyFileSync(file, path.join(staging, 'original', path.basename(file)));
    let frames = 0;
    if (isVideo(file)) frames = sampleFrames(config, file, path.join(staging, 'frames'));
    const words = units.reduce((sum, u) => sum + u.words, 0);
    const noun = units[0].kind === 'page' ? 'pages' : units[0].kind === 'section' ? 'sections' : 'time units';
    const flagged = (flag: string) => units.filter(u => u.flags.includes(flag)).map(u => u.loc);
    const visual = units.filter(u => u.flags.some(f => ['sparse', 'glyphs', 'figure', 'numeric'].includes(f))).map(u => u.loc);
    const fm = formatFrontmatter({
      type: 'source',
      title,
      key,
      kind,
      authors: options.authors ?? [],
      year: options.year,
      family: options.family ?? id,
      url: options.url,
      added: today(),
      status: 'registered',
      original: copied ? `original/${path.basename(file)}` : file,
      sha256: sha,
      extractor: extracted.extractor,
      units: `${units.length} ${noun}`,
      words: String(words),
    });
    const range = units[0].kind === 'time' ? `${unitLabel(units[0]).split('-')[0]}-${unitLabel(units.at(-1)!).split('-')[1]}` : `${units[0].loc}-${units.at(-1)!.n}`;
    const body = [
      `# ${title}`,
      '',
      '## About',
      '',
      'TODO: one short paragraph. Who made this, what it sets out to do, and how far to trust it (what kind of evidence it rests on).',
      '',
      '## Map',
      '',
      `TODO: one "### Part or chapter title [${units[0].kind === 'page' ? 'p.A-B' : units[0].kind === 'section' ? 's.A-B' : 'mm:ss-mm:ss'}]" heading per stretch of the source, in order, covering ${range}. Under each, a digest: what this stretch argues, and what in it is worth keeping (see the ingest guide).`,
      '',
      '## What it changed',
      '',
      'TODO: after compiling. Which principles it added, sharpened or disputed, which accounts are new and which were revised, and what it leaves open.',
      '',
    ].join('\n');
    writeText(path.join(staging, 'source.md'), fm + '\n' + body);
    fs.renameSync(staging, dir);
    return {
      id,
      key,
      kind,
      folder: dir,
      units: units.length,
      unit_kind: units[0].kind,
      words,
      extractor: extracted.extractor,
      original: copied ? 'copied into the library' : `left in place at ${file} (over 300 MB)`,
      frames,
      blank: flagged('blank').length,
      worth_viewing: visual,
      notes: extracted.notes,
      text_file: path.join(dir, 'text.txt'),
      cite_as: `[${key} ${units[0].loc}]`,
    };
  } catch (error) {
    fs.rmSync(staging, { recursive: true, force: true });
    throw error;
  }
}

export function findSource(lib: Library, ref: string): Source {
  const source = lib.sources.find(s => s.id === ref) ?? lib.sources.find(s => s.key === ref.toUpperCase());
  if (!source) fail('NOT_FOUND', `No source "${ref}". Sources: ${lib.sources.map(s => `${s.key} (${s.id})`).join(', ') || 'none yet'}.`);
  return source;
}

/** Source text for a locator ("p.67-70", "s.3", "12:30-15:00"), with a marker line before each unit. */
export function readUnits(source: Source, loc: string, maxChars = 24000): string {
  const range = resolveLoc(source, loc);
  if (!range) {
    const first = source.units[0];
    const last = source.units.at(-1);
    fail('NOT_FOUND', `${source.key} has no "${loc}". It runs from ${first ? unitLabel(first) : '?'} to ${last ? unitLabel(last) : '?'} (${source.units.length} units).`);
  }
  const [from, to] = range;
  const parts: string[] = [];
  let size = 0;
  let end = from;
  // One call returns about 6,000 tokens at most, which also fits under a shell's inline output limit.
  // A longer span comes back in pieces, each saying where to continue.
  for (let i = from; i <= to; i++) {
    const unit = source.units[i];
    const flags = unit.flags.filter(f => !f.startsWith('title:'));
    const part = `===== ${source.key} ${unitLabel(unit)}${flags.length ? `  (${flags.join(', ')})` : ''} =====\n${unitText(source, i)}`;
    if (parts.length && size + part.length > maxChars) break;
    parts.push(part);
    size += part.length;
    end = i;
  }
  if (end < to) {
    const next = source.units[end + 1];
    const last = source.units[to];
    const rest = next.kind === 'time' ? `${unitLabel(next).split('-')[0]}-${unitLabel(last).split('-')[1]}` : `${next.loc}-${last.n}`;
    parts.push(`(stopped at ${unitLabel(source.units[end])} to keep this reply readable; continue with loc "${rest}")`);
  }
  return parts.join('\n\n');
}

function originalFile(source: Source): string {
  const recorded = asText(source.fm.original);
  const file = path.isAbsolute(recorded) ? recorded : path.join(source.dir, recorded);
  if (!recorded || !exists(file)) fail('NOT_FOUND', `The original file for ${source.key} isn't at ${file || '(not recorded)'}.`);
  return file;
}

/** A page image, a layout-preserving text reading of a page, or a video frame: for when the plain text isn't enough. */
export function viewUnit(config: Config, source: Source, loc: string, view: 'image' | 'layout'): { path?: string; text?: string } {
  const file = originalFile(source);
  const isPdf = /\.pdf$/i.test(file);
  if (isPdf) {
    const m = /^p\.(\d+)$/.exec(loc);
    if (!m) fail('INVALID', `Name one page, like "p.112"; got "${loc}".`);
    const page = Number(m[1]);
    if (!source.units.some(u => u.kind === 'page' && u.n === page)) fail('NOT_FOUND', `${source.key} has no page ${page}.`);
    if (view === 'layout') return { text: pdfText(config, file, { layout: true, first: page, last: page }).join('\n') };
    return { path: pdfPageImage(config, file, page, path.join(source.dir, 'pages')) };
  }
  if (isVideo(file)) {
    const seconds = parseTime(loc);
    if (seconds === null) fail('INVALID', `Name a moment, like "12:34"; got "${loc}".`);
    return { path: frameAt(config, file, seconds, path.join(source.dir, 'frames')) };
  }
  fail('UNSUPPORTED', `${source.key} is ${path.extname(file) || 'a file'} with no page images or frames to view.`);
}

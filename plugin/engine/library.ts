// Reads a library folder into memory. The Markdown files are the library: nothing here is a second copy.
//
//   knowledge/<domain>/DOMAIN.md
//   knowledge/<domain>/<topic>/TOPIC.md
//   knowledge/<domain>/<topic>/accounts/<slug>.md
//   sources/<id>/source.md, text.txt, units.json, original/
//   ideas/<slug>.md
//   inbox/<file>.md
import path from 'node:path';
import { parseFrontmatter, asList, asText } from './frontmatter.ts';
import type { FM } from './frontmatter.ts';
import { exists, readText, readJson, listDirs, listFiles, slugify, countWords, parseTime, formatTime } from './util.ts';

export type Unit = {
  /** How a citation names this unit: "p.12", "s.3" or "12:30". */
  loc: string;
  kind: 'page' | 'section' | 'time';
  /** Page or section number, or the start second for a time unit. */
  n: number;
  end?: number;
  /** 1-based line of this unit's marker in text.txt, and how many lines of text follow it. */
  line: number;
  lines: number;
  words: number;
  flags: string[];
};

export type Link = { to: string; anchor: string; verb: string; note: string; line: number };
export type Cite = { key: string; loc: string; line: number; quote?: string };

export type Doc = {
  file: string;
  /** Path relative to the library root, forward slashes. */
  rel: string;
  fm: FM;
  body: string;
  bodyLine: number;
  fmErrors: string[];
  hasFm: boolean;
  links: Link[];
  cites: Cite[];
  words: number;
};

export type Principle = {
  id: string;
  title: string;
  statement: string;
  why: string;
  breaks: string;
  governs: string[];
  heldBy: string;
  line: number;
  /** The whole section as written, heading included. */
  text: string;
};

export type Topic = Doc & { path: string; domain: string; slug: string; dir: string; frame: string; principles: Principle[]; sections: Section[] };
export type Account = Doc & { slug: string; topic: string };
export type Idea = Doc & { slug: string };
export type MapEntry = { title: string; line: number; range: string; from: number; to: number; text: string };
export type Source = Doc & { id: string; dir: string; key: string; units: Unit[]; sourceWords: number; map: MapEntry[]; sections: Section[] };
export type Domain = Doc & { name: string; dir: string };
/** `text` is trimmed for reading. `raw` keeps every line, so nested headings report true line numbers. */
export type Section = { title: string; line: number; text: string; raw: string };

export type Library = {
  root: string;
  domains: Domain[];
  topics: Topic[];
  accounts: Account[];
  sources: Source[];
  ideas: Idea[];
  inbox: Doc[];
  /** Folders that look like part of the library but are missing their main file. */
  stray: string[];
};

export const CONNECTION_VERBS = ['depends on', 'supports', 'qualifies', 'conflicts with', 'example of', 'extends', 'see also'];

const FENCE = /^(```|~~~)/;

/** Blank out code blocks and inline code, keeping every line in place, so links and citations inside code are ignored. */
export function withoutCode(text: string): string {
  let fenced = false;
  return text
    .split('\n')
    .map(line => {
      if (FENCE.test(line.trim())) {
        fenced = !fenced;
        return '';
      }
      return fenced ? '' : line.replace(/`[^`\n]*`/g, m => ' '.repeat(m.length));
    })
    .join('\n');
}

const WIKILINK = /\[\[([^\]|#\n]*)(?:#([^\]|\n]+))?(?:\|[^\]\n]*)?\]\]/g;
// [KEY p.12], [KEY p.12-15], [KEY s.3], [KEY 12:34], [KEY 1:02:03-1:05:00]
export const CITE = /\[([A-Z][A-Z0-9]{1,11}) ((?:p|s)\.\d+(?:-\d+)?|\d{1,2}:\d{2}(?::\d{2})?(?:-\d{1,2}:\d{2}(?::\d{2})?)?)\]/g;
const QUOTED = /["“]([^"“”\n]{12,600})["”]\s*$/;
const BARE_LOC = /\[((?:p|s)\.\d+(?:-\d+)?|\d{1,2}:\d{2}(?::\d{2})?(?:-\d{1,2}:\d{2}(?::\d{2})?)?)\]/g;

export function splitSections(body: string, bodyLine: number, level = 2): Section[] {
  const mark = '#'.repeat(level) + ' ';
  const lines = body.split('\n');
  const sections: Section[] = [];
  let fenced = false;
  let current: { title: string; line: number; buffer: string[] } | null = null;
  lines.forEach((line, i) => {
    if (FENCE.test(line.trim())) fenced = !fenced;
    if (!fenced && line.startsWith(mark)) {
      if (current) sections.push({ title: current.title, line: current.line, text: current.buffer.join('\n').trim(), raw: current.buffer.join('\n') });
      current = { title: line.slice(mark.length).trim(), line: bodyLine + i, buffer: [] };
    } else if (current) current.buffer.push(line);
  });
  if (current) {
    const c = current as { title: string; line: number; buffer: string[] };
    sections.push({ title: c.title, line: c.line, text: c.buffer.join('\n').trim(), raw: c.buffer.join('\n') });
  }
  return sections;
}

export const section = (sections: Section[], title: string) => sections.find(s => s.title.toLowerCase() === title.toLowerCase());

function scan(body: string, bodyLine: number): { links: Link[]; cites: Cite[] } {
  const clean = withoutCode(body).split('\n');
  const links: Link[] = [];
  const cites: Cite[] = [];
  let inConnections = false;
  clean.forEach((line, i) => {
    const n = bodyLine + i;
    if (line.startsWith('## ')) inConnections = /^##\s+connections\s*$/i.test(line);
    for (const m of line.matchAll(WIKILINK)) {
      let verb = 'mentions';
      let note = '';
      if (inConnections) {
        const bullet = /^\s*[-*]\s+(.*?)\s*\[\[/.exec(line);
        verb = (bullet?.[1] ?? '').toLowerCase().replace(/[:*_]/g, '').trim() || 'see also';
        note = line
          .slice((m.index ?? 0) + m[0].length)
          .replace(/^\s*[:—–-]\s*/, '')
          .trim();
      }
      links.push({ to: m[1].trim(), anchor: (m[2] ?? '').trim(), verb, note, line: n });
    }
    for (const m of line.matchAll(CITE)) {
      const before = line.slice(0, m.index ?? 0);
      const quote = QUOTED.exec(before)?.[1];
      cites.push({ key: m[1], loc: m[2], line: n, ...(quote ? { quote } : {}) });
    }
  });
  return { links, cites };
}

function loadDoc(file: string, root: string): Doc {
  const parsed = parseFrontmatter(readText(file));
  const { links, cites } = scan(parsed.body, parsed.bodyLine);
  return {
    file,
    rel: path.relative(root, file).replace(/\\/g, '/'),
    fm: parsed.fm,
    body: parsed.body,
    bodyLine: parsed.bodyLine,
    fmErrors: parsed.errors,
    hasFm: parsed.has,
    links,
    cites,
    words: countWords(parsed.body),
  };
}

const FIELD = /^\s*[-*]\s+\*\*([A-Za-z ]+?):?\*\*:?\s*(.*)$/;

export function parsePrinciples(sections: Section[]): Principle[] {
  const block = section(sections, 'Principles');
  if (!block) return [];
  return splitSections(block.raw, block.line + 1, 3).map(s => {
    const fields: Record<string, string> = {};
    const statement: string[] = [];
    let current = '';
    for (const line of s.text.split('\n')) {
      const m = FIELD.exec(line);
      if (m) {
        current = m[1].toLowerCase().trim();
        fields[current] = m[2].trim();
      } else if (current && /^\s{2,}\S/.test(line)) fields[current] += ' ' + line.trim();
      else if (line.trim()) {
        if (current) current = '';
        else statement.push(line.trim());
      }
    }
    const governs = [...(fields['governs'] ?? '').matchAll(WIKILINK)].map(m => m[1].trim());
    return {
      id: slugify(s.title),
      title: s.title,
      statement: statement.join(' '),
      why: fields['why'] ?? '',
      breaks: fields['breaks when'] ?? '',
      governs,
      heldBy: fields['held by'] ?? '',
      line: s.line,
      text: `### ${s.title}\n\n${s.text}`,
    };
  });
}

/** Units a locator names, as [first, last] indexes into source.units, or null when it names nothing. */
export function resolveLoc(source: Source, loc: string): [number, number] | null {
  const numbered = /^(p|s)\.(\d+)(?:-(\d+))?$/.exec(loc);
  if (numbered) {
    const kind = numbered[1] === 'p' ? 'page' : 'section';
    const a = Number(numbered[2]);
    const b = Number(numbered[3] ?? numbered[2]);
    if (b < a) return null;
    const first = source.units.findIndex(u => u.kind === kind && u.n === a);
    const last = source.units.findIndex(u => u.kind === kind && u.n === b);
    return first >= 0 && last >= 0 ? [first, last] : null;
  }
  const [from, to] = loc.split('-');
  const a = parseTime(from);
  const b = to ? parseTime(to) : a;
  if (a === null || b === null || b < a) return null;
  const at = (t: number) => source.units.findIndex(u => u.kind === 'time' && t >= u.n && t < (u.end ?? u.n + 1));
  const first = at(a);
  let last = at(b);
  // A citation at the very end of a recording belongs to the last unit.
  if (last < 0 && source.units.length && b === (source.units.at(-1)!.end ?? -1)) last = source.units.length - 1;
  return first >= 0 && last >= 0 ? [first, last] : null;
}

const textCache = new Map<string, string[]>();

export function sourceLines(source: Source): string[] {
  const file = path.join(source.dir, 'text.txt');
  let lines = textCache.get(file);
  if (!lines) {
    lines = exists(file) ? readText(file).split('\n') : [];
    textCache.set(file, lines);
  }
  return lines;
}

export function unitText(source: Source, index: number): string {
  const unit = source.units[index];
  if (!unit) return '';
  return sourceLines(source)
    .slice(unit.line, unit.line + unit.lines)
    .join('\n');
}

export function unitLabel(unit: Unit): string {
  return unit.kind === 'time' && unit.end !== undefined ? `${formatTime(unit.n)}-${formatTime(unit.end)}` : unit.loc;
}

function parseMap(source: Source): MapEntry[] {
  const block = section(source.sections, 'Map');
  if (!block) return [];
  return splitSections(block.raw, block.line + 1, 3).map(s => {
    const m =/\[([^\]]+)\]\s*$/.exec(s.title);
    const range = m?.[1].trim() ?? '';
    const resolved = range ? resolveLoc(source, range) : null;
    return { title: s.title, line: s.line, range, from: resolved?.[0] ?? -1, to: resolved?.[1] ?? -1, text: s.text };
  });
}

export function loadLibrary(root: string): Library {
  textCache.clear();
  const lib: Library = { root, domains: [], topics: [], accounts: [], sources: [], ideas: [], inbox: [], stray: [] };
  const knowledge = path.join(root, 'knowledge');
  for (const domain of listDirs(knowledge)) {
    const domainDir = path.join(knowledge, domain);
    const domainFile = path.join(domainDir, 'DOMAIN.md');
    if (exists(domainFile)) lib.domains.push({ ...loadDoc(domainFile, root), name: domain, dir: domainDir });
    else lib.stray.push(`knowledge/${domain} has no DOMAIN.md`);
    for (const topic of listDirs(domainDir)) {
      const dir = path.join(domainDir, topic);
      const file = path.join(dir, 'TOPIC.md');
      const topicPath = `${domain}/${topic}`;
      if (exists(file)) {
        const doc = loadDoc(file, root);
        const sections = splitSections(doc.body, doc.bodyLine);
        lib.topics.push({
          ...doc,
          path: topicPath,
          domain,
          slug: topic,
          dir,
          sections,
          frame: section(sections, 'Frame')?.text ?? '',
          principles: parsePrinciples(sections),
        });
      } else lib.stray.push(`knowledge/${topicPath} has no TOPIC.md`);
      for (const name of listFiles(path.join(dir, 'accounts')))
        lib.accounts.push({ ...loadDoc(path.join(dir, 'accounts', name), root), slug: name.slice(0, -3), topic: topicPath });
    }
  }
  for (const id of listDirs(path.join(root, 'sources'))) {
    const dir = path.join(root, 'sources', id);
    const file = path.join(dir, 'source.md');
    if (!exists(file)) {
      lib.stray.push(`sources/${id} has no source.md`);
      continue;
    }
    const doc = loadDoc(file, root);
    const unitsFile = path.join(dir, 'units.json');
    const units: Unit[] = exists(unitsFile) ? readJson(unitsFile) : [];
    const source: Source = {
      ...doc,
      id,
      dir,
      key: asText(doc.fm.key),
      units,
      sourceWords: units.reduce((sum, u) => sum + u.words, 0),
      sections: splitSections(doc.body, doc.bodyLine),
      map: [],
    };
    source.map = parseMap(source);
    // On its own page a source is cited by bare locator, [p.68] or [12:34], and those are checked like any citation.
    if (source.key)
      withoutCode(doc.body)
        .split('\n')
        .forEach((line, i) => {
          for (const m of line.matchAll(BARE_LOC)) {
            const quote = QUOTED.exec(line.slice(0, m.index ?? 0))?.[1];
            source.cites.push({ key: source.key, loc: m[1], line: doc.bodyLine + i, ...(quote ? { quote } : {}) });
          }
        });
    lib.sources.push(source);
  }
  for (const name of listFiles(path.join(root, 'ideas'))) lib.ideas.push({ ...loadDoc(path.join(root, 'ideas', name), root), slug: name.slice(0, -3) });
  for (const name of listFiles(path.join(root, 'inbox'))) lib.inbox.push(loadDoc(path.join(root, 'inbox', name), root));
  return lib;
}

// Lookups used by the checker, recall and connect.

export const sourceByKey = (lib: Library, key: string) => lib.sources.find(s => s.key === key);
export const accountBySlug = (lib: Library, slug: string) => lib.accounts.find(a => a.slug === slug);
export const topicByPath = (lib: Library, ref: string) => lib.topics.find(t => t.path === ref) ?? lib.topics.find(t => t.slug === ref);

export function accountPrinciples(account: Account): string[] {
  return asList(account.fm.principles);
}

export function isRetired(doc: Doc): boolean {
  return asText(doc.fm.status).toLowerCase() === 'retired';
}

export type Target =
  | { type: 'account'; account: Account }
  | { type: 'topic'; topic: Topic }
  | { type: 'principle'; topic: Topic; principle: Principle }
  | { type: 'source'; source: Source }
  | { type: 'idea'; idea: Idea };

/** What a [[link]] points at. `from` is the topic of the file holding the link, for [[#principle]] links. */
export function resolveLink(lib: Library, to: string, anchor: string, from?: string): Target | null {
  const name = to.trim();
  if (anchor) {
    const topic = name ? topicByPath(lib, name) : from ? topicByPath(lib, from) : undefined;
    const principle = topic?.principles.find(p => p.id === slugify(anchor));
    return topic && principle ? { type: 'principle', topic, principle } : null;
  }
  const account = accountBySlug(lib, name);
  if (account) return { type: 'account', account };
  const topic = lib.topics.find(t => t.path === name);
  if (topic) return { type: 'topic', topic };
  const source = lib.sources.find(s => s.id === name);
  if (source) return { type: 'source', source };
  const idea = lib.ideas.find(i => i.slug === name);
  if (idea) return { type: 'idea', idea };
  const bySlug = lib.topics.filter(t => t.slug === name);
  return bySlug.length === 1 ? { type: 'topic', topic: bySlug[0] } : null;
}

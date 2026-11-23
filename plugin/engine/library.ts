// Reads a library folder into memory. The Markdown files are the library: nothing here is a second copy.
//
//   knowledge/<domain>/DOMAIN.md
//   knowledge/<domain>/<topic>/TOPIC.md
//   knowledge/<domain>/<topic>/principles/<id>.md
//   knowledge/<domain>/<topic>/notes/<slug>.md
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

export type Link = { to: string; anchor: string; verb: string; reason: string; line: number };
export type Cite = { key: string; loc: string; line: number; quote?: string; screen?: boolean };

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

/** What one source brings to a principle: an entry under "## Evidence", headed "### KEY: states it". */
export type Evidence = {
  /** A source key, or "Owner" or "Synthesis" for what no single source holds. */
  key: string;
  /** "states", "implies", "qualifies" or "disputes"; empty when the heading names none. */
  stance: string;
  line: number;
  text: string;
  /** Source keys cited inside the entry. */
  cited: string[];
};

/** One principle, in its own file. The topic page lists every principle of the topic in a line each. */
export type Principle = Doc & {
  id: string;
  /** The topic path it belongs to. */
  topic: string;
  title: string;
  /** The line the topic page shows: the principle with its limit. */
  summary: string;
  /** The kind of support it rests on, one of SUPPORT_KINDS. */
  support: string;
  statement: string;
  why: string;
  breaks: string;
  /** The reader's weighing of its logic: does the reason follow, what is the strongest objection, where is it thin. */
  merit: string;
  evidence: Evidence[];
  line: number;
};

/** Kinds of support, strongest first. A principle names the strongest kind any of its sources gives it. */
export const SUPPORT_KINDS = ['review of studies', 'controlled comparison', 'measured data', 'worked cases', 'reasoned argument', 'bare assertion', 'our inference'];
export const STANCES = ['states', 'implies', 'qualifies', 'disputes'];

export type Topic = Doc & { path: string; domain: string; slug: string; dir: string; frame: string; principles: Principle[]; sections: Section[]; /** Laid out the way Know Fu was before 0.12. */ legacy: boolean };
export type Note = Doc & { slug: string; topic: string };
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
  notes: Note[];
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
// A time may end in " screen": [KEY 12:36 screen] cites what the picture showed at that moment, where
// [KEY 12:36] cites what was said. The two are checked differently, since printed words aren't in a transcript.
export const CITE = /\[([A-Z][A-Z0-9]{1,11}) ((?:p|s)\.\d+(?:-\d+)?|\d{1,2}:\d{2}(?::\d{2})?(?:-\d{1,2}:\d{2}(?::\d{2})?)?)( screen)?\]/g;
const QUOTED = /["“]([^"“”\n]{12,600})["”]\s*$/;
const BARE_LOC = /\[((?:p|s)\.\d+(?:-\d+)?|\d{1,2}:\d{2}(?::\d{2})?(?:-\d{1,2}:\d{2}(?::\d{2})?)?)( screen)?\]/g;

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
      let reason = '';
      if (inConnections) {
        const bullet = /^\s*[-*]\s+(.*?)\s*\[\[/.exec(line);
        verb = (bullet?.[1] ?? '').toLowerCase().replace(/[:*_]/g, '').trim() || 'see also';
        reason = line
          .slice((m.index ?? 0) + m[0].length)
          .replace(/^\s*[:—–-]\s*/, '')
          .trim();
      }
      links.push({ to: m[1].trim(), anchor: (m[2] ?? '').trim(), verb, reason, line: n });
    }
    for (const m of line.matchAll(CITE)) {
      const before = line.slice(0, m.index ?? 0);
      const quote = QUOTED.exec(before)?.[1];
      cites.push({ key: m[1], loc: m[2], line: n, ...(quote ? { quote } : {}), ...(m[3] ? { screen: true } : {}) });
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

/** The opening of a principle: its statement, then "- **Field:** text" lines. */
export function parseFields(text: string): { statement: string; fields: Record<string, string> } {
  const fields: Record<string, string> = {};
  const statement: string[] = [];
  let current = '';
  for (const line of text.split('\n')) {
    const m = FIELD.exec(line);
    if (m) {
      current = m[1].toLowerCase().trim();
      fields[current] = m[2].trim();
    } else if (current && /^\s{2,}\S/.test(line)) fields[current] += ' ' + line.trim();
    else if (line.trim() && !line.startsWith('# ')) {
      if (current) current = '';
      else statement.push(line.trim());
    }
  }
  return { statement: statement.join(' '), fields };
}

const EVIDENCE_HEAD = /^([A-Za-z][A-Za-z0-9]*)\s*(?:[:(,]\s*(.*?)\)?\s*)?$/;

function loadPrinciple(file: string, root: string, topic: string): Principle {
  const doc = loadDoc(file, root);
  const sections = splitSections(doc.body, doc.bodyLine);
  const opening = sections.length
    ? doc.body
        .split('\n')
        .slice(0, sections[0].line - doc.bodyLine)
        .join('\n')
    : doc.body;
  const { statement, fields } = parseFields(opening);
  const block = section(sections, 'Evidence');
  const evidence: Evidence[] = (block ? splitSections(block.raw, block.line + 1, 3) : []).map(s => {
    const head = EVIDENCE_HEAD.exec(s.title);
    const said = (head?.[2] ?? '').toLowerCase();
    return {
      key: head?.[1] ?? s.title,
      stance: STANCES.find(word => said.startsWith(word)) ?? '',
      line: s.line,
      text: s.text,
      cited: [...new Set([...withoutCode(s.text).matchAll(CITE)].map(m => m[1]))],
    };
  });
  return {
    ...doc,
    id: path.basename(file, '.md'),
    topic,
    title: asText(doc.fm.title),
    summary: asText(doc.fm.summary),
    support: asText(doc.fm.support),
    statement,
    why: fields['why'] ?? '',
    breaks: fields['breaks when'] ?? '',
    merit: fields['merit'] ?? '',
    evidence,
    line: doc.bodyLine,
  };
}

/** The order the topic page lists its principles in: the author's, where the page already has one, then by name. */
function inPageOrder(principles: Principle[], sections: Section[]): Principle[] {
  const listed = [...(section(sections, 'Principles')?.raw ?? '').matchAll(/\(principles\/([a-z0-9-]+)\.md\)/g)].map(m => m[1]);
  const place = (p: Principle) => (listed.includes(p.id) ? listed.indexOf(p.id) : listed.length);
  return [...principles].sort((a, b) => place(a) - place(b) || a.id.localeCompare(b.id));
}

/** How many sources that don't share an origin state or imply a principle. Two talks by one teacher count once. */
export function independentSupport(lib: Library, principle: Principle): number {
  const families = new Set<string>();
  for (const entry of principle.evidence) {
    if (entry.stance !== 'states' && entry.stance !== 'implies') continue;
    const source = sourceByKey(lib, entry.key);
    if (source) families.add(asText(source.fm.family) || source.id);
  }
  return families.size;
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
  const lib: Library = { root, domains: [], topics: [], notes: [], sources: [], ideas: [], inbox: [], stray: [] };
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
        // A library from before 0.12 keeps its principles on the topic page and its notes in accounts/.
        const legacy = exists(path.join(dir, 'accounts')) || /^### /m.test(section(sections, 'Principles')?.raw ?? '');
        lib.topics.push({
          ...doc,
          path: topicPath,
          domain,
          slug: topic,
          dir,
          sections,
          frame: section(sections, 'Frame')?.text ?? '',
          principles: inPageOrder(
            listFiles(path.join(dir, 'principles')).map(name => loadPrinciple(path.join(dir, 'principles', name), root, topicPath)),
            sections,
          ),
          legacy,
        });
        if (legacy)
          lib.stray.push(`knowledge/${topicPath} is laid out the way Know Fu was before 0.12 (principles on the topic page, an accounts folder). Run "migrate" from the command line to move it to principle files and notes.`);
      } else lib.stray.push(`knowledge/${topicPath} has no TOPIC.md`);
      for (const name of listFiles(path.join(dir, 'notes')))
        lib.notes.push({ ...loadDoc(path.join(dir, 'notes', name), root), slug: name.slice(0, -3), topic: topicPath });
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
            source.cites.push({ key: source.key, loc: m[1], line: doc.bodyLine + i, ...(quote ? { quote } : {}), ...(m[2] ? { screen: true } : {}) });
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
export const noteBySlug = (lib: Library, slug: string) => lib.notes.find(a => a.slug === slug);
export const topicByPath = (lib: Library, ref: string) => lib.topics.find(t => t.path === ref) ?? lib.topics.find(t => t.slug === ref);

export function notePrinciples(note: Note): string[] {
  return asList(note.fm.principles);
}

/** The notes that name a principle, as its id from inside the topic or as domain/topic#id from outside. */
export function notesUnder(lib: Library, principle: Principle): Note[] {
  return lib.notes.filter(n => !isRetired(n) && notePrinciples(n).some(p => (n.topic === principle.topic && p === principle.id) || p === `${principle.topic}#${principle.id}`));
}

export function isRetired(doc: Doc): boolean {
  return asText(doc.fm.status).toLowerCase() === 'retired';
}

export type Target =
  | { type: 'note'; note: Note }
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
  const note = noteBySlug(lib, name);
  if (note) return { type: 'note', note };
  const topic = lib.topics.find(t => t.path === name);
  if (topic) return { type: 'topic', topic };
  const source = lib.sources.find(s => s.id === name);
  if (source) return { type: 'source', source };
  const idea = lib.ideas.find(i => i.slug === name);
  if (idea) return { type: 'idea', idea };
  const bySlug = lib.topics.filter(t => t.slug === name);
  return bySlug.length === 1 ? { type: 'topic', topic: bySlug[0] } : null;
}

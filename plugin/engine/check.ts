// The checker. Agents write the library as free prose; this holds its structure together:
// links and citations that resolve, quoted words that are really in the source, principles that
// say why they hold, where they break and what they rest on, and sources whose maps cover every page.
// It also keeps the derived things in step: the list of principles on each topic page, the list of
// notes in each principle file, and the library index.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { asList, asText } from './frontmatter.ts';
import {
  CITE,
  CONNECTION_VERBS,
  STANCES,
  SUPPORT_KINDS,
  backing,
  parseEvidenceHead,
  sourceName,
  notePrinciples,
  notesUnder,
  isRetired,
  loadLibrary,
  resolveLink,
  resolveLoc,
  section,
  sourceByKey,
  splitSections,
  unitLabel,
  unitText,
  withoutCode,
} from './library.ts';
import type { Note, Doc, Library, Principle, Source, Topic } from './library.ts';
import { SOURCE_KINDS, framesLooked, keptExhibits, screenTrack } from './sources.ts';
import { countWords, exists, formatTime, isSlug, parseTime, readText, slugify, squash, today, tokens, writeText } from './util.ts';

export type Issue = { level: 'error' | 'warn'; code: string; file: string; line?: number; message: string };

export const NOTE_KINDS = ['mechanism', 'method', 'case', 'reference', 'debate', 'definition'];
export const BASES = ['source', 'synthesis', 'owner'];
export const IDEA_STATUSES = ['candidate', 'testing', 'passed', 'failed', 'parked'];

type Shape = { required: string[]; optional: string[]; lists: string[]; enums: Record<string, string[]> };

const SHAPES: Record<string, Shape> = {
  note: {
    required: ['type', 'title', 'summary', 'kind', 'principles', 'sources', 'basis', 'updated'],
    optional: ['keywords', 'status', 'retired_reason'],
    lists: ['principles', 'sources', 'keywords'],
    enums: { kind: NOTE_KINDS, basis: BASES, status: ['active', 'retired'] },
  },
  principle: {
    required: ['type', 'title', 'summary', 'support', 'updated'],
    optional: ['keywords'],
    lists: ['keywords'],
    enums: { support: SUPPORT_KINDS },
  },
  topic: { required: ['type', 'title', 'summary', 'updated'], optional: ['keywords'], lists: ['keywords'], enums: {} },
  domain: { required: ['type', 'title', 'summary'], optional: ['updated'], lists: [], enums: {} },
  source: {
    required: ['type', 'title', 'key', 'kind', 'family', 'added', 'status'],
    optional: ['authors', 'year', 'url', 'original', 'sha256', 'extractor', 'units', 'words', 'note'],
    lists: ['authors'],
    enums: { kind: SOURCE_KINDS, status: ['registered', 'compiled', 'retired'] },
  },
  idea: {
    required: ['type', 'title', 'summary', 'status', 'premises', 'updated'],
    optional: ['topics'],
    lists: ['premises', 'topics'],
    enums: { status: IDEA_STATUSES },
  },
  inbox: { required: ['type', 'title', 'date'], optional: ['from', 'topic'], lists: [], enums: {} },
};

const LIMITS = { noteMin: 80, noteMax: 1500, summaryMax: 60, topicTokens: 5000, principlesMax: 40 };

export type Report = {
  errors: Issue[];
  warnings: Issue[];
  fixed: string[];
  stats: {
    topics: { path: string; principles: number; notes: number; words: number; tokens: number }[];
    sources: { id: string; key: string; status: string; source_words: number; mapped_words: number; unmapped: string; principles: number; notes: number }[];
    notes: number;
    ideas: number;
    inbox: number;
  };
};

function frontmatterIssues(doc: Doc, type: string, add: (i: Omit<Issue, 'file'>) => void) {
  for (const message of doc.fmErrors) add({ level: 'error', code: 'frontmatter', message });
  if (!doc.hasFm) return add({ level: 'error', code: 'frontmatter', line: 1, message: `no frontmatter block; a ${type} file starts with --- and its fields` });
  const shape = SHAPES[type];
  const declared = asText(doc.fm.type);
  if (declared !== type) add({ level: 'error', code: 'frontmatter', message: `type is "${declared || '(missing)'}" but a file here is a ${type}` });
  for (const key of shape.required) if (!(key in doc.fm)) add({ level: 'error', code: 'frontmatter', message: `missing "${key}"` });
  // A page made with "new" starts with a placeholder summary, and a summary is what a reader chooses by.
  if (/^TODO\b/.test(asText(doc.fm.summary))) add({ level: 'error', code: 'frontmatter', message: 'the summary is still the placeholder; write one line on what this covers' });
  for (const key of Object.keys(doc.fm))
    if (!shape.required.includes(key) && !shape.optional.includes(key))
      add({ level: 'error', code: 'frontmatter', message: `unknown field "${key}"; a ${type} takes ${[...shape.required, ...shape.optional].join(', ')}` });
  for (const [key, allowed] of Object.entries(shape.enums)) {
    const value = asText(doc.fm[key]);
    if (key in doc.fm && !allowed.includes(value)) add({ level: 'error', code: 'frontmatter', message: `${key} is "${value}"; use one of ${allowed.join(', ')}` });
  }
  for (const key of shape.required) {
    if (shape.lists.includes(key)) continue;
    if (key in doc.fm && !asText(doc.fm[key]).trim()) add({ level: 'error', code: 'frontmatter', message: `"${key}" is empty` });
  }
  for (const key of ['updated', 'added', 'date'])
    if (key in doc.fm && !/^\d{4}-\d{2}-\d{2}$/.test(asText(doc.fm[key]))) add({ level: 'error', code: 'frontmatter', message: `${key} is a date like ${today()}; got "${asText(doc.fm[key])}"` });
}

/** Text around a cited unit: the units it names plus one either side, since a sentence can run over a page break. */
function nearText(source: Source, from: number, to: number): string {
  const parts: string[] = [];
  for (let i = Math.max(0, from - 1); i <= Math.min(source.units.length - 1, to + 1); i++) {
    // A transcript line starts with the time it was spoken. That mark isn't part of what was said, and left in
    // it would sit between two sentences and fail any quotation that runs across them.
    const text = unitText(source, i);
    parts.push(source.units[i].kind === 'time' ? text.replace(/^\[\d{1,2}:\d{2}(?::\d{2})?\]\s*/gm, '') : text);
  }
  return squash(parts.join('\n'));
}

/** `lasting` is for knowledge pages: what they cite on a screen should be a kept frame, so a later reader can open it. */
function citationIssues(lib: Library, doc: Doc, add: (i: Omit<Issue, 'file'>) => void, lasting = false): Set<string> {
  const used = new Set<string>();
  for (const cite of doc.cites) {
    if (cite.screen) {
      // What a screen showed can't be checked against a transcript. What can be checked is that someone looked.
      const source = sourceByKey(lib, cite.key);
      if (!source) {
        add({ level: 'error', code: 'citation', line: cite.line, message: `[${cite.key} ${cite.loc} screen] cites a source key that isn't in the library` });
        continue;
      }
      used.add(cite.key);
      const at = parseTime(cite.loc);
      if (at === null) add({ level: 'error', code: 'citation', line: cite.line, message: `[${cite.key} ${cite.loc} screen] needs one moment, like [${cite.key} 12:36 screen]` });
      else if (!framesLooked(source).some(t => Math.abs(t - at) <= 1))
        add({ level: 'error', code: 'citation', line: cite.line, message: `[${cite.key} ${cite.loc} screen] cites the screen at a moment no frame was opened. Open it with kf_read view "image" or "screen" and cite the time of the frame you read.` });
      else if (lasting && !keptExhibits(source).some(t => Math.abs(t - at) <= 1))
        add({ level: 'warn', code: 'exhibit', line: cite.line, message: `[${cite.key} ${cite.loc} screen] rests on a frame that isn't kept. Keep it with kf_source action "keep", so a later reader can open what this cites.` });
      continue;
    }
    const source = sourceByKey(lib, cite.key);
    if (!source) {
      add({ level: 'error', code: 'citation', line: cite.line, message: `[${cite.key} ${cite.loc}] cites a source key that isn't in the library (keys: ${lib.sources.map(s => s.key).join(', ') || 'none'})` });
      continue;
    }
    used.add(cite.key);
    const range = resolveLoc(source, cite.loc);
    if (!range) {
      const first = source.units[0];
      const last = source.units.at(-1);
      add({ level: 'error', code: 'citation', line: cite.line, message: `[${cite.key} ${cite.loc}] names nothing in ${source.id}, which runs ${first ? unitLabel(first) : '?'} to ${last ? unitLabel(last) : '?'}` });
      continue;
    }
    if (cite.quote) {
      const haystack = nearText(source, range[0], range[1]);
      const parts = cite.quote
        .split(/\.\.\.|…|\[[^\]]*\]/)
        .map(squash)
        .filter(p => p.length >= 8);
      const missing = parts.find(p => !haystack.includes(p));
      if (missing !== undefined)
        add({
          level: 'error',
          code: 'quote',
          line: cite.line,
          message: `the words quoted before [${cite.key} ${cite.loc}] aren't in that part of the source. Quote the source's exact words, mark cuts with …, or drop the quotation marks and paraphrase. Quoted: "${cite.quote.slice(0, 90)}${cite.quote.length > 90 ? '…' : ''}"`,
        });
    }
  }
  return used;
}

function linkIssues(lib: Library, doc: Doc, fromTopic: string | undefined, zone: 'knowledge' | 'source' | 'idea', add: (i: Omit<Issue, 'file'>) => void) {
  for (const link of doc.links) {
    const target = resolveLink(lib, link.to, link.anchor, fromTopic);
    const shown = `[[${link.to}${link.anchor ? '#' + link.anchor : ''}]]`;
    if (!target) {
      add({ level: 'error', code: 'link', line: link.line, message: `${shown} points at nothing. Link a note by its file name, a topic as domain/topic, a principle as domain/topic#principle-id, a source by its id.` });
      continue;
    }
    if (target.type === 'idea' && zone !== 'idea')
      add({ level: 'error', code: 'idea-as-evidence', line: link.line, message: `${shown} is an idea. Knowledge never rests on an idea; remove the link, or if the idea has been borne out, write what was learned as a note with its own evidence.` });
    if (target.type === 'note' && isRetired(target.note) && zone === 'knowledge')
      add({ level: 'warn', code: 'retired-link', line: link.line, message: `${shown} is retired (${asText(target.note.fm.retired_reason) || 'no reason given'})` });
    if (link.verb !== 'mentions' && !CONNECTION_VERBS.includes(link.verb))
      add({ level: 'warn', code: 'connection-verb', line: link.line, message: `"${link.verb}" isn't a connection verb. Start each Connections line with one of: ${CONNECTION_VERBS.join(', ')}.` });
  }
}

/**
 * Words in double quotes read as a source's own words, and only a quotation with a citation right after it can be
 * checked. A longer quotation with no citation before its sentence ends is a paraphrase in quote marks, or a
 * quotation nobody can find.
 */
function looseQuotes(doc: Doc, add: (i: Omit<Issue, 'file'>) => void) {
  const cite = new RegExp(CITE.source);
  withoutCode(doc.body)
    .split('\n')
    .forEach((line, i) => {
      // Every quotation on the line is matched, short ones too, so an opening mark is never paired with the wrong close.
      for (const m of line.matchAll(/["“]([^"“”\n]{1,600})["”]/g)) {
        if (countWords(m[1]) < 5) continue;
        const rest = line.slice((m.index ?? 0) + m[0].length);
        const stop = rest.search(/[.!?](\s|$)/);
        if (!cite.test(stop < 0 ? rest : rest.slice(0, stop)))
          add({ level: 'warn', code: 'quote', line: doc.bodyLine + i, message: `"${m[1].slice(0, 60)}${m[1].length > 60 ? '…' : ''}" is in quote marks with no citation after it. If these are a source's exact words, cite where it says them, like [KEY 12:34]. If they are your wording, drop the quote marks.` });
      }
    });
}

/** A principle file: what it says, why, where it stops, how well its logic holds, and what each source brings to it. */
function principleIssues(lib: Library, p: Principle, keys: Map<string, string>, add: (i: Omit<Issue, 'file'>) => void) {
  frontmatterIssues(p, 'principle', add);
  if (!isSlug(p.id)) add({ level: 'error', code: 'name', message: `"${p.id}" isn't a valid name: use lower-case words joined by hyphens` });
  linkIssues(lib, p, p.topic, 'knowledge', add);
  const cited = citationIssues(lib, p, add, true);
  looseQuotes(p, add);
  if (countWords(p.statement) < 6) add({ level: 'error', code: 'principle', message: 'no statement: say the principle in a sentence or two at the top of the file, before the "- **Why:**" line' });
  if (!p.why) add({ level: 'error', code: 'principle', message: 'no "- **Why:**" line saying what makes it true' });
  if (!p.breaks) add({ level: 'error', code: 'principle', message: 'no "- **Breaks when:**" line. A principle with no boundary is a slogan; say where it stops holding.' });
  const todo = p.body.split('\n').findIndex(l => /\bTODO:/.test(l));
  if (todo >= 0) add({ level: 'error', code: 'principle', line: p.bodyLine + todo, message: 'a TODO placeholder is still here. Open the sources this principle rests on and write the line it stands for.' });
  if (!p.merit)
    add({ level: 'error', code: 'principle', message: 'no "- **Merit:**" line. Weigh the reasoning in a sentence or two: does the "because" follow from what the sources show, what is the strongest objection, and where is the support thin?' });
  if (countWords(p.summary) > LIMITS.summaryMax) add({ level: 'warn', code: 'summary', message: `the summary runs ${countWords(p.summary)} words; it is the principle's line on the topic page, so keep it under ${LIMITS.summaryMax}` });
  if (!p.evidence.length) add({ level: 'error', code: 'evidence', message: 'no "## Evidence" section. Give each source that bears on this principle an entry headed like "### KEY: states it", saying what it brings and where.' });
  const entered = new Set<string>();
  for (const entry of p.evidence) {
    const where = { line: entry.line };
    const own = /^(owner|synthesis)$/i.test(entry.key);
    if (entered.has(entry.key)) add({ level: 'error', code: 'evidence', ...where, message: `two evidence entries for ${entry.key}. A source has one entry per principle; add to the one that is there.` });
    entered.add(entry.key);
    if (own) continue;
    if (!keys.has(entry.key)) {
      add({ level: 'error', code: 'evidence', ...where, message: `the evidence entry "${entry.key}" isn't a source key in the library (keys: ${[...keys.keys()].join(', ') || 'none'}). Head each entry with a source key, or with "Owner" or "Synthesis".` });
      continue;
    }
    if (!entry.stance)
      add({ level: 'error', code: 'evidence', ...where, message: `the entry for ${entry.key} doesn't say how the source stands. Head it "### ${entry.key}: states it", or with ${STANCES.slice(1).join(', ')} in place of states.` });
    if (!entry.cited.includes(entry.key)) add({ level: 'error', code: 'evidence', ...where, message: `the entry for ${entry.key} cites nothing from it. Say what the source brings and where, like [${entry.key} p.12].` });
    if (countWords(entry.text) < 8) add({ level: 'warn', code: 'evidence', ...where, message: `the entry for ${entry.key} is nearly empty. Say what this source adds: its reasoning, its cases, or where it draws the limit.` });
  }
  for (const key of cited) if (!entered.has(key)) add({ level: 'warn', code: 'evidence', message: `the text cites ${key}, but "## Evidence" has no entry for it` });
}

function ranges(indexes: number[], source: Source): string {
  const out: string[] = [];
  for (let i = 0; i < indexes.length; i++) {
    let j = i;
    while (j + 1 < indexes.length && indexes[j + 1] === indexes[j] + 1) j++;
    const a = source.units[indexes[i]];
    const b = source.units[indexes[j]];
    out.push(i === j ? unitLabel(a) : a.kind === 'time' ? `${unitLabel(a).split('-')[0]}-${unitLabel(b).split('-')[1]}` : `${a.loc}-${b.n}`);
    i = j;
  }
  return out.join(', ');
}

export function checkLibrary(root: string, options: { fix?: boolean } = {}): Report {
  const fixed: string[] = options.fix ? applyFixes(root) : [];
  const lib = loadLibrary(root);
  const issues: Issue[] = [];
  const adder = (file: string) => (i: Omit<Issue, 'file'>) => issues.push({ file, ...i });

  for (const message of lib.stray) issues.push({ level: 'error', code: 'structure', file: message.split(' ')[0], message });

  // One namespace for everything a bare [[link]] can name.
  const names = new Map<string, string>();
  for (const [slug, rel] of [...lib.notes.map(a => [a.slug, a.rel]), ...lib.ideas.map(i => [i.slug, i.rel]), ...lib.sources.map(s => [s.id, s.rel])] as [string, string][]) {
    if (!isSlug(slug)) issues.push({ level: 'error', code: 'name', file: rel, message: `"${slug}" isn't a valid name: use lower-case words joined by hyphens` });
    const earlier = names.get(slug);
    if (earlier) issues.push({ level: 'error', code: 'duplicate', file: rel, message: `the name "${slug}" is also used by ${earlier}; every note, idea and source needs its own` });
    else names.set(slug, rel);
  }
  const keys = new Map<string, string>();
  for (const s of lib.sources) {
    if (keys.has(s.key)) issues.push({ level: 'error', code: 'duplicate', file: s.rel, message: `citation key ${s.key} is also used by ${keys.get(s.key)}` });
    keys.set(s.key, s.rel);
  }

  for (const domain of lib.domains) frontmatterIssues(domain, 'domain', adder(domain.rel));

  // ---- topics ----
  for (const topic of lib.topics) {
    const add = adder(topic.rel);
    frontmatterIssues(topic, 'topic', add);
    linkIssues(lib, topic, topic.path, 'knowledge', add);
    citationIssues(lib, topic, add, true);
    const notes = lib.notes.filter(a => a.topic === topic.path && !isRetired(a));
    const frame = section(topic.sections, 'Frame');
    if (!frame?.text) add({ level: 'error', code: 'topic', message: `${frame ? 'the "## Frame" section is empty' : 'no "## Frame" section'}: write a few paragraphs on how this subject hangs together` });
    if (!topic.principles.length) add({ level: notes.length ? 'error' : 'warn', code: 'topic', message: 'no principles yet: each one is a file in this topic\'s principles/ folder' });
    if (topic.principles.length > LIMITS.principlesMax)
      add({ level: 'warn', code: 'topic-size', message: `${topic.principles.length} principles. Near ${LIMITS.principlesMax} a topic usually holds two or three subjects: look for groups of principles that link to each other more than to the rest, and split the topic along them.` });
    const size = tokens(topic.body);
    if (size > LIMITS.topicTokens) add({ level: 'warn', code: 'topic-size', message: `about ${size} tokens. The topic page is meant to be read whole; move detail into notes or split the topic.` });
    for (const p of topic.principles) principleIssues(lib, p, keys, adder(p.rel));
    if (notes.length >= 6 && topic.principles.length < 3)
      add({ level: 'warn', code: 'topic', message: `${notes.length} notes under ${topic.principles.length} principles. What ideas do these notes share?` });
  }

  // ---- notes ----
  const byTitle: { words: Set<string>; note: Note }[] = [];
  for (const note of lib.notes) {
    const add = adder(note.rel);
    frontmatterIssues(note, 'note', add);
    const topic = lib.topics.find(t => t.path === note.topic);
    linkIssues(lib, note, note.topic, 'knowledge', add);
    const cited = citationIssues(lib, note, add, true);
    looseQuotes(note, add);
    const listed = new Set(asList(note.fm.sources));
    for (const key of listed) if (!keys.has(key)) add({ level: 'error', code: 'sources', message: `sources lists "${key}", which isn't a source key in the library` });
    for (const key of cited) if (!listed.has(key)) add({ level: 'error', code: 'sources', message: `the text cites ${key} but "sources" doesn't list it; add ${key} to sources` });
    for (const key of listed) if (keys.has(key) && !cited.has(key)) add({ level: 'warn', code: 'sources', message: `sources lists ${key} but nothing in the text cites it with a locator like [${key} p.12]` });
    const basis = asText(note.fm.basis);
    if (basis === 'source' && cited.size === 0) add({ level: 'error', code: 'citation', message: 'basis is "source" but the text cites nothing. Cite where each specific comes from, like [KEY p.12].' });
    if (isRetired(note)) continue;
    for (const p of notePrinciples(note)) {
      const [ref, id] = p.includes('#') ? p.split('#') : [note.topic, p];
      const home = lib.topics.find(t => t.path === ref);
      if (!home?.principles.some(x => x.id === id))
        add({ level: 'error', code: 'principle', message: `principles lists "${p}", but ${ref} has no principle with that id${home ? ` (it has: ${home.principles.map(x => x.id).join(', ') || 'none'})` : ''}` });
    }
    if (!notePrinciples(note).length && topic) add({ level: 'warn', code: 'orphan', message: 'this note names no principle. Which principle is it a case of? If none fits, the topic may be missing one.' });
    const summary = asText(note.fm.summary);
    if (countWords(summary) > LIMITS.summaryMax) add({ level: 'warn', code: 'summary', message: `the summary runs ${countWords(summary)} words; a reader decides from it whether to open the note, so keep it under ${LIMITS.summaryMax}` });
    if (note.words < LIMITS.noteMin) add({ level: 'warn', code: 'size', message: `${note.words} words. Too thin to stand alone: fold it into the note it belongs with.` });
    if (note.words > LIMITS.noteMax) add({ level: 'warn', code: 'size', message: `${note.words} words. Depth is welcome, but at this length check two things: does it hold two ideas a reader would look up separately (split it), and is part of it background any model already has (cut that part).` });
    const words = new Set(
      asText(note.fm.title)
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter(w => w.length > 3),
    );
    for (const other of byTitle) {
      const shared = [...words].filter(w => other.words.has(w)).length;
      const union = new Set([...words, ...other.words]).size;
      if (union >= 4 && shared / union >= 0.7) add({ level: 'warn', code: 'duplicate', message: `the title is close to ${other.note.slug}'s. One idea is held once: merge them, or make the titles say what differs.` });
    }
    byTitle.push({ words, note });
  }

  // ---- sources ----
  const sourceStats: Report['stats']['sources'] = [];
  for (const source of lib.sources) {
    const add = adder(source.rel);
    frontmatterIssues(source, 'source', add);
    linkIssues(lib, source, undefined, 'source', add);
    citationIssues(lib, source, add);
    if (!source.units.length) add({ level: 'error', code: 'source', message: 'no extracted text (units.json is missing or empty)' });
    const status = asText(source.fm.status);
    const citing = lib.notes.filter(a => !isRetired(a) && asList(a.fm.sources).includes(source.key));
    const resting = lib.topics.flatMap(t => t.principles).filter(p => p.evidence.some(e => e.key === source.key));
    // What has been read so far is what the map covers. A long source ingested over several sessions is
    // measured against that, never against pages nobody has read yet.
    const covered = new Set<number>();
    for (const entry of source.map) {
      if (entry.from < 0) add({ level: 'error', code: 'map', line: entry.line, message: `the heading "${entry.title}" needs a range the source has at its end, like [${source.units[0] ? unitLabel(source.units[0]) : 'p.1'}-…]` });
      else for (let i = entry.from; i <= entry.to; i++) covered.add(i);

    }
    const mappedWords = covered.size ? [...covered].reduce((sum, i) => sum + source.units[i].words, 0) : source.sourceWords;

    const gaps = source.units.map((u, i) => (covered.has(i) || u.flags.includes('blank') ? -1 : i)).filter(i => i >= 0);
    sourceStats.push({
      id: source.id,
      key: source.key,
      status,
      source_words: source.sourceWords,
      mapped_words: covered.size ? mappedWords : 0,
      unmapped: covered.size && gaps.length ? ranges(gaps, source) : '',
      principles: resting.length,
      notes: citing.length,
    });
    // A recording with a screen: each map entry says which frames the reader opened, and the folder shows which were.
    // A reader that skips the picture writes fluently from the words alone, and nothing else would show it.
    const track = screenTrack(source);
    if (track) {
      const looked = framesLooked(source);
      for (const entry of source.map) {
        if (entry.from < 0) continue;
        // Units begin and end with speech; the picture before the first word and after the last belongs to the ends.
        const from = entry.from === 0 ? 0 : source.units[entry.from].n;
        const to = entry.to === source.units.length - 1 ? Infinity : (source.units[entry.to].end ?? Infinity);
        const changes = track.candidates.filter(c => c.t >= from && c.t < to).length;
        const line = /^\s*[-*]\s+\*\*Frames:\*\*(.*)$/m.exec(entry.text);
        if (!line) {
          if (changes >= 3)
            add({ level: 'warn', code: 'frames', line: entry.line, message: `the screen changed ${changes} times during "${entry.title}" and its map entry has no "- **Frames:**" line. List the frames you opened (like 12:36, 13:02), or write "none" and why.` });
          continue;
        }
        // "none: …" gives a reason, and a note in brackets explains a frame; neither is a list of frames.
        const listed = /^\s*none\b/i.test(line[1]) ? '' : line[1].replace(/\([^)]*\)/g, ' ');
        for (const m of listed.matchAll(/\b(\d{1,2}(?::\d{2}){1,2})\b/g)) {
          const at = parseTime(m[1]);
          if (at !== null && !looked.some(t => Math.abs(t - at) <= 1))
            add({ level: 'warn', code: 'frames', line: entry.line, message: `the map entry "${entry.title}" lists a frame at ${m[1]}, but no frame near that time was opened. Open it with kf_read view "image" or "screen", or take it off the line.` });
        }
      }
      const kept = keptExhibits(source);
      const block = section(source.sections, 'Exhibits');
      const recorded: number[] = [];
      for (const exhibit of block ? splitSections(block.raw, block.line + 1, 3) : []) {
        const at = parseTime(exhibit.title.split(/\s+/)[0] ?? '');
        if (at === null) {
          add({ level: 'error', code: 'exhibit', line: exhibit.line, message: `the exhibit heading "${exhibit.title}" starts with no time. Write it as "### 12:36 What the frame shows".` });
          continue;
        }
        recorded.push(at);
        if (!kept.some(t => Math.abs(t - at) < 1))
          add({ level: 'error', code: 'exhibit', line: exhibit.line, message: `the exhibit "${exhibit.title}" has no kept frame. Keep it with kf_source action "keep", ref "${source.key}", loc "${formatTime(at)}".` });
        if (countWords(exhibit.text) < 15) add({ level: 'warn', code: 'exhibit', line: exhibit.line, message: `the record under "${exhibit.title}" is nearly empty. Say what the frame shows, so a reader who never opens it still has its content.` });
      }
      // A moment may have several kept files (the frame and its crops). One record covers the moment, so ask once.
      for (const t of [...new Set(kept.map(Math.floor))])
        if (!recorded.some(at => Math.abs(t - at) < 1)) add({ level: 'warn', code: 'exhibit', message: `a frame at ${formatTime(t)} was kept as an exhibit, but "## Exhibits" has no "### ${formatTime(t)} …" record for it` });
    }

    if (status !== 'compiled') continue;
    const todo = source.body.split('\n').findIndex(l => l.trim().startsWith('TODO:'));
    if (todo >= 0) add({ level: 'error', code: 'source', line: source.bodyLine + todo, message: 'a TODO placeholder is still here; a compiled source has its About, Map and What it changed written' });
    if (!source.map.length) add({ level: 'error', code: 'map', message: 'no map: under "## Map", one "### Title [p.A-B]" heading per stretch of the source, each with a line saying what it covers' });
    if (source.map.length && gaps.length) add({ level: 'error', code: 'map', message: `no map entry covers ${ranges(gaps, source)}. Every part of a source is read and mapped, even when the entry says "nothing worth keeping here". A source read only in part keeps status "registered".` });
    if (!citing.length && !resting.length) add({ level: 'warn', code: 'source', message: 'compiled, but no principle has an evidence entry for it and no note lists it as a source. If it added nothing, say so under "What it changed".' });
  }

  // ---- ideas ----
  for (const idea of lib.ideas) {
    const add = adder(idea.rel);
    frontmatterIssues(idea, 'idea', add);
    linkIssues(lib, idea, undefined, 'idea', add);
    citationIssues(lib, idea, add);
    for (const premise of asList(idea.fm.premises)) {
      const [to, anchor = ''] = premise.split('#');
      const target = resolveLink(lib, to, anchor);
      if (!target || target.type === 'idea') add({ level: 'error', code: 'idea', message: `premise "${premise}" isn't a note or principle in the library. An idea rests on knowledge, named by note file name or domain/topic#principle-id.` });
    }
  }
  for (const item of lib.inbox) frontmatterIssues(item, 'inbox', adder(item.rel));

  const topicStats = lib.topics.map(t => {
    const notes = lib.notes.filter(a => a.topic === t.path && !isRetired(a));
    return { path: t.path, principles: t.principles.length, notes: notes.length, words: notes.reduce((s, a) => s + a.words, 0), tokens: tokens(t.body) };
  });
  return {
    errors: issues.filter(i => i.level === 'error'),
    warnings: issues.filter(i => i.level === 'warn'),
    fixed,
    stats: { topics: topicStats, sources: sourceStats, notes: lib.notes.filter(a => !isRetired(a)).length, ideas: lib.ideas.length, inbox: lib.inbox.length },
  };
}

// ---- the derived parts ----

/**
 * Writes each evidence heading as "### Name (KEY): states it", taking the name from the source's own page. A key
 * alone tells the owner nothing once the library holds thirty sources, and two keys can be one person.
 */
export function nameEvidence(text: string, lib: Library): string {
  let inside = false;
  return text
    .split('\n')
    .map(line => {
      if (line.startsWith('## ')) inside = /^##\s+evidence\s*$/i.test(line);
      if (!inside || !line.startsWith('### ')) return line;
      const head = parseEvidenceHead(line.slice(4).trim());
      const source = sourceByKey(lib, head.key);
      return source ? `### ${sourceName(source)} (${source.key})${head.rest ? ': ' + head.rest : ''}` : line;
    })
    .join('\n');
}

/** The sources a topic rests on, by key, so any citation on its pages can be read without opening another file. */
export function sourceKeys(lib: Library, topic: Topic): string[] {
  const used = new Set<string>();
  for (const p of topic.principles) for (const entry of p.evidence) used.add(entry.key);
  for (const note of lib.notes) if (note.topic === topic.path && !isRetired(note)) for (const key of asList(note.fm.sources)) used.add(key);
  return lib.sources
    .filter(s => used.has(s.key))
    .sort((a, b) => a.key.localeCompare(b.key))
    .map(s => {
      const authors = asList(s.fm.authors).join(', ');
      const facts = [asText(s.fm.kind), asText(s.fm.year)].filter(Boolean).join(', ');
      return `- ${s.key}: ${authors ? authors + ', ' : ''}"${asText(s.fm.title)}"${facts ? ` (${facts})` : ''}`;
    });
}

const GENERATED = "<!-- Generated by Know Fu from the files around it. Don't edit: it's rebuilt on every check. -->";
const GENERATED_LIST = '<!-- Generated by Know Fu from the files in principles/ and notes/. Put the lines in the order a reader should meet them; everything else here is rebuilt on every check. -->';

/**
 * Replaces everything under a "## Title" heading, or removes the section when `content` is null.
 * A missing section is added after the "## after" section, or at the end.
 */
export function setSection(text: string, title: string, content: string[] | null, after?: string, marker = GENERATED): string {
  const lines = text.replace(/\s+$/, '').split('\n');
  const heads: { at: number; title: string }[] = [];
  let fenced = false;
  lines.forEach((line, i) => {
    if (/^(```|~~~)/.test(line.trim())) fenced = !fenced;
    if (!fenced && line.startsWith('## ')) heads.push({ at: i, title: line.slice(3).trim().toLowerCase() });
  });
  const endOf = (index: number) => heads[index + 1]?.at ?? lines.length;
  const made = content ? [`## ${title}`, '', marker, '', ...content, ''] : [];
  const found = heads.findIndex(h => h.title === title.toLowerCase());
  if (found >= 0) lines.splice(heads[found].at, endOf(found) - heads[found].at, ...made);
  else if (content) {
    const anchor = after ? heads.findIndex(h => h.title === after.toLowerCase()) : -1;
    if (anchor >= 0) lines.splice(endOf(anchor), 0, ...made);
    else lines.push('', ...made);
  }
  return lines.join('\n').replace(/\s+$/, '') + '\n';
}

function writeIfChanged(file: string, text: string): boolean {
  if (exists(file) && readText(file) === text) return false;
  writeText(file, text);
  return true;
}

// A note's title, not its summary: one note sits under several principles, and its summary copied into each made
// principle files heavy to load (a grader measured it). The summary is one kf_read away.
const noteLine = (a: Note) => `- [[${a.slug}]] (${asText(a.fm.kind)}): ${asText(a.fm.title)}`;
const count = (n: number, one: string, many = one + 's') => `${n} ${n === 1 ? one : many}`;

/** The topic page's list of principles: a line each, in the order the page already had. */
export function principleList(lib: Library, topic: Topic): string[] {
  const out = topic.principles.map(p => {
    const notes = notesUnder(lib, p).length;
    const summary = p.summary.replace(/\s+/g, ' ').trim();
    return `- [${p.title}](principles/${p.id}.md): ${summary}${/[.!?]$/.test(summary) ? '' : '.'} (${p.support || 'support not stated'}; ${backing(lib, p)}; ${count(notes, 'note')})`;
  });
  if (!out.length) out.push('None yet.');
  const placed = new Set(topic.principles.flatMap(p => notesUnder(lib, p).map(n => n.slug)));
  const rest = lib.notes.filter(n => n.topic === topic.path && !isRetired(n) && !placed.has(n.slug));
  if (rest.length) out.push('', '**Notes under no principle yet:**', '', ...rest.map(noteLine));
  return out;
}


export function libraryIndex(lib: Library): string {
  const out = [GENERATED, '', '# Library index', ''];
  for (const domain of lib.domains) {
    out.push(`## ${asText(domain.fm.title) || domain.name}`, '', asText(domain.fm.summary), '');
    for (const t of lib.topics.filter(t => t.domain === domain.name)) {
      const notes = lib.notes.filter(a => a.topic === t.path && !isRetired(a));
      const sources = new Set(notes.flatMap(a => asList(a.fm.sources)));
      out.push(`- [${asText(t.fm.title) || t.slug}](knowledge/${t.path}/TOPIC.md) \`${t.path}\`: ${asText(t.fm.summary)} (${t.principles.length} principles, ${notes.length} notes, ${sources.size} ${sources.size === 1 ? 'source' : 'sources'})`);
    }
    out.push('');
  }
  out.push('## Sources', '');
  for (const s of lib.sources)
    out.push(`- ${s.key} · [${asText(s.fm.title)}](sources/${s.id}/source.md) (${asText(s.fm.kind)}${asText(s.fm.year) ? ', ' + asText(s.fm.year) : ''}; ${asText(s.fm.units) || s.units.length + ' units'}; ${asText(s.fm.status)})`);
  if (!lib.sources.length) out.push('None yet.');
  if (lib.ideas.length) out.push('', '## Ideas', '', ...lib.ideas.map(i => `- [[${i.slug}]] (${asText(i.fm.status)}): ${asText(i.fm.summary)}`));
  out.push('');
  return out.join('\n');
}

export function applyFixes(root: string): string[] {
  const fixed: string[] = [];
  let lib = loadLibrary(root);
  for (const topic of lib.topics) {
    // A topic page from before 0.12 holds its principles as written text. Nothing here may overwrite that.
    if (topic.legacy) continue;
    const keys = sourceKeys(lib, topic);
    const page = setSection(setSection(readText(topic.file), 'Principles', principleList(lib, topic), 'Frame', GENERATED_LIST), 'Source keys', keys.length ? keys : null);
    if (writeIfChanged(topic.file, page)) fixed.push(`${topic.rel}: the list of principles rebuilt`);
    for (const p of topic.principles) {
      const notes = notesUnder(lib, p).sort((a, b) => a.slug.localeCompare(b.slug));
      if (writeIfChanged(p.file, setSection(nameEvidence(readText(p.file), lib), 'Notes', notes.length ? notes.map(noteLine) : null))) fixed.push(`${p.rel}: its generated parts rebuilt`);
    }
  }
  lib = loadLibrary(root);
  if (writeIfChanged(path.join(root, 'INDEX.md'), libraryIndex(lib))) fixed.push('INDEX.md rebuilt');
  return fixed;
}

// ---- committing ----

function git(root: string, args: string[]) {
  return spawnSync('git', args, { cwd: root, encoding: 'utf8' });
}

export function commitLibrary(root: string, message: string, actor = (process.env.KB_ACTOR ?? '').trim().toLowerCase()): string {
  // Every agent commits under the owner's git identity, so the log line and the commit say which agent it was.
  const by = /^[a-z][a-z0-9-]{0,20}$/.test(actor) ? actor : '';
  if (!exists(path.join(root, '.git'))) {
    const init = git(root, ['init', '-q']);
    if (init.status !== 0) return `not committed: git init failed (${(init.stderr || '').trim() || 'is git installed?'})`;
  }
  const line = `- ${today()} ${by ? `[${by}] ` : ''}${message.replace(/\s+/g, ' ').trim()}\n`;
  const log = path.join(root, 'log.md');
  fs.appendFileSync(log, exists(log) ? line : `# Library log\n\nOne line per change, oldest first.\n\n${line}`);
  git(root, ['add', '-A']);
  const commit = git(root, ['commit', '-q', '-m', message, ...(by ? ['-m', `Written by: ${by}`] : [])]);
  if (commit.status !== 0) {
    const text = `${commit.stdout}${commit.stderr}`.trim();
    return /nothing to commit/i.test(text) ? 'nothing to commit' : `not committed: ${text.slice(0, 300)}`;
  }
  return `committed ${git(root, ['rev-parse', '--short', 'HEAD']).stdout.trim()}`;
}

export function formatReport(report: Report, options: { warnings?: boolean } = {}): string {
  const out: string[] = [];
  const show = (issue: Issue) => `- ${issue.file}${issue.line ? ':' + issue.line : ''} [${issue.code}] ${issue.message}`;
  out.push(report.errors.length ? `${report.errors.length} ${report.errors.length === 1 ? 'error' : 'errors'} to fix:` : 'No errors.');
  out.push(...report.errors.map(show));
  if (options.warnings !== false && report.warnings.length) out.push('', `${report.warnings.length} ${report.warnings.length === 1 ? 'warning' : 'warnings'} (judgment calls; fix or leave with a reason):`, ...report.warnings.map(show));
  if (report.fixed.length) out.push('', 'Brought in step:', ...report.fixed.map(f => `- ${f}`));
  out.push('', 'Library:');
  for (const t of report.stats.topics) out.push(`- ${t.path}: ${t.principles} principles, ${t.notes} notes (${t.words} words), topic page about ${t.tokens} tokens`);
  for (const s of report.stats.sources)
    out.push(
      s.mapped_words
        ? `- ${s.key} ${s.id} [${s.status}]: ${s.mapped_words} of ${s.source_words} words mapped${s.unmapped ? ` (not yet: ${s.unmapped})` : ''}; evidence for ${count(s.principles, 'principle')}, cited by ${count(s.notes, 'note')}`
        : `- ${s.key} ${s.id} [${s.status}]: ${s.source_words} words, not mapped yet; evidence for ${count(s.principles, 'principle')}, cited by ${count(s.notes, 'note')}`,
    );
  if (report.stats.inbox) out.push(`- inbox: ${report.stats.inbox} ${report.stats.inbox === 1 ? 'item' : 'items'} waiting to be woven in`);
  return out.join('\n');
}

// Kept here so the checker stays the one place that knows what a well-formed name is.
export const nameFor = (title: string) => slugify(title);

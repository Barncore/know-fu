// The checker. Agents write the library as free prose; this holds its structure together:
// links and citations that resolve, quoted words that are really in the source, principles that
// govern something, sources whose maps cover every page, and how much was written against how
// much was read. It also keeps the few derived things in step (the Governs line, the indexes).
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { asList, asText } from './frontmatter.ts';
import {
  CONNECTION_VERBS,
  accountPrinciples,
  isRetired,
  loadLibrary,
  resolveLink,
  resolveLoc,
  section,
  sourceByKey,
  unitLabel,
  unitText,
} from './library.ts';
import type { Account, Doc, Library, Source, Topic } from './library.ts';
import { SOURCE_KINDS } from './sources.ts';
import { countWords, exists, isSlug, readText, slugify, squash, today, tokens, writeText } from './util.ts';

export type Issue = { level: 'error' | 'warn'; code: string; file: string; line?: number; message: string };

export const ACCOUNT_KINDS = ['mechanism', 'method', 'case', 'reference', 'debate'];
export const BASES = ['source', 'synthesis', 'owner'];
export const IDEA_STATUSES = ['candidate', 'testing', 'passed', 'failed', 'parked'];

type Shape = { required: string[]; optional: string[]; lists: string[]; enums: Record<string, string[]> };

const SHAPES: Record<string, Shape> = {
  account: {
    required: ['type', 'title', 'summary', 'kind', 'principles', 'sources', 'basis', 'updated'],
    optional: ['keywords', 'status', 'retired_reason'],
    lists: ['principles', 'sources', 'keywords'],
    enums: { kind: ACCOUNT_KINDS, basis: BASES, status: ['active', 'retired'] },
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
  note: { required: ['type', 'title', 'date'], optional: ['from', 'topic'], lists: [], enums: {} },
};

const LIMITS = { accountMin: 80, accountMax: 900, summaryMax: 60, topicTokens: 5000, principlesMax: 15, retelling: 0.3 };

export type Report = {
  errors: Issue[];
  warnings: Issue[];
  fixed: string[];
  stats: {
    topics: { path: string; principles: number; accounts: number; words: number; tokens: number }[];
    sources: { id: string; key: string; status: string; source_words: number; mapped_words: number; unmapped: string; compiled_words: number; ratio: number; accounts: number }[];
    accounts: number;
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
  for (let i = Math.max(0, from - 1); i <= Math.min(source.units.length - 1, to + 1); i++) parts.push(unitText(source, i));
  return squash(parts.join('\n'));
}

function citationIssues(lib: Library, doc: Doc, add: (i: Omit<Issue, 'file'>) => void): Set<string> {
  const used = new Set<string>();
  for (const cite of doc.cites) {
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
      add({ level: 'error', code: 'link', line: link.line, message: `${shown} points at nothing. Link an account by its file name, a topic as domain/topic, a principle as domain/topic#principle-id, a source by its id.` });
      continue;
    }
    if (target.type === 'idea' && zone !== 'idea')
      add({ level: 'error', code: 'idea-as-evidence', line: link.line, message: `${shown} is an idea. Knowledge never rests on an idea; remove the link, or if the idea has been borne out, write what was learned as an account with its own evidence.` });
    if (target.type === 'account' && isRetired(target.account) && zone === 'knowledge')
      add({ level: 'warn', code: 'retired-link', line: link.line, message: `${shown} is retired (${asText(target.account.fm.retired_reason) || 'no reason given'})` });
    if (link.verb !== 'mentions' && !CONNECTION_VERBS.includes(link.verb))
      add({ level: 'warn', code: 'connection-verb', line: link.line, message: `"${link.verb}" isn't a connection verb. Start each Connections line with one of: ${CONNECTION_VERBS.join(', ')}.` });
  }
}

function governedBy(lib: Library, topic: Topic, principleId: string): Account[] {
  return lib.accounts.filter(a => !isRetired(a) && accountPrinciples(a).some(p => (a.topic === topic.path && p === principleId) || p === `${topic.path}#${principleId}`));
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
  for (const [slug, rel] of [...lib.accounts.map(a => [a.slug, a.rel]), ...lib.ideas.map(i => [i.slug, i.rel]), ...lib.sources.map(s => [s.id, s.rel])] as [string, string][]) {
    if (!isSlug(slug)) issues.push({ level: 'error', code: 'name', file: rel, message: `"${slug}" isn't a valid name: use lower-case words joined by hyphens` });
    const earlier = names.get(slug);
    if (earlier) issues.push({ level: 'error', code: 'duplicate', file: rel, message: `the name "${slug}" is also used by ${earlier}; every account, idea and source needs its own` });
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
    citationIssues(lib, topic, add);
    const accounts = lib.accounts.filter(a => a.topic === topic.path && !isRetired(a));
    const frame = section(topic.sections, 'Frame');
    if (!frame?.text) add({ level: 'error', code: 'topic', message: `${frame ? 'the "## Frame" section is empty' : 'no "## Frame" section'}: write a few paragraphs on how this subject hangs together` });
    if (!topic.principles.length) add({ level: accounts.length ? 'error' : 'warn', code: 'topic', message: 'no principles under "## Principles"' });
    if (topic.principles.length > LIMITS.principlesMax)
      add({ level: 'warn', code: 'topic-size', message: `${topic.principles.length} principles. Past ${LIMITS.principlesMax}, a reader can't hold the page; merge the ones that are cases of another, or split the topic.` });
    const size = tokens(topic.body);
    if (size > LIMITS.topicTokens) add({ level: 'warn', code: 'topic-size', message: `about ${size} tokens. The topic page is meant to be read whole; move detail into accounts or split the topic.` });
    const ids = new Set<string>();
    for (const p of topic.principles) {
      if (ids.has(p.id)) add({ level: 'error', code: 'principle', line: p.line, message: `two principles are named "${p.title}"` });
      ids.add(p.id);
      const where = { line: p.line };
      if (countWords(p.statement) < 6) add({ level: 'error', code: 'principle', ...where, message: `"${p.title}" has no statement: say the principle in a sentence or two right under its heading` });
      if (!p.why) add({ level: 'error', code: 'principle', ...where, message: `"${p.title}" has no "- **Why:**" line saying what makes it true` });
      if (!p.breaks) add({ level: 'error', code: 'principle', ...where, message: `"${p.title}" has no "- **Breaks when:**" line. A principle with no boundary is a slogan; say where it stops holding.` });
      const heldKeys = (p.heldBy.match(/\b[A-Z][A-Z0-9]{1,11}\b/g) ?? []).filter(k => keys.has(k));
      if (!heldKeys.length && !/\b(owner|synthesis)\b/i.test(p.heldBy))
        add({ level: 'error', code: 'principle', ...where, message: `"${p.title}" has no "- **Held by:**" line naming a source key (and whether the source states it or you inferred it)` });
      const governed = governedBy(lib, topic, p.id);
      if (governed.length === 0) add({ level: 'error', code: 'principle', ...where, message: `"${p.title}" governs no account. A principle earns its place by explaining specific practices: list its id (${p.id}) under "principles" in the accounts it explains, or drop it.` });
      else if (governed.length === 1) add({ level: 'warn', code: 'principle', ...where, message: `"${p.title}" governs one account (${governed[0].slug}). If it explains nothing else, it may be that account's point and not a principle.` });
    }
    if (accounts.length >= 6 && topic.principles.length < 3)
      add({ level: 'warn', code: 'topic', message: `${accounts.length} accounts under ${topic.principles.length} principles. What ideas do these accounts share?` });
  }

  // ---- accounts ----
  const byTitle: { words: Set<string>; account: Account }[] = [];
  for (const account of lib.accounts) {
    const add = adder(account.rel);
    frontmatterIssues(account, 'account', add);
    const topic = lib.topics.find(t => t.path === account.topic);
    linkIssues(lib, account, account.topic, 'knowledge', add);
    const cited = citationIssues(lib, account, add);
    const listed = new Set(asList(account.fm.sources));
    for (const key of listed) if (!keys.has(key)) add({ level: 'error', code: 'sources', message: `sources lists "${key}", which isn't a source key in the library` });
    for (const key of cited) if (!listed.has(key)) add({ level: 'error', code: 'sources', message: `the text cites ${key} but "sources" doesn't list it; add ${key} to sources` });
    for (const key of listed) if (keys.has(key) && !cited.has(key)) add({ level: 'warn', code: 'sources', message: `sources lists ${key} but nothing in the text cites it with a locator like [${key} p.12]` });
    const basis = asText(account.fm.basis);
    if (basis === 'source' && cited.size === 0) add({ level: 'error', code: 'citation', message: 'basis is "source" but the text cites nothing. Cite where each specific comes from, like [KEY p.12].' });
    if (isRetired(account)) continue;
    for (const p of accountPrinciples(account)) {
      const [ref, id] = p.includes('#') ? p.split('#') : [account.topic, p];
      const home = lib.topics.find(t => t.path === ref);
      if (!home?.principles.some(x => x.id === id))
        add({ level: 'error', code: 'principle', message: `principles lists "${p}", but ${ref} has no principle with that id${home ? ` (it has: ${home.principles.map(x => x.id).join(', ') || 'none'})` : ''}` });
    }
    if (!accountPrinciples(account).length && topic) add({ level: 'warn', code: 'orphan', message: 'no principle governs this account. Which idea on the topic page is it a case of? If none, the page may be missing one.' });
    const summary = asText(account.fm.summary);
    if (countWords(summary) > LIMITS.summaryMax) add({ level: 'warn', code: 'summary', message: `the summary runs ${countWords(summary)} words; a reader decides from it whether to open the account, so keep it under ${LIMITS.summaryMax}` });
    if (account.words < LIMITS.accountMin) add({ level: 'warn', code: 'size', message: `${account.words} words. Too thin to stand alone: fold it into the account it belongs with.` });
    if (account.words > LIMITS.accountMax) add({ level: 'warn', code: 'size', message: `${account.words} words. If it holds two ideas a reader would look up separately, split it; if it retells the source, cut to what a strong general model wouldn't already say.` });
    const words = new Set(
      asText(account.fm.title)
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter(w => w.length > 3),
    );
    for (const other of byTitle) {
      const shared = [...words].filter(w => other.words.has(w)).length;
      const union = new Set([...words, ...other.words]).size;
      if (union >= 4 && shared / union >= 0.7) add({ level: 'warn', code: 'duplicate', message: `the title is close to ${other.account.slug}'s. One idea is held once: merge them, or make the titles say what differs.` });
    }
    byTitle.push({ words, account });
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
    const citing = lib.accounts.filter(a => !isRetired(a) && asList(a.fm.sources).includes(source.key));
    const compiledWords = citing.reduce((sum, a) => sum + a.words, 0);
    // What has been read so far is what the map covers. A long source ingested over several sessions is
    // measured against that, never against pages nobody has read yet.
    const covered = new Set<number>();
    for (const entry of source.map) {
      if (entry.from < 0) add({ level: 'error', code: 'map', line: entry.line, message: `the heading "${entry.title}" needs a range the source has at its end, like [${source.units[0] ? unitLabel(source.units[0]) : 'p.1'}-…]` });
      else for (let i = entry.from; i <= entry.to; i++) covered.add(i);
      if (entry.from >= 0 && countWords(entry.text) < 25) add({ level: 'warn', code: 'map', line: entry.line, message: `the digest under "${entry.title}" is nearly empty` });
    }
    const mappedWords = covered.size ? [...covered].reduce((sum, i) => sum + source.units[i].words, 0) : source.sourceWords;
    const ratio = mappedWords ? compiledWords / mappedWords : 0;
    const gaps = source.units.map((u, i) => (covered.has(i) || u.flags.includes('blank') ? -1 : i)).filter(i => i >= 0);
    sourceStats.push({
      id: source.id,
      key: source.key,
      status,
      source_words: source.sourceWords,
      mapped_words: covered.size ? mappedWords : 0,
      unmapped: covered.size && gaps.length ? ranges(gaps, source) : '',
      compiled_words: compiledWords,
      ratio: Math.round(ratio * 1000) / 1000,
      accounts: citing.length,
    });
    if (covered.size && ratio > LIMITS.retelling)
      add({ level: 'warn', code: 'retelling', message: `accounts citing this source total ${compiledWords} words against the ${mappedWords} words mapped so far: ${Math.round(ratio * 100)}%. Dense technical material can run this high, but check for retelling: keep what a strong general model wouldn't already say, since the original stays searchable.` });
    if (status !== 'compiled') continue;
    const todo = source.body.split('\n').findIndex(l => l.trim().startsWith('TODO:'));
    if (todo >= 0) add({ level: 'error', code: 'source', line: source.bodyLine + todo, message: 'a TODO placeholder is still here; a compiled source has its About, Map and What it changed written' });
    if (!source.map.length) add({ level: 'error', code: 'map', message: 'no map: under "## Map", one "### Title [p.A-B]" heading per stretch of the source, each with its digest' });
    if (source.map.length && gaps.length) add({ level: 'error', code: 'map', message: `no digest covers ${ranges(gaps, source)}. Every part of a source is read and mapped, even when the digest says "nothing worth keeping here". A source read only in part keeps status "registered".` });
    if (!citing.length) add({ level: 'warn', code: 'source', message: 'compiled, but no account lists it as a source. If it added nothing, say so under "What it changed".' });
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
      if (!target || target.type === 'idea') add({ level: 'error', code: 'idea', message: `premise "${premise}" isn't an account or principle in the library. An idea rests on knowledge, named by account file name or domain/topic#principle-id.` });
    }
  }
  for (const note of lib.inbox) frontmatterIssues(note, 'note', adder(note.rel));

  const topicStats = lib.topics.map(t => {
    const accounts = lib.accounts.filter(a => a.topic === t.path && !isRetired(a));
    return { path: t.path, principles: t.principles.length, accounts: accounts.length, words: accounts.reduce((s, a) => s + a.words, 0), tokens: tokens(t.body) };
  });
  return {
    errors: issues.filter(i => i.level === 'error'),
    warnings: issues.filter(i => i.level === 'warn'),
    fixed,
    stats: { topics: topicStats, sources: sourceStats, accounts: lib.accounts.filter(a => !isRetired(a)).length, ideas: lib.ideas.length, inbox: lib.inbox.length },
  };
}

// ---- the derived parts ----

const GENERATED = "<!-- Generated by Know Fu from the files around it. Don't edit: it's rebuilt on every check. -->";

/** Rewrites each principle's Governs line from the accounts that name it, so the topic page's links can't drift. */
function syncGoverns(lib: Library, topic: Topic): boolean {
  const lines = readText(topic.file).split('\n');
  let changed = false;
  for (const p of topic.principles) {
    const start = p.line - 1;
    if (!lines[start]?.startsWith('### ')) continue;
    let end = start + 1;
    while (end < lines.length && !/^#{2,3} /.test(lines[end])) end++;
    const governed = governedBy(lib, topic, p.id)
      .map(a => a.slug)
      .sort();
    const wanted = governed.length ? `- **Governs:** ${governed.map(s => `[[${s}]]`).join(', ')}` : null;
    let at = -1;
    for (let i = start + 1; i < end; i++) if (/^\s*[-*]\s+\*\*Governs:?\*\*/.test(lines[i])) at = i;
    if (at >= 0) {
      let span = 1;
      while (at + span < end && /^\s{2,}\S/.test(lines[at + span])) span++;
      const current = lines.slice(at, at + span).join('\n');
      if (wanted === null) {
        lines.splice(at, span);
        changed = true;
      } else if (current !== wanted) {
        lines.splice(at, span, wanted);
        changed = true;
      }
    } else if (wanted) {
      // After the last field line of the principle, before any trailing blank lines.
      let insert = end;
      while (insert > start + 1 && !lines[insert - 1].trim()) insert--;
      lines.splice(insert, 0, wanted);
      changed = true;
    }
    if (changed) {
      // Line numbers below this principle have moved; reload and continue from fresh positions.
      writeText(topic.file, lines.join('\n'));
      const fresh = loadLibrary(lib.root);
      const again = fresh.topics.find(t => t.path === topic.path)!;
      return syncGoverns(fresh, again) || true;
    }
  }
  return changed;
}

function writeIfChanged(file: string, text: string): boolean {
  if (exists(file) && readText(file) === text) return false;
  writeText(file, text);
  return true;
}

export function topicIndex(lib: Library, topic: Topic): string {
  const accounts = lib.accounts.filter(a => a.topic === topic.path && !isRetired(a));
  const line = (a: Account) => `- [[${a.slug}]] (${asText(a.fm.kind)}): ${asText(a.fm.summary)}`;
  const out = [GENERATED, '', `# ${asText(topic.fm.title) || topic.slug}: every account`, ''];
  const placed = new Set<string>();
  for (const p of topic.principles) {
    const governed = governedBy(lib, topic, p.id).sort((a, b) => a.slug.localeCompare(b.slug));
    out.push(`## ${p.title}`, '', `id: \`${p.id}\``, '', p.statement, '');
    for (const a of governed) {
      out.push(line(a));
      placed.add(a.slug);
    }
    out.push('');
  }
  const rest = accounts.filter(a => !placed.has(a.slug));
  if (rest.length) out.push('## Under no principle yet', '', ...rest.map(line), '');
  return out.join('\n');
}

export function libraryIndex(lib: Library): string {
  const out = [GENERATED, '', '# Library index', ''];
  for (const domain of lib.domains) {
    out.push(`## ${asText(domain.fm.title) || domain.name}`, '', asText(domain.fm.summary), '');
    for (const t of lib.topics.filter(t => t.domain === domain.name)) {
      const accounts = lib.accounts.filter(a => a.topic === t.path && !isRetired(a));
      const sources = new Set(accounts.flatMap(a => asList(a.fm.sources)));
      out.push(`- [${asText(t.fm.title) || t.slug}](knowledge/${t.path}/TOPIC.md) \`${t.path}\`: ${asText(t.fm.summary)} (${t.principles.length} principles, ${accounts.length} accounts, ${sources.size} ${sources.size === 1 ? 'source' : 'sources'})`);
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
  for (const topic of lib.topics) if (syncGoverns(lib, topic)) fixed.push(`${topic.rel}: Governs lines brought in step with the accounts`);
  lib = loadLibrary(root);
  for (const topic of lib.topics) if (writeIfChanged(path.join(topic.dir, '_index.md'), topicIndex(lib, topic))) fixed.push(`knowledge/${topic.path}/_index.md rebuilt`);
  if (writeIfChanged(path.join(root, 'INDEX.md'), libraryIndex(lib))) fixed.push('INDEX.md rebuilt');
  return fixed;
}

// ---- committing ----

function git(root: string, args: string[]) {
  return spawnSync('git', args, { cwd: root, encoding: 'utf8' });
}

export function commitLibrary(root: string, message: string): string {
  if (!exists(path.join(root, '.git'))) {
    const init = git(root, ['init', '-q']);
    if (init.status !== 0) return `not committed: git init failed (${(init.stderr || '').trim() || 'is git installed?'})`;
  }
  const line = `- ${today()} ${message.replace(/\s+/g, ' ').trim()}\n`;
  const log = path.join(root, 'log.md');
  fs.appendFileSync(log, exists(log) ? line : `# Library log\n\nOne line per change, oldest first.\n\n${line}`);
  git(root, ['add', '-A']);
  const commit = git(root, ['commit', '-q', '-m', message]);
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
  for (const t of report.stats.topics) out.push(`- ${t.path}: ${t.principles} principles, ${t.accounts} accounts (${t.words} words), topic page about ${t.tokens} tokens`);
  for (const s of report.stats.sources)
    out.push(
      s.mapped_words
        ? `- ${s.key} ${s.id} [${s.status}]: ${s.mapped_words} of ${s.source_words} words mapped${s.unmapped ? ` (not yet: ${s.unmapped})` : ''}; ${s.compiled_words} words in ${s.accounts} accounts citing it, ${Math.round(s.ratio * 100)}% of what is mapped`
        : `- ${s.key} ${s.id} [${s.status}]: ${s.source_words} words, not mapped yet; ${s.compiled_words} words in ${s.accounts} accounts citing it`,
    );
  if (report.stats.inbox) out.push(`- inbox: ${report.stats.inbox} ${report.stats.inbox === 1 ? 'note' : 'notes'} waiting to be woven in`);
  return out.join('\n');
}

// Kept here so the checker stays the one place that knows what a well-formed name is.
export const nameFor = (title: string) => slugify(title);

// Full-text search over the library, in a SQLite file under .knowfu/ that can be deleted at any time.
// It is rebuilt from the Markdown files a file at a time, whenever one of them has changed.
import fs from 'node:fs';
import path from 'node:path';
import { asList, asText } from './frontmatter.ts';
import { isRetired, unitLabel, unitText } from './library.ts';
import type { Library } from './library.ts';
import { exists } from './util.ts';

export type Tier = 'principle' | 'account' | 'topic' | 'map' | 'page' | 'idea';

export type Hit = {
  tier: Tier;
  /** Account or idea name, "domain/topic#principle-id", topic path, or "KEY p.12". */
  ref: string;
  topic: string;
  title: string;
  summary: string;
  score: number;
  snippet: string;
};

type Row = { path: string; tier: Tier; ref: string; topic: string; title: string; summary: string; keywords: string; body: string };

function sqlite(): any {
  // node:sqlite prints an "experimental" warning on first load in Node 22 and 24. It is stable enough here,
  // and a warning on stderr reads like a fault to anyone watching a server start.
  const emit = process.emitWarning;
  process.emitWarning = () => {};
  try {
    return (process as any).getBuiltinModule('node:sqlite');
  } finally {
    process.emitWarning = emit;
  }
}

function open(root: string) {
  const dir = path.join(root, '.knowfu');
  fs.mkdirSync(dir, { recursive: true });
  const { DatabaseSync } = sqlite();
  const db = new DatabaseSync(path.join(dir, 'index.sqlite'));
  db.exec(`
    pragma journal_mode = wal;
    create table if not exists files (path text primary key, stamp text not null);
    create table if not exists docs (id integer primary key, path text not null, tier text not null, ref text not null, topic text not null, title text not null, summary text not null);
    create index if not exists docs_path on docs (path);
    create virtual table if not exists fts using fts5 (title, summary, keywords, body, tokenize = 'porter unicode61 remove_diacritics 2');
  `);
  return db;
}

const stamp = (file: string) => {
  const s = fs.statSync(file);
  return `${Math.floor(s.mtimeMs)}:${s.size}`;
};

/** Every searchable row a file contributes. */
function rowsByFile(lib: Library): Map<string, Row[]> {
  const files = new Map<string, Row[]>();
  const put = (file: string, row: Omit<Row, 'path'>) => {
    if (!files.has(file)) files.set(file, []);
    files.get(file)!.push({ path: file, ...row });
  };
  for (const topic of lib.topics) {
    files.set(topic.file, []);
    put(topic.file, { tier: 'topic', ref: topic.path, topic: topic.path, title: asText(topic.fm.title), summary: asText(topic.fm.summary), keywords: asList(topic.fm.keywords).join(' '), body: topic.frame });
    for (const p of topic.principles)
      put(topic.file, { tier: 'principle', ref: `${topic.path}#${p.id}`, topic: topic.path, title: p.title, summary: p.statement, keywords: '', body: `${p.why}\n${p.breaks}` });
  }
  for (const account of lib.accounts) {
    files.set(account.file, []);
    if (isRetired(account)) continue;
    put(account.file, {
      tier: 'account',
      ref: account.slug,
      topic: account.topic,
      title: asText(account.fm.title),
      summary: asText(account.fm.summary),
      keywords: [...asList(account.fm.keywords), account.slug.replace(/-/g, ' ')].join(' '),
      body: account.body,
    });
  }
  for (const idea of lib.ideas) put(idea.file, { tier: 'idea', ref: idea.slug, topic: '', title: asText(idea.fm.title), summary: asText(idea.fm.summary), keywords: '', body: idea.body });
  for (const source of lib.sources) {
    files.set(source.file, []);
    for (const entry of source.map) put(source.file, { tier: 'map', ref: `${source.key} ${entry.range}`, topic: '', title: `${asText(source.fm.title)}: ${entry.title.replace(/\s*\[[^\]]*\]\s*$/, '')}`, summary: '', keywords: '', body: entry.text });
    const text = path.join(source.dir, 'text.txt');
    if (!exists(text)) continue;
    files.set(text, []);
    source.units.forEach((unit, i) => {
      if (unit.words) put(text, { tier: 'page', ref: `${source.key} ${unit.kind === 'time' ? unitLabel(unit).split('-')[0] : unit.loc}`, topic: '', title: asText(source.fm.title), summary: '', keywords: '', body: unitText(source, i) });
    });
  }
  return files;
}

/** Brings the index in step with the files. Returns how many files were re-read. */
export function syncIndex(lib: Library): number {
  const db = open(lib.root);
  try {
    const files = rowsByFile(lib);
    const known = new Map<string, string>(db.prepare('select path, stamp from files').all().map((r: any) => [r.path, r.stamp]));
    const drop = (file: string) => {
      db.prepare('delete from fts where rowid in (select id from docs where path = ?)').run(file);
      db.prepare('delete from docs where path = ?').run(file);
      db.prepare('delete from files where path = ?').run(file);
    };
    const insertDoc = db.prepare('insert into docs (path, tier, ref, topic, title, summary) values (?, ?, ?, ?, ?, ?)');
    const insertFts = db.prepare('insert into fts (rowid, title, summary, keywords, body) values (?, ?, ?, ?, ?)');
    const insertFile = db.prepare('insert into files (path, stamp) values (?, ?)');
    let changed = 0;
    db.exec('begin');
    for (const file of known.keys()) if (!files.has(file)) drop(file);
    for (const [file, rows] of files) {
      const now = stamp(file);
      if (known.get(file) === now) continue;
      changed++;
      drop(file);
      for (const row of rows) {
        const { lastInsertRowid } = insertDoc.run(row.path, row.tier, row.ref, row.topic, row.title, row.summary);
        insertFts.run(lastInsertRowid, row.title, row.summary, row.keywords, row.body);
      }
      insertFile.run(file, now);
    }
    db.exec('commit');
    return changed;
  } finally {
    db.close();
  }
}

const STOP = new Set(
  'a an and are as at be but by can do does for from has have how i if in into is it its me my of on or our so than that the their them then there these they this to up was we what when where which who why will with would you your about should make get use using'.split(
    ' ',
  ),
);

export function queryTerms(query: string): string[] {
  const terms = query
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/)
    .filter(t => t.length >= 2 && !STOP.has(t));
  return [...new Set(terms)];
}

export function search(lib: Library, query: string, options: { tiers?: Tier[]; limit?: number; topic?: string } = {}): Hit[] {
  const terms = queryTerms(query);
  if (!terms.length) return [];
  syncIndex(lib);
  const db = open(lib.root);
  try {
    const tiers = options.tiers ?? ['principle', 'account', 'topic'];
    const marks = tiers.map(() => '?').join(', ');
    const topic = options.topic ? ' and docs.topic = ?' : '';
    // Any term may match; bm25 then ranks by how many did and how rare they are. Title and keywords count most.
    const match = terms.map(t => `"${t}"`).join(' OR ');
    const rows = db
      .prepare(
        `select docs.tier, docs.ref, docs.topic, docs.title, docs.summary, -bm25(fts, 8.0, 4.0, 5.0, 1.0) as score,
                snippet(fts, 3, '', '', ' … ', 28) as snippet
         from fts join docs on docs.id = fts.rowid
         where fts match ? and docs.tier in (${marks})${topic}
         order by score desc limit ?`,
      )
      .all(match, ...tiers, ...(options.topic ? [options.topic] : []), options.limit ?? 20);
    return rows.map((r: any) => ({ ...r, snippet: String(r.snippet ?? '').replace(/\s+/g, ' ').trim() }));
  } finally {
    db.close();
  }
}

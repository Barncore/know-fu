// Moves a library laid out the way Know Fu was before 0.12 to the current layout:
//
//   principles written on the topic page   ->  one file each under principles/
//   accounts/ (type: account)              ->  notes/ (type: note)
//   _index.md beside each topic page       ->  gone; the topic page lists its principles itself
//   inbox files of type "note"             ->  type "inbox"
//
// It moves what is there and judges nothing. How well a principle's logic holds and what kind of support it
// has are a reader's calls, so those lines are written as TODO and the checker lists them until they are made.
import fs from 'node:fs';
import path from 'node:path';
import { applyFixes, setSection } from './check.ts';
import { asText, formatFrontmatter, parseFrontmatter } from './frontmatter.ts';
import { loadLibrary, parseFields, section, splitSections } from './library.ts';
import { countWords, exists, listDirs, listFiles, readText, slugify, today, writeText } from './util.ts';

const LOC = /(?:p|s)\.\d+(?:-\d+)?|\d{1,2}:\d{2}(?::\d{2})?(?:-\d{1,2}:\d{2}(?::\d{2})?)?/g;
const firstSentence = (text: string) => (/^.*?[.!?](?=\s|$)/.exec(text.trim())?.[0] ?? text.trim()).trim();

/** "WKH (stated, s.2); ATK (inferred, 0:20)" becomes one evidence entry per source it names. */
function evidenceFrom(heldBy: string, keys: Set<string>): string[] {
  const out: string[] = [];
  // Each source's part runs from its name to the next name, however the line was punctuated.
  const starts = [...heldBy.matchAll(/\b[A-Z][A-Z0-9]{1,11}\b|\b(?:owner|synthesis)\b/gi)].filter(m => keys.has(m[0]) || /^(owner|synthesis)$/i.test(m[0])).map(m => m.index ?? 0);
  const parts = starts.map((at, i) =>
    heldBy
      .slice(at, starts[i + 1] ?? heldBy.length)
      .replace(/[\s;,.]+$/, '')
      .trim(),
  );
  const seen = new Set<string>();
  for (const part of parts) {
    const key = (part.match(/\b[A-Z][A-Z0-9]{1,11}\b/g) ?? []).find(k => keys.has(k));
    const own = /\bowner\b/i.test(part) ? 'Owner' : /\bsynthesis\b/i.test(part) ? 'Synthesis' : '';
    const name = key ?? own;
    if (!name || seen.has(name)) continue;
    seen.add(name);
    if (!key) {
      out.push(`### ${name}`, '', `TODO: say what this rests on. Before the move to principle files this read: ${part}`, '');
      continue;
    }
    const stance = /\b(infer|impl)/i.test(part) ? 'implies it' : /\bqualif/i.test(part) ? 'qualifies it' : /\bdisput/i.test(part) ? 'disputes it' : 'states it';
    const cites = (part.match(LOC) ?? []).map(loc => `[${key} ${loc}]`);
    out.push(`### ${key}: ${stance}`, '', `${cites.length ? `Found at ${cites.join(', ')}. ` : ''}TODO: say what this source brings to the principle: its reasoning, its cases, where it draws the limit. Before the move to principle files this read: ${part}`, '');
  }
  if (!out.length) out.push('TODO: add an entry per source, headed like "### KEY: states it".' + (heldBy ? ` Before the move to principle files this read: ${heldBy}` : ''), '');
  return out;
}

export function migrateLibrary(root: string, options: { dryRun?: boolean } = {}): string {
  const done: string[] = [];
  const dry = !!options.dryRun;
  const keys = new Set<string>();
  for (const id of listDirs(path.join(root, 'sources'))) {
    const file = path.join(root, 'sources', id, 'source.md');
    if (exists(file)) keys.add(asText(parseFrontmatter(readText(file)).fm.key));
  }
  const retype = (file: string, from: string, to: string): boolean => {
    const text = readText(file);
    const head = /^---\n[\s\S]*?\n---/.exec(text)?.[0] ?? '';
    const next = head.replace(new RegExp(`^type:\\s*${from}\\s*$`, 'm'), `type: ${to}`);
    if (next === head) return false;
    if (!dry) writeText(file, next + text.slice(head.length));
    return true;
  };

  const knowledge = path.join(root, 'knowledge');
  for (const domain of listDirs(knowledge))
    for (const topic of listDirs(path.join(knowledge, domain))) {
      const dir = path.join(knowledge, domain, topic);
      const rel = `knowledge/${domain}/${topic}`;

      // accounts/ becomes notes/.
      const old = path.join(dir, 'accounts');
      const notes = path.join(dir, 'notes');
      if (exists(old)) {
        const names = listFiles(old);
        if (!dry) {
          fs.mkdirSync(notes, { recursive: true });
          for (const name of fs.readdirSync(old)) {
            if (exists(path.join(notes, name))) throw new Error(`${rel}/notes/${name} already exists; move or remove one of the two before migrating.`);
            fs.renameSync(path.join(old, name), path.join(notes, name));
          }
          fs.rmdirSync(old);
        }
        done.push(`${rel}: accounts/ renamed to notes/ (${names.length} files)`);
      }
      let retyped = 0;
      for (const name of listFiles(dry && exists(old) ? old : notes)) if (retype(path.join(dry && exists(old) ? old : notes, name), 'account', 'note')) retyped++;
      if (retyped) done.push(`${rel}: ${retyped} files changed from type account to type note`);

      // Principles leave the topic page.
      const page = path.join(dir, 'TOPIC.md');
      if (exists(page)) {
        const parsed = parseFrontmatter(readText(page));
        const block = section(splitSections(parsed.body, parsed.bodyLine), 'Principles');
        const written = block ? splitSections(block.raw, block.line + 1, 3) : [];
        if (written.length) {
          const order: string[] = [];
          for (const s of written) {
            const id = slugify(s.title);
            const { statement, fields } = parseFields(s.text);
            const file = path.join(dir, 'principles', `${id}.md`);
            order.push(`- [${s.title}](principles/${id}.md)`);
            if (exists(file)) continue;
            const kept = Object.entries(fields).filter(([name]) => !['why', 'breaks when', 'held by', 'governs', 'merit'].includes(name));
            const body = [
              `# ${s.title}`,
              '',
              statement,
              '',
              `- **Why:** ${fields['why'] ?? 'TODO: say what makes it true.'}`,
              `- **Breaks when:** ${fields['breaks when'] ?? 'TODO: say where it stops holding.'}`,
              '- **Merit:** TODO: weigh the reasoning. Does the "because" follow from what the sources show, what is the strongest objection, and where is the support thin?',
              ...kept.map(([name, value]) => `- **${name.replace(/^./, c => c.toUpperCase())}:** ${value}`),
              '',
              '## Evidence',
              '',
              ...evidenceFrom(fields['held by'] ?? '', keys),
            ].join('\n');
            const summary = countWords(statement) <= 55 ? statement : firstSentence(statement);
            if (!dry) writeText(file, formatFrontmatter({ type: 'principle', title: s.title, summary, support: 'TODO', updated: today() }) + '\n' + body.replace(/\s+$/, '') + '\n');
            done.push(`${rel}/principles/${id}.md written from the topic page`);
          }
          // The page keeps the order its principles were written in; the checker fills in each line.
          if (!dry) writeText(page, setSection(readText(page), 'Principles', order, 'Frame'));
          done.push(`${rel}/TOPIC.md: ${written.length} principles moved out; the page now lists them`);
        }
      }
      const index = path.join(dir, '_index.md');
      if (exists(index)) {
        if (!dry) fs.rmSync(index);
        done.push(`${rel}/_index.md removed (the topic page lists the principles, and each principle file lists its notes)`);
      }
    }

  let inbox = 0;
  for (const name of listFiles(path.join(root, 'inbox'))) if (retype(path.join(root, 'inbox', name), 'note', 'inbox')) inbox++;
  if (inbox) done.push(`inbox: ${inbox} files changed from type note to type inbox`);

  if (!done.length) return 'Nothing to migrate: this library is already laid out as principle files and notes.';
  if (dry) return ['A migration would do this (nothing was changed):', ...done.map(line => `- ${line}`)].join('\n');
  const fixed = applyFixes(root);
  const todo = loadLibrary(root)
    .topics.flatMap(t => t.principles)
    .filter(p => /\bTODO\b/.test(readText(p.file))).length;
  return [
    'Migrated:',
    ...done.map(line => `- ${line}`),
    ...fixed.map(line => `- ${line}`),
    '',
    todo
      ? `${todo} principle ${todo === 1 ? 'file has' : 'files have'} TODO lines. Each needs a reader to open its sources and write three things: its "support" (the kind of evidence it rests on), its Merit line (how well the reasoning holds), and what each source brings under "## Evidence". kf_check lists them. Nothing is committed yet.`
      : 'Run kf_check, then commit. Nothing is committed yet.',
  ].join('\n');
}

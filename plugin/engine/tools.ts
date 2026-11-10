// The nine tools, defined once and served two ways: over MCP (mcp.ts) and from a shell (cli.ts).
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { checkLibrary, commitLibrary, formatReport } from './check.ts';
import { configPath, isHome, loadConfig, pinsFor, projectDir, requireHome, saveConfig } from './config.ts';
import type { Config } from './config.ts';
import { findPoppler, findTool } from './extract.ts';
import { formatFrontmatter, asText } from './frontmatter.ts';
import { loadLibrary, topicByPath } from './library.ts';
import { brief, connect, read, recall } from './recall.ts';
import { syncIndex } from './search.ts';
import { addSource } from './sources.ts';
import { exists, fail, readJson, samePath, slugify, today, writeText } from './util.ts';

export type ToolResult = { text: string; image?: string };
export type Tool = { name: string; description: string; inputSchema: Record<string, unknown>; run: (args: Record<string, any>) => Promise<ToolResult> | ToolResult };

const ENGINE_DIR = import.meta.dirname;
export const GUIDES_DIR = path.join(ENGINE_DIR, '..', 'skills', 'know-fu', 'references');

export function version(): string {
  try {
    return readJson(path.join(ENGINE_DIR, '..', '.claude-plugin', 'plugin.json')).version;
  } catch {
    return 'unknown';
  }
}

/** One writer at a time. Two agents can share a library because only one of them holds this while it changes files. */
async function withLock<T>(config: Config, what: string, work: () => Promise<T> | T): Promise<T> {
  const lock = path.join(config.library, '.knowfu', 'write.lock');
  fs.mkdirSync(path.dirname(lock), { recursive: true });
  if (exists(lock)) {
    const held = fs.statSync(lock);
    if (Date.now() - held.mtimeMs < 30 * 60 * 1000) fail('BUSY', `Another session is changing the library (${fs.readFileSync(lock, 'utf8').trim()}). Wait for it to finish, or delete ${lock} if that session is gone.`);
    fs.rmSync(lock, { force: true });
  }
  fs.writeFileSync(lock, `${what}, started ${new Date().toISOString()} from ${projectDir()}`, { flag: 'wx' });
  try {
    return await work();
  } finally {
    fs.rmSync(lock, { force: true });
  }
}

function tryTool(find: () => string): string {
  try {
    return find();
  } catch {
    return 'not found';
  }
}

function status(): string {
  const out = [`Know Fu ${version()}`, `Config: ${configPath()}`];
  let config: Config;
  try {
    config = loadConfig();
  } catch (error: any) {
    return [...out, '', `Not set up: ${error.message}`].join('\n');
  }
  const project = projectDir();
  out.push(`Library: ${config.library}${exists(config.library) ? '' : '  (this folder does not exist)'}`);
  out.push(`This session: ${project} (${isHome(config) ? 'the home session: it can ingest and edit' : 'reads the library; saves notes to its inbox'})`);
  const pins = pinsFor(config);
  if (pins.length) out.push(`Pinned here: ${pins.join(', ')}`);
  out.push(`Use: ${config.deliberate_use === false ? 'open in every chat' : 'deliberate (tools open after /know-fu, or in a pinned project)'}`);
  if (!exists(config.library)) return out.join('\n');
  const lib = loadLibrary(config.library);
  const report = checkLibrary(config.library);
  out.push('', `${lib.domains.length} domains, ${lib.topics.length} topics, ${report.stats.accounts} accounts, ${lib.sources.length} sources, ${lib.ideas.length} ideas, ${lib.inbox.length} inbox notes.`);
  for (const t of report.stats.topics) out.push(`- ${t.path}: ${t.principles} principles, ${t.accounts} accounts`);
  for (const s of report.stats.sources) out.push(`- ${s.key} ${s.id}: ${s.status}`);
  out.push(report.errors.length ? `Check: ${report.errors.length} errors, ${report.warnings.length} warnings. Run kf_check to see them.` : `Check: no errors, ${report.warnings.length} warnings.`);
  const git = spawnSync('git', ['status', '--porcelain'], { cwd: config.library, encoding: 'utf8' });
  if (git.status === 0) {
    const dirty = git.stdout.split('\n').filter(Boolean).length;
    const last = spawnSync('git', ['log', '-1', '--format=%h %cs %s'], { cwd: config.library, encoding: 'utf8' }).stdout.trim();
    out.push(`History: ${last || 'no commits yet'}${dirty ? `; ${dirty} uncommitted ${dirty === 1 ? 'change' : 'changes'}` : ''}`);
  } else out.push('History: the library is not a git repository yet (kf_check with commit creates one).');
  out.push(
    '',
    'Tools on this machine:',
    `- PDF text and page images (Poppler): ${tryTool(() => findPoppler(config))}`,
    `- EPUB, DOCX, HTML (pandoc): ${tryTool(() => findTool(config, 'pandoc'))}`,
    `- audio and video (ffmpeg): ${tryTool(() => findTool(config, 'ffmpeg'))}`,
    `- transcription API: ${config.transcription?.endpoint ? `${config.transcription.model} at ${new URL(config.transcription.endpoint).host}` : 'not configured (transcript files still work)'}`,
  );
  return out.join('\n');
}

function note(config: Config, args: Record<string, any>): string {
  const title = String(args.title ?? '').trim();
  const body = String(args.body ?? '').trim();
  if (!title || !body) fail('INVALID', 'A note needs a title and a body.');
  const file = path.join(config.library, 'inbox', `${today()}-${slugify(title).slice(0, 50) || 'note'}.md`);
  if (exists(file)) fail('EXISTS', `A note with that title was already saved today (${file}). Give this one a different title.`);
  writeText(file, formatFrontmatter({ type: 'note', title, date: today(), from: projectDir(), topic: args.topic ? String(args.topic) : undefined }) + '\n' + body + '\n');
  return `Saved to the library's inbox: ${file}. It becomes part of the library when a home session weaves it into an account or an idea.`;
}

function pin(config: Config, args: Record<string, any>): string {
  const project = path.resolve(String(args.project ?? projectDir()));
  const lib = loadLibrary(config.library);
  if (args.topic === undefined && !args.remove) {
    const all = Object.entries(config.pins ?? {});
    return all.length ? all.map(([folder, topics]) => `${folder}: ${topics.join(', ')}`).join('\n') : 'Nothing is pinned.';
  }
  const topic = topicByPath(lib, String(args.topic ?? ''));
  if (!topic && !args.remove) fail('NOT_FOUND', `No topic "${args.topic}". Topics: ${lib.topics.map(t => t.path).join(', ') || 'none yet'}.`);
  let after: string[] = [];
  saveConfig(raw => {
    raw.pins = raw.pins ?? {};
    const key = Object.keys(raw.pins).find(k => samePath(k, project)) ?? project;
    const current: string[] = raw.pins[key] ?? [];
    after = args.remove ? (topic ? current.filter(t => t !== topic.path) : []) : [...new Set([...current, topic!.path])];
    if (after.length) raw.pins[key] = after;
    else delete raw.pins[key];
  });
  return after.length
    ? `${project} now has ${after.join(', ')} pinned. New sessions there start with ${after.length === 1 ? "that topic's" : "those topics'"} principles in context, and Know Fu's tools are open without invoking the skill.`
    : `${project} has nothing pinned now.`;
}

const str = (description: string) => ({ type: 'string', description });

export const TOOLS: Tool[] = [
  {
    name: 'kf_status',
    description: "Know Fu's setup on this machine: the library path, what it holds, whether this session can edit it, and which extraction tools are available.",
    inputSchema: { type: 'object', properties: {} },
    run: () => ({ text: status() }),
  },
  {
    name: 'kf_brief',
    description: 'Orientation. With no topic: the domains and topics the library holds. With a topic path (like "audio/mixing"): that topic\'s frame and principles, the page to hold in mind while working in the subject.',
    inputSchema: { type: 'object', properties: { topic: str('A topic path such as "audio/mixing". Omit for the library overview.') } },
    run: args => ({ text: brief(loadLibrary(loadConfig().library), args.topic ? String(args.topic) : undefined) }),
  },
  {
    name: 'kf_recall',
    description:
      'Answer material for a specific question: the principles in play, the best-matching accounts in full, anything that disputes or qualifies them, and where the original sources speak to it. Split a compound question into sub-questions and pass them as a list.',
    inputSchema: {
      type: 'object',
      required: ['query'],
      properties: {
        query: { description: 'The question in plain words, or a list of sub-questions.', anyOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] },
        topic: str('Limit to one topic path.'),
        budget: { type: 'number', description: 'Approximate tokens to return. Default 4000; raise it for broad synthesis.' },
        load: { type: 'string', enum: ['accounts', 'gists'], description: '"gists" returns one line per matching account, to choose from before loading any.' },
        seen: { type: 'array', items: { type: 'string' }, description: 'Account names already in context, so they are not loaded again.' },
        ideas: { type: 'boolean', description: 'Also list matching ideas on file. Use when inventing.' },
      },
    },
    run: args => ({ text: recall(loadLibrary(loadConfig().library), args as any) }),
  },
  {
    name: 'kf_read',
    description:
      'One thing in full. ref is an account name, a topic path, "domain/topic#principle-id", "domain/topic/_index" (every account with its gist), a source key or id, an idea name, "index", or "guide:ingest", "guide:format", "guide:use". With a source and loc ("p.67-80", "s.3", "12:30-20:00") it returns the original text; add view "image" for a page image or video frame, "layout" for a table-preserving reading of a PDF page.',
    inputSchema: {
      type: 'object',
      required: ['ref'],
      properties: { ref: str('What to read.'), loc: str('For a source: pages, sections or a time range.'), view: { type: 'string', enum: ['text', 'image', 'layout'] } },
    },
    run: args => {
      const config = loadConfig();
      const result = read(loadLibrary(config.library), config, args as any, GUIDES_DIR);
      return { text: result.text, image: result.image };
    },
  },
  {
    name: 'kf_connect',
    description: 'How two ideas connect: chains of recorded links between them, each hop with its verb and reason. With only "from", what that idea links to. Names can be account names, principle ids, or plain words.',
    inputSchema: { type: 'object', required: ['from'], properties: { from: str('An account, principle or phrase.'), to: str('A second account, principle or phrase.') } },
    run: args => ({ text: connect(loadLibrary(loadConfig().library), String(args.from ?? ''), args.to ? String(args.to) : undefined) }),
  },
  {
    name: 'kf_source',
    description:
      'Home session only. action "add" registers a file (PDF, text, Markdown, .srt/.vtt, EPUB/DOCX/HTML, audio or video) as a source: copies the original, extracts its text into citable pages, sections or time units, and writes sources/<id>/source.md to fill in. action "list" shows every source.',
    inputSchema: {
      type: 'object',
      required: ['action'],
      properties: {
        action: { type: 'string', enum: ['add', 'list'] },
        file: str('Full path of the file to add.'),
        title: str("The source's title."),
        authors: { type: 'array', items: { type: 'string' } },
        year: str('Year published.'),
        kind: { type: 'string', enum: ['book', 'paper', 'article', 'video', 'audio', 'course', 'transcript', 'notes', 'other'] },
        id: str('Folder name for the source, lower-case words joined by hyphens. Derived from author and title when omitted.'),
        key: str('Short citation key, capitals and digits, such as WKH. Derived from the title when omitted.'),
        family: str("Sources that share an origin share a family and count once as support. Use \"owner\" for the owner's own notes. Defaults to the source's own id."),
        url: str('Where the source lives online, if anywhere.'),
        max_cost: { type: 'number', description: 'For audio and video: the most the owner has approved spending on transcription, in the configured currency.' },
      },
    },
    run: async args => {
      const config = loadConfig();
      if (args.action === 'list') {
        const lib = loadLibrary(config.library);
        return { text: lib.sources.length ? lib.sources.map(s => `${s.key} · ${s.id} · ${asText(s.fm.title)} (${asText(s.fm.kind)}; ${asText(s.fm.units)}; ${asText(s.fm.words)} words; ${asText(s.fm.status)})`).join('\n') : 'No sources yet.' };
      }
      requireHome(config, 'Adding a source');
      if (!args.file) fail('INVALID', 'action "add" needs file: the full path of the source.');
      let committed = '';
      const added = await withLock(config, 'adding a source', async () => {
        const result = await addSource(config, args as any);
        // Registration gets its own commit, so a later ingest commit holds only what the ingest wrote.
        committed = commitLibrary(config.library, `source: registered ${result.key} (${result.id})`);
        return result;
      });
      const lines = [
        `Added ${added.key} · ${added.id}: ${added.units} ${added.unit_kind === 'page' ? 'pages' : added.unit_kind === 'section' ? 'sections' : 'time units'}, ${added.words} words, extracted with ${added.extractor}. The original was ${added.original}.`,
        `Folder: ${added.folder}`,
        `Text: ${added.text_file} (one "===== locator =====" line before each unit; read spans with kf_read ref "${added.key}" loc "…")`,
        `Cite as ${added.cite_as}.`,
      ];
      if (added.blank) lines.push(`${added.blank} units have no text.`);
      if (added.worth_viewing.length)
        lines.push(
          `${added.worth_viewing.length} units have a figure or table caption, number-heavy text, or sparse or damaged text, so their plain text may not carry everything. Each is flagged on its marker line when you read it (for example "(figure)"). Look at the ones that matter with kf_read view "image".`,
        );
      if (added.frames) lines.push(`${added.frames} frames sampled into ${path.join(added.folder, 'frames')} (one a minute, named by second).`);
      lines.push(...added.notes, `Registration ${committed}. The original, page images and frames stay out of git; they sit in the source's folder.`, 'Next: read it and compile it, following the ingest guide (kf_read ref "guide:ingest").');
      return { text: lines.join('\n') };
    },
  },
  {
    name: 'kf_check',
    description:
      'Checks the whole library: frontmatter, links, citations, quoted words against the source text, principles, source maps, sizes, and words written against words read. Brings the derived parts in step (Governs lines, indexes, search). With commit set to a message and no errors, records the change in log.md and commits it to the library\'s git history.',
    inputSchema: { type: 'object', properties: { commit: str('A one-line message, such as "ingest: The Wood Kiln Handbook". Home session only.'), warnings: { type: 'boolean', description: 'Set false to list errors only.' } } },
    run: async args => {
      const config = loadConfig();
      const home = isHome(config) || process.env.KNOW_FU_WRITE_ANYWHERE === '1';
      if (args.commit) requireHome(config, 'Committing');
      const work = () => {
        const report = checkLibrary(config.library, { fix: home });
        if (home) syncIndex(loadLibrary(config.library));
        let text = formatReport(report, { warnings: args.warnings !== false });
        if (args.commit) text += report.errors.length ? '\n\nNot committed: fix the errors first.' : `\n\n${commitLibrary(config.library, String(args.commit))}.`;
        return { text };
      };
      return home ? withLock(config, 'checking', work) : work();
    },
  },
  {
    name: 'kf_note',
    description: "Save something worth keeping from any project into the library's inbox: a result, a correction, an idea, a worked answer. A home session later weaves it into an account or an idea.",
    inputSchema: { type: 'object', required: ['title', 'body'], properties: { title: str('A short title.'), body: str('The note, in Markdown. Say where it came from and what it rests on.'), topic: str('The topic it belongs to, if known.') } },
    run: args => ({ text: note(loadConfig(), args) }),
  },
  {
    name: 'kf_pin',
    description: 'Pin a topic to a project folder, so sessions there start with its principles in context and can use Know Fu without invoking the skill. With no topic, lists pins. Only on the owner\'s request.',
    inputSchema: { type: 'object', properties: { topic: str('A topic path.'), project: str('The project folder. Defaults to this session\'s.'), remove: { type: 'boolean', description: 'Unpin the topic, or everything for the project when no topic is given.' } } },
    run: args => ({ text: pin(loadConfig(), args) }),
  },
];

export async function runTool(name: string, args: Record<string, any>): Promise<ToolResult> {
  const tool = TOOLS.find(t => t.name === name);
  if (!tool) fail('NOT_FOUND', `No tool named ${name}.`);
  return tool.run(args ?? {});
}

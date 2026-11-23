// The nine tools, defined once and served two ways: over MCP (mcp.ts) and from a shell (cli.ts).
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { checkLibrary, commitLibrary, formatReport } from './check.ts';
import { configPath, isHome, loadConfig, pinsFor, projectDir, requireHome, saveConfig } from './config.ts';
import type { Config } from './config.ts';
import { embedderLabel, embedderOf, semanticSearch, syncVectors } from './embed.ts';
import { findPoppler, findTesseract, findTool } from './extract.ts';
import { findYtdlp, isLink, linkInfo } from './links.ts';
import { formatFrontmatter, asText } from './frontmatter.ts';
import { loadLibrary, topicByPath } from './library.ts';
import { brief, connect, read, recall } from './recall.ts';
import { syncIndex } from './search.ts';
import { addSource, findSource, keepExhibit } from './sources.ts';
import { exists, fail, readJson, samePath, slugify, today, writeText } from './util.ts';

export type ToolResult = { text: string; image?: string; images?: string[] };
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
  out.push(`This session: ${project} (${isHome(config) ? 'the home session: it can ingest and edit' : 'reads the library; saves items to its inbox'})`);
  const pins = pinsFor(config);
  if (pins.length) out.push(`Pinned here: ${pins.join(', ')}`);
  out.push(`Use: ${config.deliberate_use === false ? 'open in every chat' : 'deliberate (tools open after /know-fu, or in a pinned project)'}`);
  if (!exists(config.library)) return out.join('\n');
  const lib = loadLibrary(config.library);
  const report = checkLibrary(config.library);
  out.push('', `${lib.domains.length} domains, ${lib.topics.length} topics, ${report.stats.notes} notes, ${lib.sources.length} sources, ${lib.ideas.length} ideas, ${lib.inbox.length} inbox items.`);
  for (const t of report.stats.topics) out.push(`- ${t.path}: ${t.principles} principles, ${t.notes} notes`);
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
    `- video links (yt-dlp): ${tryTool(() => findYtdlp(config))}`,
    `- scanned PDF pages (Tesseract OCR): ${findTesseract(config) ?? 'not found, or without its language data (scanned pages stay unread)'}`,
    `- semantic search: ${embedderOf(config) ? embedderLabel(embedderOf(config)!) : 'off (keyword search only; add "embedder" to the config to turn it on)'}`,
    `- transcription API: ${config.transcription?.endpoint ? `${config.transcription.model} at ${new URL(config.transcription.endpoint).host}` : 'not configured (transcript files still work)'}`,
  );
  return out.join('\n');
}

function saveInbox(config: Config, args: Record<string, any>): string {
  const title = String(args.title ?? '').trim();
  const body = String(args.body ?? '').trim();
  if (!title || !body) fail('INVALID', 'An inbox item needs a title and a body.');
  const file = path.join(config.library, 'inbox', `${today()}-${slugify(title).slice(0, 50) || 'item'}.md`);
  if (exists(file)) fail('EXISTS', `An item with that title was already saved today (${file}). Give this one a different title.`);
  writeText(file, formatFrontmatter({ type: 'inbox', title, date: today(), from: projectDir(), topic: args.topic ? String(args.topic) : undefined }) + '\n' + body + '\n');
  return `Saved to the library's inbox: ${file}. It becomes part of the library when a home session weaves it into a note or an idea.`;
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
      'Answer material for a specific question: the principles in play, the best-matching notes in full, anything that disputes or qualifies them, and where the original sources speak to it. Split a compound question into sub-questions and pass them as a list.',
    inputSchema: {
      type: 'object',
      required: ['query'],
      properties: {
        query: { description: 'The question in plain words, or a list of sub-questions.', anyOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }] },
        topic: str('Limit to one topic path.'),
        budget: { type: 'number', description: 'Approximate tokens to return. Default 6000; lower it for a quick lookup, raise it for broad synthesis.' },
        load: { type: 'string', enum: ['notes', 'gists'], description: '"gists" returns one line per matching note, to choose from before loading any.' },
        seen: { type: 'array', items: { type: 'string' }, description: 'Note names already in context, so they are not loaded again.' },
        ideas: { type: 'boolean', description: 'Also list matching ideas on file. Use when inventing.' },
      },
    },
    run: async args => {
      const config = loadConfig();
      const lib = loadLibrary(config.library);
      const queries = (Array.isArray(args.query) ? args.query : [args.query]).map((q: unknown) => String(q ?? '').trim()).filter(Boolean);
      let semantic = null;
      let warning = '';
      if (queries.length && embedderOf(config)) {
        try {
          semantic = await semanticSearch(lib, config, queries);
        } catch (error: any) {
          // Keyword search still answers when the embedder is down; say so, since the ranking is then words only.
          warning = `\n(Semantic search was unavailable for this call: ${error.message})`;
        }
      }
      return { text: recall(lib, args as any, semantic) + warning };
    },
  },
  {
    name: 'kf_read',
    description:
      'One thing in full. ref is a note name, a topic path, "domain/topic#principle-id" (that principle in full), a source key or id, an idea name, "index", or "guide:ingest", "guide:video", "guide:format", "guide:use". With a source and loc ("p.67-80", "s.3", "12:30-20:00") it returns the original text; add view "image" for a page image or the video frame at that second, "layout" for a table-preserving reading of a PDF page. For a video: view "filmstrip" (loc a sheet number, or none to list them) shows the moments the screen changed, and view "screen" shows the settled picture for the sentence spoken at loc.',
    inputSchema: {
      type: 'object',
      required: ['ref'],
      properties: {
        ref: str('What to read.'),
        loc: str('For a source: pages, sections, a time or a time range.'),
        view: { type: 'string', enum: ['text', 'image', 'layout', 'screen', 'filmstrip'] },
        box: str('With view "image" on a video: a crop from the original frame, "x,y,w,h" in percent (left, top, width, height).'),
      },
    },
    run: args => {
      const config = loadConfig();
      const result = read(loadLibrary(config.library), config, args as any, GUIDES_DIR);
      return { text: result.text, image: result.image, images: result.images };
    },
  },
  {
    name: 'kf_connect',
    description: 'How two ideas connect: chains of recorded links between them, each hop with its verb and reason. With only "from", what that idea links to. Names can be note names, principle ids, or plain words.',
    inputSchema: { type: 'object', required: ['from'], properties: { from: str('A note, principle or phrase.'), to: str('A second note, principle or phrase.') } },
    run: args => ({ text: connect(loadLibrary(loadConfig().library), String(args.from ?? ''), args.to ? String(args.to) : undefined) }),
  },
  {
    name: 'kf_source',
    description:
      'Home session only. action "add" registers a file (PDF, text, Markdown, .srt/.vtt, EPUB/DOCX/HTML, audio or video) as a source: copies the original, extracts its text into citable pages, sections or time units, and writes sources/<id>/source.md to fill in. action "list" shows every source. action "keep" (ref, loc, optional box) keeps a video frame as an exhibit the write-up can rely on. file can be a video link, fetched with yt-dlp; action "info" shows what a link points at before you add it.',
    inputSchema: {
      type: 'object',
      required: ['action'],
      properties: {
        action: { type: 'string', enum: ['add', 'list', 'keep', 'info'] },
        ref: str('For "keep": the source key.'),
        loc: str('For "keep": the moment, like "12:34".'),
        box: str('For "keep": a crop, "x,y,w,h" in percent.'),
        file: str('Full path of the file to add, or a video link.'),
        title: str("The source's title."),
        authors: { type: 'array', items: { type: 'string' } },
        year: str('Year published.'),
        kind: { type: 'string', enum: ['book', 'paper', 'article', 'video', 'audio', 'course', 'transcript', 'notes', 'other'] },
        id: str('Folder name for the source, lower-case words joined by hyphens. Derived from author and title when omitted.'),
        key: str('Short citation key, capitals and digits, such as WKH. Derived from the title when omitted.'),
        family: str("Sources that share an origin share a family and count once as support. Use \"owner\" for the owner's own notes. Defaults to the first author, so one teacher's lessons count once, or to the source's own id when no author is given."),
        url: str('Where the source lives online, if anywhere.'),
        max_cost: { type: 'number', description: 'For audio and video: the most the owner has approved spending on transcription, in the configured currency.' },
        topic: str('For audio and video: the topic it belongs to, like "audio/mixing". Its vocabulary goes to the transcriber as key terms.'),
        terms: { type: 'array', items: { type: 'string' }, description: 'For audio and video: names and terms of art the recording uses, for the transcriber.' },
      },
    },
    run: async args => {
      const config = loadConfig();
      if (args.action === 'list') {
        const lib = loadLibrary(config.library);
        return { text: lib.sources.length ? lib.sources.map(s => `${s.key} · ${s.id} · ${asText(s.fm.title)} (${asText(s.fm.kind)}; ${asText(s.fm.units)}; ${asText(s.fm.words)} words; ${asText(s.fm.status)})`).join('\n') : 'No sources yet.' };
      }
      if (args.action === 'info') {
        if (!isLink(String(args.file ?? ''))) fail('INVALID', 'action "info" needs file: a video link.');
        const info = linkInfo(config, String(args.file).trim());
        const minutes = info.duration / 60;
        const rate = config.transcription?.cost_per_minute;
        return {
          text: [
            `${info.title}`,
            `By ${info.uploader || 'unknown'}${info.date ? `, ${info.date.slice(0, 4)}-${info.date.slice(4, 6)}-${info.date.slice(6, 8)}` : ''}. ${Math.floor(minutes)} min ${Math.round(info.duration % 60)} s, up to ${info.height || '?'}p. Captions on the page: ${info.captions === 'own' ? "the uploader's own" : info.captions === 'automatic' ? 'automatic only' : 'none'}.`,
            `Transcribing it would cost about ${rate !== undefined ? `${(minutes * rate).toFixed(2)} ${config.transcription?.currency ?? 'USD'}` : 'an unknown amount (set transcription.cost_per_minute)'}.`,
            info.url,
            '',
            'Description from the page (names and terms in it are worth passing as "terms" when you add the link):',
            info.description.slice(0, 2500) || '(none)',
          ].join('\n'),
        };
      }
      if (args.action === 'keep') {
        requireHome(config, 'Keeping an exhibit');
        if (!args.ref || !args.loc) fail('INVALID', 'action "keep" needs ref (the source key) and loc (the moment, like "12:34").');
        const source = findSource(loadLibrary(config.library), String(args.ref));
        const kept = await withLock(config, 'keeping an exhibit', async () => keepExhibit(config, source, String(args.loc), args.box ? String(args.box) : undefined));
        return {
          text: `Kept ${source.key} ${args.loc} as an exhibit: ${kept}${args.box ? " (the crop, and the whole frame it was cut from beside it)" : ""}\nWrite its record under "## Exhibits" in ${path.join(source.dir, 'source.md')}, as a "### ${args.loc} <what it shows>" heading (the format guide has the fields). kf_read with view "image" at this time now returns the kept copy.`,
          image: kept,
        };
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
          `${added.worth_viewing.length} units have a figure or table caption, number-heavy text, sparse or damaged text, or text read by OCR, so their plain text may not carry everything. Each is flagged on its marker line when you read it (for example "(figure)"). Look at the ones that matter with kf_read view "image".`,
        );
      if (added.sheets) lines.push(`The screen changed and settled at ${added.frames} moments, laid out on ${added.sheets} filmstrip ${added.sheets === 1 ? 'sheet' : 'sheets'}: kf_read ref "${added.key}" view "filmstrip".`);
      lines.push(
        ...added.notes,
        `Registration ${committed}. The original, page images, frames and exhibits stay out of git; they sit in the source's folder.`,
        `Next: read it and compile it, following the ingest guide (kf_read ref "guide:ingest")${added.kind === 'video' ? ' and, for a recording with a screen, the video guide (kf_read ref "guide:video")' : ''}.`,
      );
      return { text: lines.join('\n') };
    },
  },
  {
    name: 'kf_check',
    description:
      'Checks the whole library: frontmatter, links, citations, quoted words against the source text, principles and their evidence, source maps and sizes. Brings the derived parts in step (the list of principles on each topic page, the notes under each principle, the index, search). With commit set to a message and no errors, records the change in log.md and commits it to the library\'s git history.',
    inputSchema: { type: 'object', properties: { commit: str('A one-line message, such as "ingest: The Wood Kiln Handbook". Home session only.'), warnings: { type: 'boolean', description: 'Set false to list errors only.' } } },
    run: async args => {
      const config = loadConfig();
      const home = isHome(config) || process.env.KNOW_FU_WRITE_ANYWHERE === '1';
      if (args.commit) requireHome(config, 'Committing');
      const work = async () => {
        const report = checkLibrary(config.library, { fix: home });
        let embedded = '';
        if (home) {
          const lib = loadLibrary(config.library);
          syncIndex(lib);
          try {
            const synced = await syncVectors(lib, config);
            if (synced) embedded = `\n- semantic search: ${synced.total} principles, notes and topics embedded${synced.embedded ? ` (${synced.embedded} new or changed)` : ''}`;
          } catch (error: any) {
            embedded = `\n- semantic search: not updated (${error.message})`;
          }
        }
        let text = formatReport(report, { warnings: args.warnings !== false }) + embedded;
        if (args.commit) text += report.errors.length ? '\n\nNot committed: fix the errors first.' : `\n\n${commitLibrary(config.library, String(args.commit))}.`;
        return { text };
      };
      return home ? withLock(config, 'checking', work) : work();
    },
  },
  {
    name: 'kf_inbox',
    description: "Save something worth keeping from any project into the library's inbox: a result, a correction, an idea, a worked answer. A home session later weaves it into a note or an idea.",
    inputSchema: { type: 'object', required: ['title', 'body'], properties: { title: str('A short title.'), body: str('The text, in Markdown. Say where it came from and what it rests on.'), topic: str('The topic it belongs to, if known.') } },
    run: args => ({ text: saveInbox(loadConfig(), args) }),
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

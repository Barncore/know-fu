// Registering a source: copy the original, extract its text into citable units, and write the
// source page the agent fills in as it reads.
import fs from 'node:fs';
import path from 'node:path';
import type { Config } from './config.ts';
import { assemble, captionCues, chunkPlan, extract, findTool, isMedia, isVideo, pdfPageImage, pdfText, timeUnits } from './extract.ts';
import { download, isLink, linkInfo } from './links.ts';
import type { Runner } from './links.ts';
import { frameImage, frameSecond, loadTrack, mapScreen, parseBox, screenFor } from './frames.ts';
import { formatFrontmatter, asList, asText } from './frontmatter.ts';
import { isRetired, loadLibrary, resolveLoc, section, unitText, unitLabel } from './library.ts';
import type { Library, Source } from './library.ts';
import { countWords, exists, fail, fileSha, formatTime, isSlug, parseTime, readText, slugify, today, writeJson, writeText } from './util.ts';

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
  /** For a recording: the topic it belongs to. The topic's vocabulary is sent to the transcriber as key terms. */
  topic?: string;
  /** For a recording: names and terms of art it uses, sent to the transcriber as key terms. */
  terms?: string[];
  fetcher?: typeof fetch;
  /** Stands in for yt-dlp in tests. */
  ytdlp?: Runner;
};

/**
 * The words a topic uses in its own way: the terms under its Vocabulary heading, and the keywords on the topic and
 * its notes. A transcriber told these terms hears them (measured on one trading lesson: three of four jargon errors
 * in a chunk were fixed), so each recording added to a topic is transcribed better than the one before.
 */
export function topicTerms(lib: Library, topicPath: string): string[] {
  const topic = lib.topics.find(t => t.path === topicPath.replace(/^\/+|\/+$/g, ''));
  if (!topic) fail('NOT_FOUND', `No topic "${topicPath}". Topics: ${lib.topics.map(t => t.path).join(', ') || 'none yet'}. Leave topic out for a recording on a new subject, and pass its terms in "terms".`);
  const vocabulary = [...(section(topic.sections, 'Vocabulary')?.raw ?? '').matchAll(/^\s*[-*]\s+\*\*(.+?)\*\*/gm)].flatMap(m => m[1].replace(/[:.]\s*$/, '').split(/\s+\/\s+/));
  const keywords = [topic, ...lib.notes.filter(a => a.topic === topic.path && !isRetired(a))].flatMap(doc => asList(doc.fm.keywords));
  return [...vocabulary, ...keywords];
}

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
  const lib = loadLibrary(config.library);
  // A link is fetched first, and from there on it is a file like any other.
  let fetched: { dir: string; captions?: string } | null = null;
  if (isLink(options.file)) {
    const link = options.file.trim();
    const info = linkInfo(config, link, options.ytdlp);
    const had = lib.sources.find(s => [link, info.url].includes(asText(s.fm.url)));
    if (had) fail('EXISTS', `This link is already in the library as ${had.id} (${had.key}).`);
    // Ask about the money before fetching anything, from the length the page reports.
    const t = config.transcription;
    if (!t?.endpoint || !t.model) fail('NOT_CONFIGURED', 'A video link is transcribed after it is fetched, and no transcription API is set. Add a "transcription" block to ~/.know-fu/config.json (the setup guide has a worked example).');
    const cost = (chunkPlan(info.duration).reduce((sum, c) => sum + (c.end - c.start), 0) / 60) * (t.cost_per_minute ?? 0);
    if (options.max_cost === undefined || cost > options.max_cost)
      fail(
        'SPEND_NOT_APPROVED',
        `"${info.title}" runs ${formatTime(info.duration)}. Transcribing it is estimated at ${t.cost_per_minute !== undefined ? `${cost.toFixed(2)} ${t.currency ?? 'USD'}` : 'an unknown cost (set transcription.cost_per_minute)'} with ${t.model}. Ask the owner, then call again with max_cost set to the amount they approve. Nothing has been downloaded.`,
      );
    const downloads = path.join(config.library, '.knowfu', 'downloads', slugify(info.id) || 'video');
    const got = download(config, info, downloads, findTool(config, 'ffmpeg'), options.ytdlp);
    fetched = { dir: downloads, captions: got.captions };
    // A channel name isn't a surname, so a fetched video's folder is named from its title alone.
    const named = slugify((options.title ?? info.title).split(/[:—–(|]/)[0]).split('-').slice(0, 7).join('-');
    options = { ...options, file: got.file, id: options.id ?? (named || undefined), title: options.title ?? info.title, authors: options.authors ?? (info.uploader ? [info.uploader] : undefined), year: options.year ?? (info.date.slice(0, 4) || undefined), url: options.url ?? info.url };
  }
  const file = path.resolve(options.file);
  if (!exists(file) || !fs.statSync(file).isFile()) fail('NOT_FOUND', `No file at ${file}.`);
  const title = (options.title ?? path.basename(file, path.extname(file)).replace(/[._]+/g, ' ')).trim();
  const surname = options.authors?.[0]?.trim().split(/\s+/).at(-1) ?? '';
  // The folder name comes from the author and the title up to any subtitle, so it stays short enough to type in a link.
  const id = options.id ? options.id : slugify(`${surname} ${title.split(/[:—–(]/)[0]}`).split('-').slice(0, 7).join('-');
  if (!isSlug(id)) fail('INVALID', `A source id is lower-case words joined by hyphens; got "${id}".`);
  const taken = new Set([...lib.notes.map(a => a.slug), ...lib.ideas.map(i => i.slug), ...lib.sources.map(s => s.id)]);
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
    // The caller's own terms go first: if a provider takes only so many, those are the ones named for this recording.
    const terms = isMedia(file) ? [...(options.terms ?? []), ...(options.topic ? topicTerms(lib, options.topic) : [])] : [];
    const extracted = await extract(config, file, { workDir: path.join(config.library, '.knowfu', 'transcribe', sha.slice(0, 16)), maxCost: options.max_cost, fetcher: options.fetcher, terms });
    if (!extracted.units.length) fail('EXTRACTION_FAILED', `No text came out of ${file}.`);
    const { text, units } = assemble(extracted);
    writeText(path.join(staging, 'text.txt'), text);
    writeJson(path.join(staging, 'units.json'), units);
    const size = fs.statSync(file).size;
    // Large recordings stay where they are; the library records where, and the hash proves which file it was.
    // A fetched video has no other home, so it is kept whatever its size.
    const copied = !!fetched || size <= 300 * 1024 * 1024;
    if (copied) fs.copyFileSync(file, path.join(staging, 'original', path.basename(file)));
    if (fetched?.captions) {
      // The page's own captions are a second hearing of the same words, made by someone else's model or by a person.
      const cues = captionCues(readText(fetched.captions));
      if (cues.length) {
        writeText(path.join(staging, 'captions.txt'), assemble(timeUnits(cues, 'page captions')).text);
        extracted.notes.push("The page's own captions are saved beside the transcript as captions.txt. Where a word in the transcript is in doubt, read the same minute there.");
      }
    }
    let frames = 0;
    let sheets = 0;
    if (isVideo(file)) {
      try {
        const track = mapScreen(config, file, path.join(staging, 'frames'));
        frames = track.candidates.length;
        sheets = track.sheets.length;
      } catch (error: any) {
        // The transcript is still worth having when the picture can't be mapped; frames can be asked for by time.
        extracted.notes.push(`The screen map wasn't made (${String(error?.message ?? error).slice(0, 200)}), so there are no filmstrips for this recording.`);
      }
    }
    const words = units.reduce((sum, u) => sum + u.words, 0);
    const noun = units[0].kind === 'page' ? 'pages' : units[0].kind === 'section' ? 'sections' : 'time units';
    const flagged = (flag: string) => units.filter(u => u.flags.includes(flag)).map(u => u.loc);
    const visual = units.filter(u => u.flags.some(f => ['sparse', 'glyphs', 'figure', 'numeric', 'ocr'].includes(f))).map(u => u.loc);
    const fm = formatFrontmatter({
      type: 'source',
      title,
      key,
      kind,
      authors: options.authors ?? [],
      year: options.year,
      // One teacher's lessons share an origin, so by default they share a family and count once as support.
      family: options.family ?? (slugify(options.authors?.[0] ?? '') || id),
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
      `TODO: one "### Part or chapter title [${units[0].kind === 'page' ? 'p.A-B' : units[0].kind === 'section' ? 's.A-B' : 'mm:ss-mm:ss'}]" heading per stretch of the source, in order, covering ${range}. Under each, one line saying what the stretch covers, so a later session can find where the source deals with something.`,
      '',
      '## What it changed',
      '',
      'TODO: after compiling. Which principles it added, strengthened, sharpened, qualified or disputed, which notes are new and which were revised, and what it leaves open.',
      '',
    ].join('\n');
    writeText(path.join(staging, 'source.md'), fm + '\n' + body);
    fs.renameSync(staging, dir);
    if (fetched) fs.rmSync(fetched.dir, { recursive: true, force: true });
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
      sheets,
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

export type View = 'image' | 'layout' | 'screen' | 'filmstrip';
export type Viewed = { text?: string; paths?: string[] };

const framesDir = (source: Source) => path.join(source.dir, 'frames');
const exhibitsDir = (source: Source) => path.join(source.dir, 'exhibits');

/** A frame the owner's library kept is served from where it was kept, so it outlives the video file. */
function frameFor(config: Config, source: Source, file: string, seconds: number, box?: [number, number, number, number]): string {
  if (!box && exists(exhibitsDir(source))) {
    const kept = fs.readdirSync(exhibitsDir(source)).find(f => !/-c[\d-]+\.jpg$/.test(f) && frameSecond(f) === Math.round(seconds * 10) / 10);
    if (kept) return path.join(exhibitsDir(source), kept);
  }
  return frameImage(config, file, seconds, framesDir(source), box);
}

/** The transcript line that holds a moment: its text, the time it starts and the time the next line starts. */
function sentenceAt(source: Source, seconds: number): { from: number; to: number; text: string } {
  const lines: { at: number; text: string }[] = [];
  source.units.forEach((unit, i) => {
    if (unit.kind !== 'time') return;
    for (const line of unitText(source, i).split('\n')) {
      const m = /^\[(\d{1,2}(?::\d{2}){1,2})\]\s*(.*)$/.exec(line);
      const at = m ? parseTime(m[1]) : null;
      if (m && at !== null) lines.push({ at, text: m[2] });
    }
  });
  if (!lines.length) return { from: seconds, to: seconds + 10, text: '' };
  let i = lines.findLastIndex(l => l.at <= seconds);
  if (i < 0) i = 0;
  // The text carries when a sentence starts, not when it ends. Speech runs near two and a half words a second,
  // and a drawing often lands a moment after the words, so the sentence's stretch is its length plus three seconds,
  // and never past the start of the next one. A silence afterwards belongs to no sentence.
  const spoken = countWords(lines[i].text) / 2.5 + 3;
  return { from: lines[i].at, to: Math.min(lines[i + 1]?.at ?? Infinity, lines[i].at + spoken), text: lines[i].text };
}

/**
 * A page image, a layout-preserving text reading of a page, or what a video showed: for when the plain text
 * isn't enough. For a video: "image" is one frame at the second named (with `box`, a crop from the original
 * frame); "screen" is the settled picture for the sentence at that time; "filmstrip" is a sheet of the moments
 * the screen changed.
 */
export function viewUnit(config: Config, source: Source, loc: string | undefined, view: View, box?: string): Viewed {
  const file = originalFile(source);
  const isPdf = /\.pdf$/i.test(file);
  if (isPdf) {
    const m = /^p\.(\d+)$/.exec(loc ?? '');
    if (!m) fail('INVALID', `Name one page, like "p.112"; got "${loc ?? ''}".`);
    const page = Number(m[1]);
    if (!source.units.some(u => u.kind === 'page' && u.n === page)) fail('NOT_FOUND', `${source.key} has no page ${page}.`);
    if (view === 'layout') return { text: pdfText(config, file, { layout: true, first: page, last: page }).join('\n') };
    return { text: `${source.key} p.${page}`, paths: [pdfPageImage(config, file, page, path.join(source.dir, 'pages'))] };
  }
  if (!isVideo(file)) fail('UNSUPPORTED', `${source.key} is ${path.extname(file) || 'a file'} with no page images or frames to view.`);
  const track = loadTrack(framesDir(source));
  if (view === 'filmstrip') {
    if (!track?.sheets.length) fail('NOT_FOUND', `${source.key} has no filmstrips. Ask for a frame by time with view "image", or the screen for a sentence with view "screen".`);
    const span = (s: { times: number[] }) => `${formatTime(s.times[0])}-${formatTime(s.times.at(-1)!)}`;
    if (!loc)
      return {
        text: [`${source.key}: ${track.candidates.length} moments where the screen changed and settled, on ${track.sheets.length} sheets. loc "1" to "${track.sheets.length}" returns one sheet with the time of each thumbnail.`, ...track.sheets.map((s, i) => `- sheet ${i + 1}: ${span(s)} (${s.times.length} frames)`)].join('\n'),
        // A short recording's sheets come back together; a long one's are asked for by number, so they don't all load at once.
        paths: track.sheets.length <= 6 ? track.sheets.map(s => path.join(framesDir(source), s.file)) : undefined,
      };
    const asTime = parseTime(loc);
    const index = /^\d+$/.test(loc) ? Number(loc) - 1 : asTime === null ? -1 : Math.max(0, track.sheets.findLastIndex(s => s.times[0] <= asTime));
    const sheet = track.sheets[index];
    if (!sheet) fail('NOT_FOUND', `${source.key} has sheets 1 to ${track.sheets.length}; got "${loc}".`);
    const rows: string[] = [];
    for (let i = 0; i < sheet.times.length; i += 4) rows.push(sheet.times.slice(i, i + 4).map(formatTime).join('  '));
    return {
      text: `${source.key} filmstrip ${index + 1} of ${track.sheets.length}, ${span(sheet)}. Thumbnails left to right, top to bottom${track.stamped ? ', each with its time burned in' : ''}:\n${rows.join('\n')}\nThese are small: open one at reading size with view "image" and its time, or view "screen" for the sentence spoken then.`,
      paths: [path.join(framesDir(source), sheet.file)],
    };
  }
  const seconds = parseTime(loc ?? '');
  if (seconds === null) fail('INVALID', `Name a moment, like "12:34"; got "${loc ?? ''}".`);
  if (view === 'screen') {
    const said = sentenceAt(source, seconds);
    if (!track) return { text: `${source.key} ${formatTime(seconds)} (no screen map, so this is the frame at that second)\n"${said.text}"`, paths: [frameFor(config, source, file, seconds)] };
    const shot = screenFor(track, said.from, said.to);
    const times = shot.before === undefined ? [shot.after] : [shot.before, shot.after];
    return {
      text:
        `${source.key} [${formatTime(said.from)}] "${said.text}"\n` +
        (shot.before === undefined ? `The screen held still through this sentence. Frame at ${formatTime(shot.after)}.` : `The screen changed as this was said. First frame: ${formatTime(shot.before)}, before. Second frame: ${formatTime(shot.after)}, settled after.`),
      paths: times.map(t => frameFor(config, source, file, t)),
    };
  }
  const cut = box ? parseBox(box) : undefined;
  return { text: `${source.key} ${formatTime(seconds)}${cut ? `, the region ${cut.join(',')} (percent: left, top, width, height), cut from the original frame` : ''}`, paths: [frameFor(config, source, file, seconds, cut)] };
}

/**
 * Keeps a frame the write-up relies on: a copy in the source's exhibits folder, which is never cleared. The frames
 * folder is a cache, and a video over 300 MB is never copied into the library, so a kept frame is the only picture
 * sure to be there later.
 */
export function keepExhibit(config: Config, source: Source, loc: string, box?: string): string {
  const file = originalFile(source);
  if (!isVideo(file)) fail('UNSUPPORTED', `${source.key} isn't a video. A PDF page is always there to view again, so it needs no keeping.`);
  const seconds = parseTime(loc);
  if (seconds === null) fail('INVALID', `Name the moment to keep, like "12:34"; got "${loc}".`);
  fs.mkdirSync(exhibitsDir(source), { recursive: true });
  const keep = (made: string) => {
    const to = path.join(exhibitsDir(source), path.basename(made));
    if (!exists(to)) fs.copyFileSync(made, to);
    return to;
  };
  // A crop is kept with the frame it was cut from, so the detail can always be seen in its place.
  const whole = keep(frameImage(config, file, seconds, framesDir(source)));
  const target = box ? keep(frameImage(config, file, seconds, framesDir(source), parseBox(box))) : whole;
  // A library made before exhibits existed doesn't leave them out of git yet.
  const ignore = path.join(config.library, '.gitignore');
  const line = 'sources/*/exhibits/';
  if (exists(ignore) && !fs.readFileSync(ignore, 'utf8').split(/\r?\n/).includes(line)) fs.appendFileSync(ignore, `${line}\n`);
  return target;
}

/** Seconds of every frame that was opened or kept for a source: what a reader actually looked at. */
export function framesLooked(source: Source): number[] {
  const out: number[] = [];
  for (const dir of [framesDir(source), exhibitsDir(source)]) {
    if (!exists(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      const at = frameSecond(f);
      if (at !== null) out.push(at);
    }
  }
  return out;
}

export function keptExhibits(source: Source): number[] {
  if (!exists(exhibitsDir(source))) return [];
  return fs.readdirSync(exhibitsDir(source)).map(frameSecond).filter((t): t is number => t !== null);
}

export function screenTrack(source: Source) {
  return loadTrack(framesDir(source));
}

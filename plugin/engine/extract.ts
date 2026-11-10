// Turns a source file into text units a citation can name: pages, sections or stretches of time.
// Extraction is the engine's job because it is mechanical; reading is the agent's.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import type { Config } from './config.ts';
import type { Unit } from './library.ts';
import { countWords, exists, fail, formatTime, parseTime, readText } from './util.ts';

export type Extracted = {
  units: Unit[];
  /** One string per unit, in order. */
  texts: string[];
  extractor: string;
  notes: string[];
};

const MEDIA = new Set(['.mp3', '.wav', '.m4a', '.aac', '.flac', '.ogg', '.opus', '.mp4', '.mkv', '.mov', '.webm', '.avi', '.m4v']);
const VIDEO = new Set(['.mp4', '.mkv', '.mov', '.webm', '.avi', '.m4v']);
const PANDOC = new Set(['.epub', '.docx', '.html', '.htm', '.odt', '.rtf']);

export const isMedia = (file: string) => MEDIA.has(path.extname(file).toLowerCase());
export const isVideo = (file: string) => VIDEO.has(path.extname(file).toLowerCase());

// ---- finding tools ----

function onPath(name: string): string[] {
  const finder = process.platform === 'win32' ? 'where' : 'which';
  const args = process.platform === 'win32' ? [name] : ['-a', name];
  const found = spawnSync(finder, args, { encoding: 'utf8' });
  return found.status === 0
    ? found.stdout
        .split(/\r?\n/)
        .map(l => l.trim())
        .filter(Boolean)
    : [];
}

function wingetPoppler(name: string): string[] {
  const base = path.join(process.env.LOCALAPPDATA ?? '', 'Microsoft', 'WinGet', 'Packages');
  if (process.platform !== 'win32' || !exists(base)) return [];
  const out: string[] = [];
  for (const pkg of fs.readdirSync(base).filter(d => /poppler/i.test(d)))
    for (const version of fs.readdirSync(path.join(base, pkg))) {
      const candidate = path.join(base, pkg, version, 'Library', 'bin', name + '.exe');
      if (exists(candidate)) out.push(candidate);
    }
  return out;
}

function banner(exe: string): string {
  const run = spawnSync(exe, ['-v'], { encoding: 'utf8', timeout: 20000 });
  return `${run.stderr ?? ''}${run.stdout ?? ''}`;
}

/**
 * Poppler's pdftotext, never Xpdf's. Git for Windows puts Xpdf's copy first on PATH; it can't read
 * stdin and fails with a bare exit status, and both print "pdftotext version", so check for the word Poppler.
 */
export function findPoppler(config: Config, name: 'pdftotext' | 'pdftoppm' | 'pdfinfo' = 'pdftotext'): string {
  const configured = name === 'pdfinfo' ? undefined : config.tools?.[name];
  const sibling = config.tools?.pdftotext ? path.join(path.dirname(config.tools.pdftotext), name + (process.platform === 'win32' ? '.exe' : '')) : undefined;
  const candidates = [configured, process.env.KB_PDFTOTEXT && name === 'pdftotext' ? process.env.KB_PDFTOTEXT : undefined, sibling, ...wingetPoppler(name), ...onPath(name)].filter(
    (c): c is string => !!c && exists(c),
  );
  for (const candidate of candidates) if (/poppler/i.test(banner(candidate))) return candidate;
  fail(
    'TOOL_MISSING',
    `Poppler's ${name} wasn't found${candidates.length ? ` (found ${candidates.join(', ')}, which ${candidates.length > 1 ? "aren't" : "isn't"} Poppler)` : ''}. Install Poppler (Windows: winget install oschwartz10612.Poppler) or set tools.${name} in ~/.know-fu/config.json to its full path.`,
  );
}

export function findTool(config: Config, name: 'ffmpeg' | 'ffprobe' | 'pandoc'): string {
  const configured = config.tools?.[name];
  if (configured && exists(configured)) return configured;
  const found = onPath(name)[0];
  if (found) return found;
  fail('TOOL_MISSING', `${name} wasn't found on PATH. Install it, or set tools.${name} in ~/.know-fu/config.json to its full path.`);
}

// ---- PDF ----

function pageFlags(text: string): string[] {
  const flags: string[] = [];
  const words = countWords(text);
  if (words === 0) return ['blank'];
  if (words < 30) flags.push('sparse');
  if (text.includes('�')) flags.push('glyphs');
  // A caption starts its own line ("Figure 6.14 Multitap delay…"); a mention in running text ("see Figure 6.14") doesn't.
  if (/^\s*(Figure|Fig\.|Table|Chart|Diagram|Exhibit)\s*\d+(?:[.-]\d+)?\b(?!\))/m.test(text)) flags.push('figure');
  const digits = (text.match(/\d/g) ?? []).length;
  if (digits / Math.max(1, text.replace(/\s/g, '').length) > 0.18) flags.push('numeric');
  return flags;
}

export function pdfText(config: Config, file: string, options: { layout?: boolean; first?: number; last?: number } = {}): string[] {
  const exe = findPoppler(config);
  const args = ['-enc', 'UTF-8', '-eol', 'unix'];
  if (options.layout) args.push('-layout');
  if (options.first) args.push('-f', String(options.first));
  if (options.last) args.push('-l', String(options.last));
  // Reading from stdin keeps long library paths out of Poppler's own file handling, which fails on some Windows builds.
  const run = spawnSync(exe, [...args, '-', '-'], { input: fs.readFileSync(file), maxBuffer: 1 << 30, timeout: 1800000 });
  if (run.status !== 0) fail('EXTRACTION_FAILED', `pdftotext failed on ${file}: ${String(run.stderr ?? '').slice(0, 400) || `exit ${run.status}`}`);
  const pages = run.stdout.toString('utf8').split('\f');
  if (pages.length && !pages.at(-1)!.trim()) pages.pop();
  return pages;
}

function extractPdf(config: Config, file: string): Extracted {
  const pages = pdfText(config, file);
  if (!pages.length) fail('EXTRACTION_FAILED', `pdftotext returned no pages for ${file}.`);
  const notes: string[] = [];
  const blank = pages.filter(p => countWords(p) === 0).length;
  if (blank / pages.length > 0.5)
    notes.push(`${blank} of ${pages.length} pages have no text layer. This looks like a scanned PDF; run OCR on it first (for example ocrmypdf) and add the result.`);
  const units: Unit[] = pages.map((text, i) => ({ loc: `p.${i + 1}`, kind: 'page', n: i + 1, line: 0, lines: 0, words: countWords(text), flags: pageFlags(text) }));
  return { units, texts: pages.map(p => p.replace(/\s+$/, '')), extractor: 'poppler pdftotext', notes };
}

/** Renders one PDF page to a PNG and returns its path. Cached beside the source. */
export function pdfPageImage(config: Config, pdf: string, page: number, outDir: string, dpi = 110): string {
  const target = path.join(outDir, `p${String(page).padStart(4, '0')}.png`);
  if (exists(target)) return target;
  fs.mkdirSync(outDir, { recursive: true });
  const exe = findPoppler(config, 'pdftoppm');
  // pdftoppm writes to stdout when no output root is given, which again avoids long output paths.
  const run = spawnSync(exe, ['-png', '-r', String(dpi), '-f', String(page), '-l', String(page), '-'], { input: fs.readFileSync(pdf), maxBuffer: 1 << 28, timeout: 120000 });
  if (run.status !== 0 || !run.stdout.length) fail('EXTRACTION_FAILED', `pdftoppm couldn't render page ${page}: ${String(run.stderr ?? '').slice(0, 300)}`);
  fs.writeFileSync(target, run.stdout);
  return target;
}

// ---- text, Markdown, and anything pandoc can turn into Markdown ----

function sectionUnits(markdown: string, extractor: string): Extracted {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const hasHeadings = lines.filter(l => /^#{1,3}\s+\S/.test(l)).length >= 3;
  const chunks: { title?: string; lines: string[] }[] = [];
  let current: { title?: string; lines: string[] } = { lines: [] };
  const push = () => {
    if (current.lines.join('').trim()) chunks.push(current);
  };
  const LIMIT = 900;
  let words = 0;
  for (const line of lines) {
    const heading = hasHeadings && /^#{1,3}\s+\S/.test(line);
    // Without headings, cut at a paragraph break once a chunk is long enough to be worth citing on its own.
    const paragraphBreak = !line.trim() && words >= LIMIT;
    if (heading || paragraphBreak) {
      push();
      current = { title: heading ? line.replace(/^#+\s+/, '').trim() : undefined, lines: [] };
      words = 0;
    }
    current.lines.push(line);
    words += countWords(line);
  }
  push();
  const texts = chunks.map(c => c.lines.join('\n').trim());
  const units: Unit[] = chunks.map((c, i) => ({
    loc: `s.${i + 1}`,
    kind: 'section',
    n: i + 1,
    line: 0,
    lines: 0,
    words: countWords(texts[i]),
    flags: c.title ? [`title:${c.title.slice(0, 80)}`] : [],
  }));
  return { units, texts, extractor, notes: [] };
}

function extractPandoc(config: Config, file: string): Extracted {
  const exe = findTool(config, 'pandoc');
  const run = spawnSync(exe, [file, '-t', 'gfm', '--wrap=none'], { maxBuffer: 1 << 30, timeout: 600000 });
  if (run.status !== 0) fail('EXTRACTION_FAILED', `pandoc failed on ${file}: ${String(run.stderr ?? '').slice(0, 400)}`);
  return sectionUnits(run.stdout.toString('utf8'), 'pandoc');
}

// ---- subtitles and transcripts with timestamps ----

type Cue = { start: number; end: number; text: string };

function parseCues(text: string): Cue[] {
  const cues: Cue[] = [];
  const stamp = /(\d{1,2}:)?(\d{2}):(\d{2})[.,](\d{1,3})\s*-->\s*(\d{1,2}:)?(\d{2}):(\d{2})[.,](\d{1,3})/;
  const blocks = text.replace(/\r\n?/g, '\n').split(/\n{2,}/);
  for (const block of blocks) {
    const lines = block.split('\n');
    const at = lines.findIndex(l => stamp.test(l));
    if (at < 0) continue;
    const m = stamp.exec(lines[at])!;
    const seconds = (h: string | undefined, min: string, s: string, ms: string) => Number((h ?? '0:').slice(0, -1)) * 3600 + Number(min) * 60 + Number(s) + Number(ms.padEnd(3, '0')) / 1000;
    const body = lines
      .slice(at + 1)
      .join(' ')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (body) cues.push({ start: seconds(m[1], m[2], m[3], m[4]), end: seconds(m[5], m[6], m[7], m[8]), text: body });
  }
  return cues;
}

/** Groups timed text into units of about two minutes. Each line starts with its own timestamp, so a citation can be exact. */
export function timeUnits(cues: Cue[], extractor: string, span = 120): Extracted {
  const units: Unit[] = [];
  const texts: string[] = [];
  let bucket: Cue[] = [];
  let last = '';
  const flush = () => {
    if (!bucket.length) return;
    const start = Math.floor(bucket[0].start);
    const end = Math.max(start + 1, Math.ceil(bucket.at(-1)!.end));
    const lines: string[] = [];
    let line: Cue[] = [];
    const emit = () => {
      if (line.length) lines.push(`[${formatTime(line[0].start)}] ${line.map(c => c.text).join(' ')}`);
      line = [];
    };
    for (const cue of bucket) {
      if (line.length && cue.start - line[0].start >= 30) emit();
      line.push(cue);
    }
    emit();
    const text = lines.join('\n');
    units.push({ loc: formatTime(start), kind: 'time', n: start, end, line: 0, lines: 0, words: countWords(text), flags: [] });
    texts.push(text);
    bucket = [];
  };
  for (const cue of cues) {
    // Auto-generated captions repeat each line as it scrolls; keep one copy.
    if (cue.text === last) continue;
    last = cue.text;
    if (bucket.length && cue.start - bucket[0].start >= span) flush();
    bucket.push(cue);
  }
  flush();
  // Make units meet end to start, so every moment of the recording belongs to one of them.
  units.forEach((u, i) => {
    if (i + 1 < units.length) u.end = units[i + 1].n;
  });
  return { units, texts, extractor, notes: [] };
}

// ---- audio and video, through a transcription API ----

function keyFor(t: NonNullable<Config['transcription']>): string {
  const fromFile = t.api_key_file && exists(t.api_key_file) ? readText(t.api_key_file).trim() : '';
  const key = (t.api_key_env ? process.env[t.api_key_env] : '') || fromFile;
  if (!key) fail('NOT_CONFIGURED', `The transcription API key isn't available. Set transcription.api_key_file (a file holding only the key) or transcription.api_key_env in ~/.know-fu/config.json.`);
  return key;
}

export function mediaDuration(config: Config, file: string): number {
  const exe = findTool(config, 'ffprobe');
  const out = execFileSync(exe, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', file], { encoding: 'utf8', timeout: 120000 });
  const seconds = Number(out.trim());
  if (!Number.isFinite(seconds) || seconds <= 0) fail('EXTRACTION_FAILED', `ffprobe couldn't read a duration from ${file}.`);
  return seconds;
}

export function transcriptionEstimate(config: Config, file: string) {
  const t = config.transcription;
  if (!t?.endpoint || !t.model)
    fail(
      'NOT_CONFIGURED',
      `Audio and video need a transcription API. Add "transcription": {"endpoint": "https://…/audio/transcriptions", "model": "…", "api_key_file": "…", "cost_per_minute": 0.006} to ~/.know-fu/config.json, or add a transcript file (.srt, .vtt, .txt) for this recording.`,
    );
  const seconds = mediaDuration(config, file);
  const cost = (seconds / 60) * (t.cost_per_minute ?? 0);
  return { seconds, cost, currency: t.currency ?? 'USD', priced: t.cost_per_minute !== undefined };
}

async function extractMedia(config: Config, file: string, workDir: string, maxCost: number | undefined, fetcher: typeof fetch): Promise<Extracted> {
  const t = config.transcription!;
  const { seconds, cost, currency, priced } = transcriptionEstimate(config, file);
  if (maxCost === undefined || cost > maxCost)
    fail(
      'SPEND_NOT_APPROVED',
      `Transcribing this ${formatTime(seconds)} recording is estimated at ${priced ? `${cost.toFixed(2)} ${currency}` : 'an unknown cost (set transcription.cost_per_minute)'} with ${t.model}. Ask the owner, then call again with max_cost set to the amount they approve.`,
    );
  const key = keyFor(t);
  const ffmpeg = findTool(config, 'ffmpeg');
  fs.mkdirSync(workDir, { recursive: true });
  const cues: Cue[] = [];
  const CHUNK = 300;
  for (let start = 0, index = 0; start < seconds; start += CHUNK, index++) {
    const audio = path.join(workDir, `audio-${String(index).padStart(3, '0')}.mp3`);
    const done = audio + '.json';
    let result: any;
    if (exists(done)) result = JSON.parse(readText(done));
    else {
      execFileSync(ffmpeg, ['-nostdin', '-y', '-ss', String(start), '-t', String(CHUNK), '-i', file, '-vn', '-ac', '1', '-ar', '16000', '-b:a', '64k', audio], { stdio: 'ignore', timeout: 600000 });
      const form = new FormData();
      form.append('model', t.model);
      form.append('response_format', 'verbose_json');
      form.append('file', new Blob([fs.readFileSync(audio)]), path.basename(audio));
      const response = await fetcher(t.endpoint, { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form, signal: AbortSignal.timeout(600000) });
      const raw = await response.text();
      if (!response.ok) fail('EXTRACTION_FAILED', `The transcription API answered ${response.status} on chunk ${index}: ${raw.slice(0, 300)}. Chunks already transcribed are kept in ${workDir}; calling again resumes there.`);
      result = JSON.parse(raw);
      // Saved per chunk, so a failure later never pays for the same audio twice.
      fs.writeFileSync(done, raw);
      fs.rmSync(audio, { force: true });
    }
    const segments: any[] = Array.isArray(result.segments) ? result.segments : [];
    if (segments.length) for (const s of segments) cues.push({ start: start + Number(s.start ?? 0), end: start + Number(s.end ?? 0), text: String(s.text ?? '').trim() });
    else if (String(result.text ?? '').trim()) cues.push({ start, end: Math.min(seconds, start + CHUNK), text: String(result.text).trim() });
  }
  const out = timeUnits(
    cues.filter(c => c.text),
    `${t.model} via ${new URL(t.endpoint).host}`,
  );
  out.notes.push('Machine transcription: check names, numbers and terms of art against the recording before quoting them.');
  return out;
}

/** One frame a minute, small, so a reader can see what was on screen when the speaker points at something. */
export function sampleFrames(config: Config, file: string, outDir: string, every = 60): number {
  const ffmpeg = findTool(config, 'ffmpeg');
  fs.mkdirSync(outDir, { recursive: true });
  const run = spawnSync(ffmpeg, ['-nostdin', '-y', '-i', file, '-vf', `fps=1/${every},scale=960:-2`, '-q:v', '5', path.join(outDir, 'f%05d.jpg')], { stdio: 'ignore', timeout: 3600000 });
  if (run.status !== 0) return 0;
  // ffmpeg numbers frames from 1; rename each to the second it shows.
  const frames = fs.readdirSync(outDir).filter(f => /^f\d{5}\.jpg$/.test(f));
  for (const f of frames) {
    const second = (Number(f.slice(1, 6)) - 1) * every;
    fs.renameSync(path.join(outDir, f), path.join(outDir, `t${String(second).padStart(6, '0')}.jpg`));
  }
  return frames.length;
}

export function frameAt(config: Config, file: string, seconds: number, outDir: string): string {
  const target = path.join(outDir, `t${String(Math.floor(seconds)).padStart(6, '0')}-full.jpg`);
  if (exists(target)) return target;
  fs.mkdirSync(outDir, { recursive: true });
  const ffmpeg = findTool(config, 'ffmpeg');
  const run = spawnSync(ffmpeg, ['-nostdin', '-y', '-ss', String(seconds), '-i', file, '-frames:v', '1', '-q:v', '3', target], { stdio: 'ignore', timeout: 120000 });
  if (run.status !== 0 || !exists(target)) fail('EXTRACTION_FAILED', `ffmpeg couldn't take a frame at ${formatTime(seconds)}.`);
  return target;
}

// ---- entry point ----

export async function extract(config: Config, file: string, options: { workDir?: string; maxCost?: number; fetcher?: typeof fetch } = {}): Promise<Extracted> {
  const ext = path.extname(file).toLowerCase();
  if (ext === '.pdf') return extractPdf(config, file);
  if (ext === '.srt' || ext === '.vtt') {
    const cues = parseCues(readText(file));
    if (!cues.length) fail('EXTRACTION_FAILED', `No timed cues found in ${file}.`);
    return timeUnits(cues, 'subtitle file');
  }
  if (ext === '.txt' || ext === '.md' || ext === '.markdown') {
    const text = readText(file);
    // A transcript pasted as "[12:34] words" or "12:34 words" keeps its timestamps.
    const timed = text.split('\n').filter(l => /^\s*\[?\d{1,2}:\d{2}(:\d{2})?\]?\s+\S/.test(l));
    if (timed.length >= 10 && timed.length > text.split('\n').filter(l => l.trim()).length * 0.5) {
      const cues: Cue[] = [];
      for (const line of timed) {
        const m = /^\s*\[?(\d{1,2}:\d{2}(?::\d{2})?)\]?\s+(.*)$/.exec(line)!;
        cues.push({ start: parseTime(m[1])!, end: parseTime(m[1])! + 1, text: m[2].trim() });
      }
      cues.forEach((c, i) => (c.end = cues[i + 1]?.start ?? c.start + 30));
      return timeUnits(cues, 'timestamped transcript');
    }
    return sectionUnits(text, 'plain text');
  }
  if (PANDOC.has(ext)) return extractPandoc(config, file);
  if (MEDIA.has(ext)) return extractMedia(config, file, options.workDir ?? fs.mkdtempSync(path.join(os.tmpdir(), 'kf-media-')), options.maxCost, options.fetcher ?? fetch);
  fail('UNSUPPORTED', `Know Fu can't read ${ext || 'this kind of'} files. Supported: PDF, text, Markdown, .srt and .vtt, EPUB, DOCX and HTML through pandoc, and audio or video through a transcription API.`);
}

/** Joins unit texts into text.txt and records where each unit sits in it. */
export function assemble(extracted: Extracted): { text: string; units: Unit[] } {
  const out: string[] = [];
  const units = extracted.units.map((unit, i) => {
    const body = extracted.texts[i].split('\n');
    out.push(`===== ${unit.kind === 'time' ? `${formatTime(unit.n)}-${formatTime(unit.end ?? unit.n)}` : unit.loc} =====`);
    const line = out.length;
    out.push(...body, '');
    return { ...unit, line, lines: body.length };
  });
  return { text: out.join('\n'), units };
}

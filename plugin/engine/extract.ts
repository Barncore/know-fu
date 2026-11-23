// Turns a source file into text units a citation can name: pages, sections or stretches of time.
// Extraction is the engine's job because it is mechanical; reading is the agent's.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import type { Config } from './config.ts';
import type { Unit } from './library.ts';
import { countWords, exists, fail, formatTime, parseTime, readText, sha, slugify } from './util.ts';

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

/** Tesseract, when it is installed with the data for the configured languages. Optional: null when it isn't there. */
export function findTesseract(config: Config): string | null {
  const configured = config.tools?.tesseract;
  const exe = configured && exists(configured) ? configured : onPath('tesseract')[0];
  if (!exe) return null;
  const langs = spawnSync(exe, ['--list-langs'], { encoding: 'utf8', timeout: 20000 });
  const have = `${langs.stdout ?? ''}${langs.stderr ?? ''}`.split(/\r?\n/).map(l => l.trim());
  return (config.ocr?.languages ?? 'eng').split('+').every(l => have.includes(l)) ? exe : null;
}

/** Reads the pages of a PDF that have no text layer, from a 300 dpi rendering of each. Returns page index -> text. */
function ocrPages(config: Config, file: string, pages: number[], tesseract: string): Map<number, string> {
  const out = new Map<number, string>();
  const pdftoppm = findPoppler(config, 'pdftoppm');
  const pdf = fs.readFileSync(file);
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'kf-ocr-'));
  try {
    for (const index of pages) {
      const page = String(index + 1);
      const render = spawnSync(pdftoppm, ['-png', '-gray', '-r', '300', '-f', page, '-l', page, '-'], { input: pdf, maxBuffer: 1 << 28, timeout: 120000 });
      if (render.status !== 0 || !render.stdout.length) continue;
      const image = path.join(work, `p${page}.png`);
      fs.writeFileSync(image, render.stdout);
      const read = spawnSync(tesseract, [image, 'stdout', '-l', config.ocr?.languages ?? 'eng'], { encoding: 'utf8', maxBuffer: 1 << 26, timeout: 300000 });
      if (read.status === 0 && countWords(read.stdout)) out.set(index, read.stdout);
      fs.rmSync(image, { force: true });
    }
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
  return out;
}

function extractPdf(config: Config, file: string): Extracted {
  const pages = pdfText(config, file);
  if (!pages.length) fail('EXTRACTION_FAILED', `pdftotext returned no pages for ${file}.`);
  const notes: string[] = [];
  const blank = pages.map((p, i) => (countWords(p) === 0 ? i : -1)).filter(i => i >= 0);
  // A page with no text layer is a picture of a page: a scan, or a figure that fills it. OCR reads the first kind.
  const tesseract = blank.length ? findTesseract(config) : null;
  const read = tesseract ? ocrPages(config, file, blank, tesseract) : new Map<number, string>();
  for (const [index, text] of read) pages[index] = text;
  if (read.size)
    notes.push(`${read.size} of ${pages.length} pages had no text layer and were read by OCR (Tesseract). Each is flagged "ocr". OCR misreads characters, most often in numbers, so check a number or a quoted phrase against the page image before relying on it.`);
  else if (blank.length / pages.length > 0.5)
    notes.push(
      `${blank.length} of ${pages.length} pages have no text layer. This looks like a scanned PDF, and no OCR tool was found${tesseract === null && onPath('tesseract').length ? ' with the language data it needs' : ''}. Install Tesseract with its English data (Windows: scoop install tesseract; macOS: brew install tesseract), or set tools.tesseract in ~/.know-fu/config.json, then delete this source's folder and add the file again.`,
    );
  const units: Unit[] = pages.map((text, i) => ({ loc: `p.${i + 1}`, kind: 'page', n: i + 1, line: 0, lines: 0, words: countWords(text), flags: [...pageFlags(text), ...(read.has(i) ? ['ocr'] : [])] }));
  return { units, texts: pages.map(p => p.replace(/\s+$/, '')), extractor: read.size ? 'poppler pdftotext, tesseract for scanned pages' : 'poppler pdftotext', notes };
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

/**
 * Cues from a caption file that scrolls. Automatic captions show two lines at once and repeat each line in the
 * next cue as it moves up, so joining every cue's text says everything three times. Taking each line once, when
 * it first appears, gives the words as spoken.
 */
export function captionCues(text: string): Cue[] {
  const cues: Cue[] = [];
  const stamp = /(\d{1,2}:)?(\d{2}):(\d{2})[.,](\d{1,3})\s*-->/;
  let last = '';
  for (const block of text.replace(/\r\n?/g, '\n').split(/\n{2,}/)) {
    const lines = block.split('\n');
    const at = lines.findIndex(l => stamp.test(l));
    if (at < 0) continue;
    const m = stamp.exec(lines[at])!;
    const start = Number((m[1] ?? '0:').slice(0, -1)) * 3600 + Number(m[2]) * 60 + Number(m[3]) + Number(m[4].padEnd(3, '0')) / 1000;
    for (const raw of lines.slice(at + 1)) {
      const line = raw.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
      if (!line || line === last) continue;
      last = line;
      cues.push({ start, end: start + 1, text: line });
    }
  }
  cues.forEach((c, i) => (c.end = cues[i + 1]?.start ?? c.start + 5));
  return cues;
}

/**
 * Groups timed text into units of about two minutes. Each line starts with its own timestamp, so a citation can be exact.
 * Caption fragments are joined into lines of up to `lineSpan` seconds. Pass `lineSpan: 0` to give every cue its own line,
 * which is what speech cut into sentences wants: a reader can then aim a video frame at the sentence that points at the screen.
 */
export function timeUnits(cues: Cue[], extractor: string, options: { span?: number; lineSpan?: number; dedupe?: boolean } = {}): Extracted {
  const { span = 120, lineSpan = 30, dedupe = true } = options;
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
      if (line.length && cue.start - line[0].start >= lineSpan) emit();
      line.push(cue);
    }
    emit();
    const text = lines.join('\n');
    units.push({ loc: formatTime(start), kind: 'time', n: start, end, line: 0, lines: 0, words: countWords(text), flags: [] });
    texts.push(text);
    bucket = [];
  };
  for (const cue of cues) {
    // Auto-generated captions repeat each line as it scrolls; keep one copy. A speaker who says "Okay." twice said it twice.
    if (dedupe && cue.text === last) continue;
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

export type Chunk = { index: number; coreStart: number; coreEnd: number; start: number; end: number };

/**
 * Five-minute chunks, each sent with a few seconds of the audio either side. A model cuts or mishears the word at the
 * edge of what it is given (measured: "sell side liquidity" came back as "sell side low" at a chunk's end), so every
 * chunk hears past its own core and only the words inside the core are kept.
 */
export function chunkPlan(seconds: number, core = 300, pad = 8): Chunk[] {
  const plan: Chunk[] = [];
  for (let start = 0, index = 0; start < seconds; start += core, index++)
    plan.push({ index, coreStart: start, coreEnd: Math.min(seconds, start + core), start: Math.max(0, start - pad), end: Math.min(seconds, start + core + pad) });
  return plan;
}

export function transcriptionEstimate(config: Config, file: string) {
  const t = config.transcription;
  if (!t?.endpoint || !t.model)
    fail(
      'NOT_CONFIGURED',
      `Audio and video need a transcription API. Add "transcription": {"endpoint": "https://…/audio/transcriptions", "model": "…", "api_key_file": "…", "cost_per_minute": 0.002} to ~/.know-fu/config.json (the setup guide has a worked example), or add a transcript file (.srt, .vtt, .txt) for this recording.`,
    );
  const seconds = mediaDuration(config, file);
  // The padding is sent and billed too.
  const billed = chunkPlan(seconds).reduce((sum, c) => sum + (c.end - c.start), 0);
  const cost = (billed / 60) * (t.cost_per_minute ?? 0);
  return { seconds, cost, currency: t.currency ?? 'USD', priced: t.cost_per_minute !== undefined };
}

type Word = { start: number; end: number; text: string };

/**
 * Sentences from word timestamps. Some models return a timed word list and almost no segments (one model tested
 * returned one to three segments for five minutes of speech), so the engine cuts the sentences itself: at a full
 * stop, question mark or exclamation mark, at a pause, and at 20 seconds when the speaker never stops.
 */
export function cuesFromWords(words: Word[]): Cue[] {
  const cues: Cue[] = [];
  let run: Word[] = [];
  const close = () => {
    if (run.length) cues.push({ start: run[0].start, end: run.at(-1)!.end, text: run.map(w => w.text).join(' ') });
    run = [];
  };
  words.forEach((word, i) => {
    run.push(word);
    const next = words[i + 1];
    const length = word.end - run[0].start;
    // "Okay." and "Right." stay with the sentence that follows them, so a line is worth its timestamp.
    const sentence = /[.?!]["')\]]?$/.test(word.text) && (run.length >= 4 || length >= 2);
    const pause = !!next && next.start - word.end >= 1.5 && run.length >= 4;
    if (!next || sentence || pause || length >= 20) close();
  });
  return cues;
}

/** One chunk's reply as cues in the recording's own time, keeping what starts inside the chunk's core. */
function chunkCues(result: any, chunk: Chunk, last: boolean): { cues: Cue[]; from: 'words' | 'segments' | 'text' | 'nothing' } {
  const inCore = (at: number) => at >= chunk.coreStart - 0.001 && (last || at < chunk.coreEnd);
  const timed = (list: any, field: 'word' | 'text'): Word[] =>
    (Array.isArray(list) ? list : [])
      .map((x: any) => ({ start: chunk.start + Number(x.start ?? 0), end: chunk.start + Number(x.end ?? 0), text: String(x[field] ?? x.text ?? '').trim() }))
      .filter((x: Word) => x.text && Number.isFinite(x.start) && inCore(x.start));
  const words = timed(result.words, 'word');
  const segments = timed(result.segments, 'text');
  // Segments are the better unit when a model cuts them at sentences; words when its segments run for minutes.
  const sparse = (chunk.coreEnd - chunk.coreStart) / Math.max(1, segments.length) > 30;
  if (words.length && (sparse || !segments.length)) return { cues: cuesFromWords(words), from: 'words' };
  if (segments.length) return { cues: segments, from: 'segments' };
  const text = String(result.text ?? '').trim();
  // No timing at all: the chunk's text gets the chunk's own span, and the padding makes the words at each join appear twice.
  return text ? { cues: [{ start: chunk.coreStart, end: chunk.coreEnd, text }], from: 'text' } : { cues: [], from: 'nothing' };
}

/** Terms worth sending: trimmed, one of each, short enough to be a term and few enough for a provider to accept. */
export function keyTerms(terms: string[] | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of terms ?? []) {
    const term = String(raw ?? '').replace(/\s+/g, ' ').trim();
    if (!term || term.length > 60 || seen.has(term.toLowerCase())) continue;
    seen.add(term.toLowerCase());
    out.push(term);
  }
  return out.slice(0, 100);
}

async function extractMedia(config: Config, file: string, workDir: string, maxCost: number | undefined, fetcher: typeof fetch, terms: string[]): Promise<Extracted> {
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
  const plan = chunkPlan(seconds);
  let sent = keyTerms(terms);
  let refused = false;
  let charged = 0;
  let unpriced = false;
  const cues: Cue[] = [];
  const used = new Set<string>();
  for (const chunk of plan) {
    const reply = async (): Promise<any> => {
      // A saved reply is reused only for the same model, padding and key terms, since each of those changes the words.
      const name = `${slugify(t.model)}-p${chunk.coreStart - chunk.start}-${sent.length ? sha(sent.join('\n')).slice(0, 8) : 'plain'}-c${String(chunk.index).padStart(3, '0')}`;
      const done = path.join(workDir, name + '.json');
      if (exists(done)) return JSON.parse(readText(done));
      const audio = path.join(workDir, name + '.mp3');
      execFileSync(ffmpeg, ['-nostdin', '-y', '-ss', String(chunk.start), '-t', String(chunk.end - chunk.start), '-i', file, '-vn', '-ac', '1', '-ar', '16000', '-b:a', '64k', audio], { stdio: 'ignore', timeout: 600000 });
      const bytes = fs.readFileSync(audio);
      fs.rmSync(audio, { force: true });
      let response: Response;
      let raw = '';
      for (let attempt = 1; ; attempt++) {
        const form = new FormData();
        form.append('model', t.model);
        form.append('response_format', 'verbose_json');
        for (const grain of ['word', 'segment']) form.append('timestamp_granularities[]', grain);
        for (const term of sent) form.append('keyterms[]', term);
        form.append('file', new Blob([bytes]), path.basename(audio));
        response = await fetcher(t.endpoint, { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form, signal: AbortSignal.timeout(600000) });
        raw = await response.text();
        // A provider that is busy says so and names a wait. Two recordings added at once is enough to meet this.
        if ((response.status !== 429 && response.status < 500) || attempt >= 5) break;
        const wait = Number(response.headers.get('retry-after')) || 0;
        await new Promise(r => setTimeout(r, Math.min(60, Math.max(wait, 2 * attempt)) * 1000));
      }
      if (response.status === 400 && sent.length) {
        // A model that can't take key terms refuses the whole request. Its transcript is still worth having.
        sent = [];
        refused = true;
        return reply();
      }
      if (!response.ok) fail('EXTRACTION_FAILED', `The transcription API answered ${response.status} on chunk ${chunk.index}: ${raw.slice(0, 300)}. Chunks already transcribed are kept in ${workDir}; calling again resumes there.`);
      // Saved per chunk, so a failure later never pays for the same audio twice.
      fs.writeFileSync(done, raw);
      return JSON.parse(raw);
    };
    const answer = await reply();
    if (Number.isFinite(Number(answer?.usage?.cost))) charged += Number(answer.usage.cost);
    else unpriced = true;
    const got = chunkCues(answer, chunk, chunk.index === plan.length - 1);
    used.add(got.from);
    cues.push(...got.cues);
  }
  const spoken = cues.filter(c => c.text).sort((a, b) => a.start - b.start);
  const out = timeUnits(spoken, `${t.model} via ${new URL(t.endpoint).host}`, used.has('words') ? { lineSpan: 0, dedupe: false } : { dedupe: false });
  // The owner approved a ceiling; say what it came to. A provider's own figure is better than the estimate when it gives one.
  out.notes.push(
    `Transcription: ${!unpriced && charged > 0 ? `the provider reported ${charged.toFixed(3)} ${currency} for ${plan.length} ${plan.length === 1 ? 'chunk' : 'chunks'}` : `estimated at ${priced ? `${cost.toFixed(3)} ${currency}` : 'an unknown cost'}; the provider reported no figure`}, against ${maxCost} approved. Replies saved earlier are reused and not paid for again.`,
  );
  if (used.has('words')) out.notes.push('Each line is one sentence with the time its first word was spoken, so a frame can be aimed at it.');
  if (used.has('text')) out.notes.push('The transcription model returned no timestamps: each five-minute stretch has one timestamp, and a few words repeat where two stretches meet.');
  if (sent.length) out.notes.push(`${sent.length} key terms were sent to the transcriber: ${sent.slice(0, 12).join(', ')}${sent.length > 12 ? ', …' : ''}.`);
  if (refused) out.notes.push(`${t.model} refused key terms, so the recording was transcribed without them.`);
  out.notes.push('Machine transcription: check names, numbers and terms of art against the recording before quoting them.');
  return out;
}

// Video frames live in frames.ts: the screen map made when a video is added, and the frames a reader asks for.

// ---- entry point ----

export async function extract(config: Config, file: string, options: { workDir?: string; maxCost?: number; fetcher?: typeof fetch; terms?: string[] } = {}): Promise<Extracted> {
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
  if (MEDIA.has(ext)) return extractMedia(config, file, options.workDir ?? fs.mkdtempSync(path.join(os.tmpdir(), 'kf-media-')), options.maxCost, options.fetcher ?? fetch, options.terms ?? []);
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

// What was on screen in a video, and when. Code maps the screen so a reader can choose where to look:
// it finds the moments the picture changed and then held still, and lays them out as filmstrips of small
// thumbnails. It never decides what matters. The reader does that from the transcript, and can ask for any second.
//
// The method was chosen by measurement (23 November 2026, three lessons from three teachers, against lists of
// every chart state written before any picker ran). One frame a minute covered 39% of the states. ffmpeg's
// scene filter alone found nothing for 13.5 minutes while a teacher drew on one chart. A picker that waited
// for four quiet seconds covered 79%. What is built here covered 93%, with no frame taken mid-movement:
// look every ten seconds or at a cut, wait for the picture to settle, drop a frame that never settles
// (a talking head, a transition), and drop a frame that matches one already kept.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import type { Config } from './config.ts';
import { exists, fail, formatTime, readJson, readText, writeJson } from './util.ts';

/** The measured settings. Changing one means scoring again against the reference lists. */
export const PICK = {
  fps: 2, // analysis samples a second
  width: 480, // analysis width, grayscale
  pixel: 14, // gray levels that count as a changed pixel, after a 3x3 blur
  block: 16, // mask block size
  blockActive: 0.01, // a block is active in a step when this share of its pixels changed
  maskFreq: 0.15, // blocks active in more than this share of steps are masked: a webcam box, a ticker, a clock
  boxMax: 0.1, // a busy region is masked as its whole bounding box when the box is under this share of the frame
  quiet: 0.0015, // a step is quiet when under this share of unmasked pixels changed
  novel: 0.0012, // a frame is new when it differs from every kept frame by more than this share
  cut: 0.12, // ffmpeg scene score that counts as a cut
  every: 10, // seconds between looks when nothing cuts
  wait: 6, // seconds to wait for the picture to settle after a trigger
  moving: 0.01, // a frame still changing by this share was never still: not a picture to read
  perSheet: 20, // thumbnails on a filmstrip sheet, four across
};

export type Candidate = { t: number; why: 'cut' | 'timer' };
export type Track = {
  version: 1;
  fps: number;
  /** Seconds into the video where sample 0 sits. 0 except in tests on a window. */
  start: number;
  duration: number;
  source: { width: number; height: number };
  /** Share of the unmasked picture that changed between each sample and the one before. */
  motion: number[];
  masked: number;
  candidates: Candidate[];
  /** Each filmstrip sheet with the time of every thumbnail on it, left to right, top to bottom. */
  sheets: { file: string; times: number[] }[];
  /** Whether each thumbnail has its time burned in. False when this ffmpeg can't draw text. */
  stamped: boolean;
};

function tool(config: Config, name: 'ffmpeg' | 'ffprobe'): string {
  const configured = config.tools?.[name];
  if (configured && exists(configured)) return configured;
  const finder = process.platform === 'win32' ? 'where' : 'which';
  const found = spawnSync(finder, [name], { encoding: 'utf8' });
  const first = found.status === 0 ? found.stdout.split(/\r?\n/).map(l => l.trim()).filter(Boolean)[0] : '';
  if (!first) fail('TOOL_MISSING', `${name} wasn't found on PATH. Install FFmpeg, or set tools.${name} in ~/.know-fu/config.json to its full path.`);
  return first;
}

export function videoSize(config: Config, file: string): { width: number; height: number; duration: number } {
  const out = execFileSync(tool(config, 'ffprobe'), ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:format=duration', '-of', 'json', file], { encoding: 'utf8', timeout: 120000 });
  const data = JSON.parse(out);
  const width = Number(data.streams?.[0]?.width);
  const height = Number(data.streams?.[0]?.height);
  if (!width || !height) fail('EXTRACTION_FAILED', `ffprobe found no video stream in ${file}.`);
  return { width, height, duration: Number(data.format?.duration) || 0 };
}

/** A 3x3 box blur with mirrored edges, so one noisy pixel never counts as a change. */
function blur(src: Uint8Array, w: number, h: number, tmp: Uint16Array, out: Uint8Array) {
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) tmp[row + x] = src[row + (x === 0 ? 1 : x - 1)] + src[row + x] + src[row + (x === w - 1 ? w - 2 : x + 1)];
  }
  for (let y = 0; y < h; y++) {
    const up = (y === 0 ? 1 : y - 1) * w;
    const down = (y === h - 1 ? h - 2 : y + 1) * w;
    const row = y * w;
    for (let x = 0; x < w; x++) out[row + x] = ((tmp[up + x] + tmp[row + x] + tmp[down + x] + 4) / 9) | 0;
  }
}

/** Sample index of the settled frame for a look that starts at sample i. */
function settle(motion: ArrayLike<number>, i: number, n: number): number {
  const hi = Math.min(n - 1, i + PICK.wait * PICK.fps);
  for (let j = i; j <= hi; j++) if (motion[j] < PICK.quiet && (j + 1 >= n || motion[j + 1] < PICK.quiet)) return j;
  let best = i;
  const still = (k: number) => motion[k] + (k + 1 < n ? motion[k + 1] : 0);
  for (let j = i; j <= hi; j++) if (still(j) < still(best)) best = j;
  return best;
}

/**
 * Maps a video's screen: one decode at two frames a second, then arithmetic. Writes track.json and the
 * filmstrip sheets into outDir, and returns the track. `window` is for scoring against a reference only.
 */
export function mapScreen(config: Config, video: string, outDir: string, window: { start?: number; end?: number } = {}): Track {
  const ffmpeg = tool(config, 'ffmpeg');
  const size = videoSize(config, video);
  const W = PICK.width;
  const H = Math.round((W * size.height) / size.width / 2) * 2;
  const start = window.start ?? 0;
  const work = path.join(outDir, '.work');
  fs.rmSync(work, { recursive: true, force: true });
  fs.mkdirSync(path.join(work, 'thumbs'), { recursive: true });
  try {
    // ffmpeg on Windows can't take a drive path inside a filter string, so it runs in the work folder with relative names.
    const graph = (stamp: boolean) =>
      `[0:v]fps=${PICK.fps},split=3[a][b][c];[a]scale=${W}:${H}:flags=area,format=gray[g];` +
      `[b]scale=640:-2:flags=bicubic${stamp ? ",drawtext=text='%{pts\\:hms}':x=6:y=6:fontsize=22:fontcolor=yellow:box=1:boxcolor=black@0.85:boxborderw=5" : ''}[t];` +
      `[c]scale=640:-2,select='gte(scene,0)',metadata=print:file=scene.txt[s]`;
    const decode = (stamp: boolean) =>
      spawnSync(
        ffmpeg,
        [
          '-nostdin', '-hide_banner', '-loglevel', 'error', '-y',
          ...(start ? ['-ss', String(start)] : []),
          ...(window.end ? ['-t', String(window.end - start)] : []),
          '-i', video, '-an', '-sn', '-filter_complex', graph(stamp),
          '-map', '[g]', '-f', 'rawvideo', '-pix_fmt', 'gray', 'gray.raw',
          '-map', '[t]', '-q:v', '4', 'thumbs/%06d.jpg',
          '-map', '[s]', '-f', 'null', '-',
        ],
        { cwd: work, stdio: 'ignore', timeout: 6 * 3600 * 1000 },
      );
    let stamped = true;
    if (decode(true).status !== 0) {
      // An ffmpeg built without text drawing still makes the map; the times are then listed beside each sheet.
      stamped = false;
      if (decode(false).status !== 0) fail('EXTRACTION_FAILED', `ffmpeg couldn't decode ${video} for its screen map.`);
    }
    const raw = path.join(work, 'gray.raw');
    const frameBytes = W * H;
    const n = Math.floor(fs.statSync(raw).size / frameBytes);
    if (n < 2) fail('EXTRACTION_FAILED', `${video} decoded to fewer than two frames.`);

    // Pass over the frames once, keeping only how many pixels changed in each block at each step.
    const B = PICK.block;
    const bh = Math.floor(H / B);
    const bw = Math.floor(W / B);
    const nb = bh * bw;
    const blockOf = new Int32Array(frameBytes);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) blockOf[y * W + x] = y < bh * B && x < bw * B ? Math.floor(y / B) * bw + Math.floor(x / B) : nb;
    const counts = new Uint16Array(n * (nb + 1));
    const fd = fs.openSync(raw, 'r');
    const buffer = new Uint8Array(frameBytes);
    const tmp = new Uint16Array(frameBytes);
    let prev = new Uint8Array(frameBytes);
    let cur = new Uint8Array(frameBytes);
    const load = (index: number, into: Uint8Array) => {
      fs.readSync(fd, buffer, 0, frameBytes, index * frameBytes);
      blur(buffer, W, H, tmp, into);
    };
    try {
      load(0, prev);
      for (let i = 1; i < n; i++) {
        load(i, cur);
        const base = i * (nb + 1);
        for (let p = 0; p < frameBytes; p++) {
          const d = cur[p] - prev[p];
          if (d > PICK.pixel || d < -PICK.pixel) counts[base + blockOf[p]]++;
        }
        [prev, cur] = [cur, prev];
      }

      // Regions that change in most steps are furniture, never content: a webcam box, a ticker, a clock.
      const active = new Float32Array(nb);
      const need = PICK.blockActive * B * B;
      for (let i = 1; i < n; i++) for (let b = 0; b < nb; b++) if (counts[i * (nb + 1) + b] > need) active[b]++;
      let masked = new Uint8Array(nb);
      for (let b = 0; b < nb; b++) if (active[b] / (n - 1) > PICK.maskFreq) masked[b] = 1;
      const grown = new Uint8Array(nb);
      for (let y = 0; y < bh; y++)
        for (let x = 0; x < bw; x++) {
          let on = 0;
          for (let dy = -1; dy <= 1 && !on; dy++) for (let dx = -1; dx <= 1; dx++) if (y + dy >= 0 && y + dy < bh && x + dx >= 0 && x + dx < bw && masked[(y + dy) * bw + x + dx]) on = 1;
          grown[y * bw + x] = on;
        }
      masked = grown.slice();
      // A webcam box only moves where the person is, so a small busy region is masked as its whole box.
      const seen = new Uint8Array(nb);
      for (let b0 = 0; b0 < nb; b0++) {
        if (!grown[b0] || seen[b0]) continue;
        let x0 = bw, x1 = 0, y0 = bh, y1 = 0;
        const stack = [b0];
        seen[b0] = 1;
        while (stack.length) {
          const b = stack.pop()!;
          const y = Math.floor(b / bw), x = b % bw;
          x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
          for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++) {
              const yy = y + dy, xx = x + dx;
              if (yy < 0 || yy >= bh || xx < 0 || xx >= bw) continue;
              const q = yy * bw + xx;
              if (grown[q] && !seen[q]) { seen[q] = 1; stack.push(q); }
            }
        }
        if ((x1 - x0 + 1) * (y1 - y0 + 1) <= PICK.boxMax * nb) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) masked[y * bw + x] = 1;
      }
      let maskedBlocks = 0;
      for (let b = 0; b < nb; b++) maskedBlocks += masked[b];
      const open = Math.max(1, frameBytes - maskedBlocks * B * B);
      const motion = new Float32Array(n);
      for (let i = 1; i < n; i++) {
        let changed = counts[i * (nb + 1) + nb];
        for (let b = 0; b < nb; b++) if (!masked[b]) changed += counts[i * (nb + 1) + b];
        motion[i] = changed / open;
      }
      motion[0] = motion[1];

      const scene = new Float32Array(n);
      const sceneFile = path.join(work, 'scene.txt');
      if (exists(sceneFile)) {
        let at = -1;
        for (const line of readText(sceneFile).split('\n')) {
          const frame = /^frame:(\d+)/.exec(line);
          if (frame) at = Number(frame[1]);
          const score = /scene_score=([\d.]+)/.exec(line);
          if (score && at >= 0 && at < n) scene[at] = Number(score[1]);
        }
      }

      // Look every `every` seconds or at a cut, and take the frame once the picture has settled.
      const looks: { j: number; why: Candidate['why'] }[] = [];
      for (let i = 0, last = -1; i < n; ) {
        const cut = scene[i] > PICK.cut;
        if (last < 0 || cut || (i - last) / PICK.fps >= PICK.every) {
          const j = settle(motion, i, n);
          looks.push({ j, why: cut ? 'cut' : 'timer' });
          last = j;
          i = j + 1;
        } else i++;
      }
      const pixelOpen = new Uint8Array(frameBytes);
      for (let p = 0; p < frameBytes; p++) pixelOpen[p] = blockOf[p] === nb || !masked[blockOf[p]] ? 1 : 0;
      const kept: { j: number; why: Candidate['why']; frame: Uint8Array }[] = [];
      for (const look of looks) {
        // A frame that never stopped moving is a talking head or a transition.
        if (Math.min(motion[look.j], motion[Math.min(look.j + 1, n - 1)]) > PICK.moving) continue;
        const frame = new Uint8Array(frameBytes);
        load(look.j, frame);
        let fresh = true;
        for (const k of kept) {
          let changed = 0;
          for (let p = 0; p < frameBytes; p++) {
            const d = frame[p] - k.frame[p];
            if ((d > PICK.pixel || d < -PICK.pixel) && pixelOpen[p]) changed++;
          }
          if (changed / open <= PICK.novel) {
            fresh = false;
            break;
          }
        }
        if (fresh) kept.push({ ...look, frame });
      }

      // Filmstrips: the kept thumbnails, twenty to a sheet.
      const seq = path.join(work, 'seq');
      fs.mkdirSync(seq, { recursive: true });
      kept.forEach((k, index) => fs.copyFileSync(path.join(work, 'thumbs', String(k.j + 1).padStart(6, '0') + '.jpg'), path.join(seq, String(index + 1).padStart(6, '0') + '.jpg')));
      for (const old of fs.readdirSync(outDir).filter(f => /^strip-\d+\.jpg$/.test(f))) fs.rmSync(path.join(outDir, old));
      const sheets: Track['sheets'] = [];
      for (let from = 0; from < kept.length; from += PICK.perSheet) {
        const chunk = kept.slice(from, from + PICK.perSheet);
        const file = `strip-${String(sheets.length + 1).padStart(2, '0')}.jpg`;
        const rows = Math.ceil(chunk.length / 4);
        const made = spawnSync(ffmpeg, ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-start_number', String(from + 1), '-i', 'seq/%06d.jpg', '-frames:v', '1', '-vf', `select='lt(n,${chunk.length})',tile=4x${rows}:padding=6:color=white`, '-q:v', '3', file], { cwd: work, stdio: 'ignore', timeout: 600000 });
        if (made.status !== 0 || !exists(path.join(work, file))) fail('EXTRACTION_FAILED', `ffmpeg couldn't build filmstrip ${file}.`);
        fs.copyFileSync(path.join(work, file), path.join(outDir, file));
        sheets.push({ file, times: chunk.map(k => start + k.j / PICK.fps) });
      }
      const track: Track = {
        version: 1,
        fps: PICK.fps,
        start,
        duration: size.duration,
        source: { width: size.width, height: size.height },
        motion: Array.from(motion, m => Math.round(m * 100000) / 100000),
        masked: Math.round(((maskedBlocks * B * B) / frameBytes) * 1000) / 1000,
        candidates: kept.map(k => ({ t: start + k.j / PICK.fps, why: k.why })),
        sheets,
        stamped,
      };
      writeJson(path.join(outDir, 'track.json'), track);
      return track;
    } finally {
      fs.closeSync(fd);
    }
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

export function loadTrack(framesDir: string): Track | null {
  const file = path.join(framesDir, 'track.json');
  return exists(file) ? (readJson(file) as Track) : null;
}

/**
 * The screen for one sentence: the settled picture as the sentence ends, and the settled picture before it
 * began when the two differ. A speaker says "this low here" and the line lands a few seconds later, so the
 * frame at the sentence's own second often catches the pen mid-stroke.
 */
export function screenFor(track: Track, from: number, to: number): { before?: number; after: number } {
  const n = track.motion.length;
  const index = (t: number) => Math.min(n - 1, Math.max(0, Math.round((t - track.start) * track.fps)));
  const time = (i: number) => track.start + i / track.fps;
  const after = settle(track.motion, index(Math.max(from, to - 1)), n);
  let before = index(from);
  // Walk back to the last quiet sample at or before the sentence began.
  for (let j = before; j >= Math.max(1, before - PICK.wait * PICK.fps); j--)
    if (track.motion[j] < PICK.quiet && track.motion[Math.min(j + 1, n - 1)] < PICK.quiet) {
      before = j;
      break;
    }
  if (before >= after) return { after: time(after) };
  let moved = 0;
  for (let j = before + 1; j <= after; j++) moved += track.motion[j];
  return moved > PICK.novel * 2 ? { before: time(before), after: time(after) } : { after: time(after) };
}

/** Parses a crop box given as "x,y,w,h" in percent of the frame. */
export function parseBox(box: string): [number, number, number, number] {
  const parts = box.split(/[,\s]+/).filter(Boolean).map(Number);
  const [x, y, w, h] = parts;
  if (parts.length !== 4 || parts.some(v => !Number.isFinite(v)) || x < 0 || y < 0 || w < 2 || h < 2 || x + w > 100.5 || y + h > 100.5)
    fail('INVALID', `box is "x,y,w,h" in percent of the frame, like "55,20,40,35" for a region starting 55% across and 20% down; got "${box}".`);
  return [x, y, Math.min(w, 100 - x), Math.min(h, 100 - y)];
}

const stamp = (seconds: number) => String(Math.round(seconds * 10)).padStart(7, '0');

/**
 * One frame at reading size, cached by time. Sizes follow a test on candlestick frames (23 November 2026):
 * 1080p reads as well as anything larger, so it is left alone; a larger source comes down to 2,576 px, the most
 * a reader is shown; a smaller source goes up to 2,576 px, which recovered the thin lines readers missed at 720p.
 * A crop is cut from the original frame, never from the resized one, and enlarged when it is small.
 */
export function frameImage(config: Config, video: string, seconds: number, outDir: string, box?: [number, number, number, number]): string {
  // Tenths of a percent in the name, so two boxes that differ by half a percent are two files.
  const name = `t${stamp(seconds)}${box ? `-c${box.map(v => Math.round(v * 10)).join('-')}` : ''}.jpg`;
  const target = path.join(outDir, name);
  if (exists(target)) return target;
  fs.mkdirSync(outDir, { recursive: true });
  const size = videoSize(config, video);
  let filter: string;
  if (box) {
    const [x, y, w, h] = box;
    const long = Math.max((size.width * w) / 100, (size.height * h) / 100);
    const scale = long < 1200 ? 1200 / long : long > 2576 ? 2576 / long : 1;
    filter = `crop=iw*${w / 100}:ih*${h / 100}:iw*${x / 100}:ih*${y / 100}` + (scale !== 1 ? `,scale=trunc(iw*${scale.toFixed(4)}/2)*2:-2:flags=lanczos` : '');
  } else filter = size.width > 2576 || size.height < 1080 ? 'scale=2576:-2:flags=lanczos' : 'null';
  const run = spawnSync(tool(config, 'ffmpeg'), ['-nostdin', '-hide_banner', '-loglevel', 'error', '-y', '-ss', String(seconds), '-i', video, '-frames:v', '1', '-vf', filter, '-q:v', '2', target], { stdio: 'ignore', timeout: 120000 });
  if (run.status !== 0 || !exists(target)) fail('EXTRACTION_FAILED', `ffmpeg couldn't take a frame at ${formatTime(seconds)}.`);
  return target;
}

/** Seconds a cached frame file shows, or null when the name isn't a frame. */
export function frameSecond(file: string): number | null {
  const m = /^t(\d{7})(?:-c[\d-]+)?\.jpg$/.exec(file);
  // (A crop's name carries its box after "-c"; the time is the same as the frame it was cut from.)
  return m ? Number(m[1]) / 10 : null;
}

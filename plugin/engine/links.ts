// A video link as a source: yt-dlp fetches the video at the best size it has, up to 4K, and the page's own
// captions when it has any. yt-dlp is optional, found at runtime like FFmpeg; without it a link is refused
// with how to install it, and files work as before.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import type { Config } from './config.ts';
import { exists, fail, slugify } from './util.ts';

export const isLink = (text: string) => /^https?:\/\/\S+$/i.test(String(text ?? '').trim());

/** Runs yt-dlp with these arguments. Tests pass their own. */
export type Runner = (args: string[]) => { status: number | null; stdout: string; stderr: string };

export type LinkInfo = { id: string; title: string; uploader: string; date: string; duration: number; url: string; description: string; height: number; captions: 'own' | 'automatic' | 'none' };

export function findYtdlp(config: Config): string {
  const configured = config.tools?.ytdlp;
  if (configured && exists(configured)) return configured;
  const finder = process.platform === 'win32' ? 'where' : 'which';
  const found = spawnSync(finder, ['yt-dlp'], { encoding: 'utf8' });
  const first = found.status === 0 ? found.stdout.split(/\r?\n/).map(l => l.trim()).filter(Boolean)[0] : '';
  if (!first) fail('TOOL_MISSING', `A video link needs yt-dlp, which wasn't found on PATH. Install it (Windows: scoop install yt-dlp or winget install yt-dlp.yt-dlp; macOS: brew install yt-dlp), or set tools.ytdlp in ~/.know-fu/config.json to its full path. Or download the video yourself and add the file.`);
  return first;
}

function runner(config: Config): Runner {
  const exe = findYtdlp(config);
  // yt-dlp wants a JavaScript runtime for some sites, and this engine is already running on one.
  const run = (args: string[]) => spawnSync(exe, args, { encoding: 'utf8', maxBuffer: 1 << 28, timeout: 4 * 3600 * 1000 });
  return args => {
    const first = run(['--js-runtimes', 'node', ...args]);
    const result = first.status !== 0 && /no such option/i.test(first.stderr ?? '') ? run(args) : first;
    return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
  };
}

const reason = (stderr: string) => stderr.split(/\r?\n/).filter(l => /^ERROR/i.test(l)).join(' ').slice(0, 400) || stderr.trim().split(/\r?\n/).at(-1)?.slice(0, 400) || 'no message';

/** What a link points at, without downloading it. */
export function linkInfo(config: Config, url: string, run: Runner = runner(config)): LinkInfo {
  const out = run(['--no-playlist', '--skip-download', '--dump-single-json', url]);
  let data: any = null;
  try {
    data = JSON.parse(out.stdout);
  } catch {
    // Falls through to the failure below with whatever yt-dlp said.
  }
  if (out.status !== 0 || !data?.id) fail('EXTRACTION_FAILED', `yt-dlp couldn't read ${url}: ${reason(out.stderr)}`);
  const english = (set: any) => Object.keys(set ?? {}).some(k => /^en\b/i.test(k));
  return {
    id: String(data.id),
    title: String(data.title ?? data.id),
    uploader: String(data.uploader ?? data.channel ?? ''),
    date: String(data.upload_date ?? ''),
    duration: Number(data.duration) || 0,
    url: String(data.webpage_url ?? url),
    description: String(data.description ?? ''),
    height: Number(data.height) || Math.max(0, ...(Array.isArray(data.formats) ? data.formats.map((f: any) => Number(f.height) || 0) : [0])),
    captions: english(data.subtitles) ? 'own' : english(data.automatic_captions) ? 'automatic' : 'none',
  };
}

const VIDEO_FILE = /\.(mp4|mkv|webm|mov|m4v)$/i;

/** Downloads a link into `dir` and returns the video and, when the page had English captions, their file. */
export function download(config: Config, info: LinkInfo, dir: string, ffmpeg: string, run: Runner = runner(config)): { file: string; captions?: string } {
  fs.mkdirSync(dir, { recursive: true });
  const name = slugify(info.title).slice(0, 60) || slugify(info.id) || 'video';
  const found = () => fs.readdirSync(dir).find(f => VIDEO_FILE.test(f) && !/\.part$/i.test(f));
  // A download interrupted or refused at the spending check is kept, so the next call doesn't fetch it again.
  if (!found()) {
    const out = run([
      '--no-playlist',
      '-f', 'bv*[height<=2160]+ba/b[height<=2160]/b',
      '--merge-output-format', 'mkv',
      '--ffmpeg-location', path.dirname(ffmpeg),
      '--write-subs', '--write-auto-subs', '--sub-langs', 'en.*,en', '--sub-format', 'vtt',
      '-o', path.join(dir, `${name}.%(ext)s`),
      info.url,
    ]);
    // Captions can fail (a rate limit, none in English) and leave a good video behind; only a missing video is a failure.
    if (!found()) fail('EXTRACTION_FAILED', `yt-dlp couldn't download ${info.url}: ${reason(out.stderr)}`);
  }
  const subs = fs.readdirSync(dir).filter(f => /\.vtt$/i.test(f)).sort((a, b) => Number(/\.en\.vtt$/i.test(b)) - Number(/\.en\.vtt$/i.test(a)) || a.length - b.length);
  return { file: path.join(dir, found()!), captions: subs[0] ? path.join(dir, subs[0]) : undefined };
}

import * as fs from "node:fs/promises";
import path from "node:path";
import {
  APP,
  ensure,
  hash,
  json,
  immutable,
  readJson,
  exists,
  STATE,
} from "./core.js";
import { run } from "./process.js";
import { MediaRuntime } from "./media-runtime.js";

export class Visuals {
  constructor(private runtime = new MediaRuntime()) {}
  async navigation(original: string, output: string, options: any = {}) {
    const interval = options.max_gap_seconds ?? 20,
      threshold = options.scene_threshold ?? 0.12;
    ensure(
      Number.isFinite(interval) &&
        interval >= 1 &&
        interval <= 60 &&
        Number.isFinite(threshold) &&
        threshold > 0 &&
        threshold < 1,
      "VALIDATION_FAILED",
      "Invalid navigation settings",
    );
    const dir = path.join(output, "navigation"),
      manifest = path.join(dir, "manifest.json");
    await fs.mkdir(dir, { recursive: true });
    const sourceHash = hash(await fs.readFile(original));
    if (await exists(manifest)) {
      const prior = await readJson(manifest);
      ensure(
        prior.source_sha256 === sourceHash &&
          prior.interval === interval &&
          prior.threshold === threshold,
        "REVISION_CONFLICT",
        "Navigation settings changed",
      );
      for (const f of prior.assets)
        ensure(
          hash(await fs.readFile(f.path)) === f.sha256,
          "SOURCE_UNREADABLE",
          "Navigation asset changed",
        );
      return prior.units;
    }
    const result = await this.runtime.exec(
      "ffmpeg",
      [
        "-nostdin",
        "-y",
        "-i",
        await this.runtime.file(original),
        "-map",
        "0:v:0",
        "-vf",
        `setpts=PTS-STARTPTS,fps=2,scale=640:-2,select=isnan(prev_selected_t)+gt(scene\\,${threshold})+gte(t-prev_selected_t\\,${interval}),showinfo`,
        "-fps_mode",
        "vfr",
        "-q:v",
        "3",
        await this.runtime.file(path.join(dir, "%06d.jpg")),
      ],
      1800000,
    );
    const stamps = [
      ...result.stderr.matchAll(/\bn:\s*\d+\s+pts:.*?pts_time:([-\d.e+]+)/g),
    ].map((m) => Number(m[1]));
    ensure(
      stamps.length > 0,
      "SOURCE_UNREADABLE",
      "No navigation frames decoded",
    );
    const frames = [];
    for (let i = 0; i < stamps.length; i++) {
      const p = path.join(dir, `${String(i + 1).padStart(6, "0")}.jpg`);
      frames.push({
        path: p,
        seconds: stamps[i],
        sha256: hash(await fs.readFile(p)),
      });
    }
    await immutable(path.join(dir, "frames.json"), json(frames));
    const config = await readJson(path.join(STATE, "config.json"));
    const sheets = JSON.parse(
      (
        await run(config.python, [
          path.join(APP, "scripts/contact-sheets.py"),
          path.join(dir, "frames.json"),
          dir,
        ])
      ).stdout,
    );
    const units = sheets.map((sheet: any, index: number) => {
      const text = json({
        role: "Navigation overview: inspect native frames for fine details",
        frames: sheet.frames.map((f: any) => ({
          seconds: f.seconds,
          sha256: f.sha256,
        })),
        timing:
          "Normalized sampled video timeline; approximate navigation, not authoritative speech timing",
      });
      return {
        unit_id: `navigation-${index}`,
        kind: "figure",
        text,
        sha256: hash(text),
        asset_path: sheet.path,
        asset_sha256: sheet.sha256,
        locator: {
          kind: "time_ms",
          label: `Navigation sheet ${index + 1}`,
          start: Math.floor(sheet.frames[0].seconds * 1000),
          end: Math.ceil((sheet.frames.at(-1).seconds + 0.5) * 1000),
          anchor: `navigation-${index}`,
          precision: "approximate",
        },
      };
    });
    await immutable(
      manifest,
      json({
        source_sha256: sourceHash,
        interval,
        threshold,
        units,
        assets: [
          ...frames,
          ...sheets.map((s: any) => ({ path: s.path, sha256: s.sha256 })),
        ],
      }),
    );
    return units;
  }
  async frame(original: string, output: string, seconds: number) {
    const probe = await this.runtime.probe(original),
      duration = Number(probe.format.duration),
      stream = probe.streams.find((s: any) => s.codec_type === "video");
    ensure(
      stream && Number.isFinite(seconds) && seconds >= 0 && seconds < duration,
      "VALIDATION_FAILED",
      "Frame time must be within a video",
    );
    await fs.mkdir(output, { recursive: true });
    const file = path.join(output, "frame.png"),
      origin = Number(probe.format.start_time ?? 0),
      seek = Math.max(0, seconds - 2),
      target = origin + seconds;
    const result = await this.runtime.exec("ffmpeg", [
      "-nostdin",
      "-y",
      "-ss",
      String(seek),
      "-copyts",
      "-i",
      await this.runtime.file(original),
      "-map",
      "0:v:0",
      "-vf",
      `select=gte(t\\,${target}),showinfo`,
      "-frames:v",
      "1",
      "-fps_mode",
      "vfr",
      await this.runtime.file(file),
    ]);
    const match = result.stderr.match(/\bn:\s*0\s+pts:.*?pts_time:([-\d.e+]+)/);
    ensure(
      match && (await exists(file)),
      "SOURCE_UNREADABLE",
      "No frame or decoded presentation timestamp",
    );
    const decoded = Number(match[1]),
      actual = decoded - origin;
    ensure(
      actual >= seconds - 0.01 && actual <= duration + 0.1,
      "SOURCE_UNREADABLE",
      "Decoded time outside requested source range",
    );
    const details = {
      requested_seconds: seconds,
      decoded_pts_seconds: decoded,
      source_start_seconds: origin,
      actual_source_seconds: actual,
      width: stream.width,
      height: stream.height,
      source_sha256: hash(await fs.readFile(original)),
      asset_sha256: hash(await fs.readFile(file)),
    };
    const text = json(details);
    return {
      unit_id: "native-frame",
      kind: "frame",
      text,
      sha256: hash(text),
      asset_path: file,
      asset_sha256: details.asset_sha256,
      details,
      locator: {
        kind: "time_ms",
        label: `Native frame at decoded source ${actual}s`,
        start: Math.round(actual * 1000),
        end: Math.round(actual * 1000),
        anchor: "native-frame",
        precision: "exact",
      },
    };
  }
  async crop(asset: string, output: string, rectangle: number[]) {
    ensure(
      rectangle.length === 4 &&
        rectangle.every(Number.isInteger) &&
        rectangle[0] >= 0 &&
        rectangle[1] >= 0 &&
        rectangle[2] > 0 &&
        rectangle[3] > 0,
      "VALIDATION_FAILED",
      "Crop is [x,y,width,height] in source pixels",
    );
    await fs.mkdir(output, { recursive: true });
    const config = await readJson(path.join(STATE, "config.json")),
      file = path.join(output, "crop.png");
    const result = JSON.parse(
      (
        await run(config.python, [
          path.join(APP, "scripts/contact-sheets.py"),
          "--crop",
          asset,
          file,
          ...rectangle.map(String),
        ])
      ).stdout,
    );
    return {
      file,
      details: {
        source_asset_sha256: hash(await fs.readFile(asset)),
        rectangle,
        asset_sha256: hash(await fs.readFile(file)),
        ...result,
      },
    };
  }
  async page(original: string, output: string, page: number, scale = 3) {
    ensure(
      Number.isInteger(page) &&
        page >= 1 &&
        Number.isFinite(scale) &&
        scale >= 1 &&
        scale <= 6,
      "VALIDATION_FAILED",
      "Use physical page >=1 and render scale 1 to 6",
    );
    await fs.mkdir(output, { recursive: true });
    const config = await readJson(path.join(STATE, "config.json")),
      file = path.join(output, "page.png");
    const details = JSON.parse(
      (
        await run(config.python, [
          path.join(APP, "scripts/contact-sheets.py"),
          "--page",
          original,
          file,
          String(page),
          String(scale),
        ])
      ).stdout,
    );
    const text = json({
      ...details,
      source_sha256: hash(await fs.readFile(original)),
    });
    return {
      unit_id: "page-" + page,
      kind: "figure",
      text,
      sha256: hash(text),
      asset_path: file,
      asset_sha256: hash(await fs.readFile(file)),
      details,
      locator: {
        kind: "pages",
        label: `Physical PDF page ${page}, render scale ${scale}`,
        start: page,
        end: page,
        anchor: "page-" + page,
        precision: "exact",
      },
    };
  }
}

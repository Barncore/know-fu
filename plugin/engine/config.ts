// Know Fu's settings live in one file, ~/.know-fu/config.json, and never in a host's plugin options:
// the Claude desktop app hands plugins to Claude Code by a route that drops those options (13 October 2026).
import os from 'node:os';
import path from 'node:path';
import { exists, readJson, writeJson, samePath, isInside, fail } from './util.ts';

export type Config = {
  schema_version: number;
  /** The library folder. A session opened in this folder is the home session, the only one that ingests. */
  library: string;
  /** When true, the tools stay closed in a chat until the user invokes the skill there, unless the project is pinned. */
  deliberate_use?: boolean;
  /** Project folder -> topic paths whose principles load at session start in that project. */
  pins?: Record<string, string[]>;
  /** Full paths for tools that aren't on PATH, or where PATH finds the wrong one. */
  tools?: { pdftotext?: string; pdftoppm?: string; ffmpeg?: string; ffprobe?: string; pandoc?: string };
  transcription?: {
    endpoint: string;
    model: string;
    api_key_file?: string;
    api_key_env?: string;
    cost_per_minute?: number;
    currency?: string;
  };
};

export const configPath = () => process.env.KNOW_FU_CONFIG || path.join(os.homedir(), '.know-fu', 'config.json');

export function loadConfig(): Config {
  const file = configPath();
  const override = process.env.KNOW_FU_LIBRARY;
  let config: Partial<Config> = {};
  if (exists(file)) {
    try {
      config = readJson(file);
    } catch (error: any) {
      fail('NOT_CONFIGURED', `The Know Fu config file at ${file} isn't valid JSON: ${error.message}`);
    }
  } else if (!override) {
    fail('NOT_CONFIGURED', `There's no Know Fu config file at ${file}. Run setup: node <plugin>/engine/cli.ts init <library folder>.`);
  }
  const library = override || config.library;
  if (!library || typeof library !== 'string') {
    fail(
      'NOT_CONFIGURED',
      `The Know Fu config file at ${file} has no "library" path. Version 0.6 keeps one library for every agent; run setup (node <plugin>/engine/cli.ts init <library folder>) to create it and write the setting.`,
    );
  }
  return { schema_version: 2, deliberate_use: true, ...config, library: path.resolve(library) };
}

export function saveConfig(change: (config: Record<string, any>) => void) {
  const file = configPath();
  const config: Record<string, any> = exists(file) ? readJson(file) : {};
  change(config);
  config.schema_version = 2;
  writeJson(file, config);
}

/** The folder the calling session was opened in. */
export const projectDir = () => path.resolve(process.env.KB_PROJECT || process.env.CLAUDE_PROJECT_DIR || process.cwd());

/** The home session is the one opened in the library folder. Only it changes the library. */
export function isHome(config: Config, project = projectDir()): boolean {
  return isInside(project, config.library);
}

export function requireHome(config: Config, action: string) {
  if (process.env.KNOW_FU_WRITE_ANYWHERE === '1') return;
  if (!isHome(config))
    fail(
      'NOT_HOME',
      `${action} only runs from a session opened in the library folder, ${config.library}. This session is in ${projectDir()}. From here you can read the library, and save a note for later with kf_note.`,
    );
}

export function pinsFor(config: Config, project = projectDir()): string[] {
  for (const [folder, topics] of Object.entries(config.pins ?? {})) if (samePath(folder, project)) return topics;
  return [];
}

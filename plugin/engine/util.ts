// Small helpers shared by the engine. No dependencies beyond Node itself.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export class KfError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export function fail(code: string, message: string): never {
  throw new KfError(code, message);
}

export const exists = (p: string) => fs.existsSync(p);

export function readText(p: string): string {
  // Normalize line endings so line numbers and hashes don't depend on who wrote the file.
  return fs.readFileSync(p, 'utf8').replace(/^﻿/, '').replace(/\r\n?/g, '\n');
}

export function writeText(p: string, text: string) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, text.replace(/\r\n?/g, '\n'), 'utf8');
}

export function readJson<T = any>(p: string): T {
  return JSON.parse(readText(p));
}

export function writeJson(p: string, value: unknown) {
  writeText(p, JSON.stringify(value, null, 2) + '\n');
}

export const sha = (text: string | Buffer) => crypto.createHash('sha256').update(text).digest('hex');

export function fileSha(p: string): string {
  const hash = crypto.createHash('sha256');
  const fd = fs.openSync(p, 'r');
  try {
    const buffer = Buffer.alloc(1 << 20);
    let read: number;
    while ((read = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0) hash.update(buffer.subarray(0, read));
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest('hex');
}

export function slugify(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/, '');
}

export const isSlug = (text: string) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(text);

export function countWords(text: string): number {
  const m = text.match(/[\p{L}\p{N}][\p{L}\p{N}'’.-]*/gu);
  return m ? m.length : 0;
}

/** A rough token count. Close enough for budgets: English prose runs near four characters a token. */
export const tokens = (text: string) => Math.ceil(text.length / 4);

/** Letters and digits only, lower case. Quote checks compare words, never spacing, hyphenation or quote marks. */
export function squash(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/-\n\s*/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

/** Forward slashes and, on Windows, lower case, so one folder spelled two ways compares equal. */
export function samePath(a: string, b: string): boolean {
  const norm = (p: string) => {
    const full = path.resolve(p).replace(/\\/g, '/').replace(/\/+$/, '');
    return process.platform === 'win32' ? full.toLowerCase() : full;
  };
  return norm(a) === norm(b);
}

export function isInside(child: string, parent: string): boolean {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

export const today = () => new Date().toISOString().slice(0, 10);

export function listDirs(dir: string): string[] {
  if (!exists(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter(d => d.isDirectory() && !d.name.startsWith('.') && !d.name.startsWith('_'))
    .map(d => d.name)
    .sort();
}

export function listFiles(dir: string, ext = '.md'): string[] {
  if (!exists(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter(d => d.isFile() && d.name.endsWith(ext) && !d.name.startsWith('_'))
    .map(d => d.name)
    .sort();
}

/** Seconds from "12:34" or "1:02:03". */
export function parseTime(text: string): number | null {
  const m = /^(?:(\d{1,2}):)?(\d{1,2}):(\d{2})$/.exec(text.trim());
  if (!m) return null;
  return Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}

export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
}

// Frontmatter for library files: a strict subset of YAML.
//
// A key holds a string or a list of strings, nothing else. Anything outside that grammar is an
// error, never a guess: an earlier Know Fu read `why: A, B` inside a flow mapping, kept "A" and
// silently dropped the rest (17 October 2026). A parser that refuses is cheaper than one that truncates.

export type FM = Record<string, string | string[]>;

export type Parsed = {
  fm: FM;
  body: string;
  /** 1-based line number of the body's first line in the file. */
  bodyLine: number;
  errors: string[];
  has: boolean;
};

const KEY = /^([a-z][a-z0-9_]*):(?:[ \t]+(.*))?$/;

function unquote(raw: string, errors: string[], line: number): string {
  const text = raw.trim();
  if (text.length >= 2 && text[0] === '"' && text.at(-1) === '"') {
    return text.slice(1, -1).replace(/\\(["\\])/g, '$1');
  }
  if (text.length >= 2 && text[0] === "'" && text.at(-1) === "'") {
    return text.slice(1, -1).replace(/''/g, "'");
  }
  if (text[0] === '"' || text[0] === "'") errors.push(`line ${line}: a quoted value isn't closed`);
  return text;
}

function splitFlow(inner: string): string[] {
  const out: string[] = [];
  let current = '';
  let quote = '';
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (quote) {
      current += ch;
      if (ch === '\\' && quote === '"') current += inner[++i] ?? '';
      else if (ch === quote) quote = '';
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
    } else if (ch === ',') {
      out.push(current);
      current = '';
    } else current += ch;
  }
  if (current.trim() || out.length) out.push(current);
  return out;
}

export function parseFrontmatter(text: string): Parsed {
  const errors: string[] = [];
  const lines = text.split('\n');
  if (lines[0]?.trim() !== '---') return { fm: {}, body: text, bodyLine: 1, errors, has: false };
  const end = lines.findIndex((l, i) => i > 0 && l.trim() === '---');
  if (end < 0) {
    return { fm: {}, body: '', bodyLine: lines.length + 1, errors: ['the frontmatter block is never closed with ---'], has: true };
  }
  const fm: FM = {};
  let listKey: string | null = null;
  for (let i = 1; i < end; i++) {
    const raw = lines[i];
    const n = i + 1;
    if (!raw.trim() || raw.trim().startsWith('#')) continue;
    const item = /^[ \t]*-[ \t]+(.*)$/.exec(raw);
    if (item) {
      if (!listKey) errors.push(`line ${n}: a list item with no key above it`);
      else (fm[listKey] as string[]).push(unquote(item[1], errors, n));
      continue;
    }
    if (/^[ \t]/.test(raw)) {
      errors.push(`line ${n}: nested values aren't supported; a key holds one string or one list`);
      continue;
    }
    const m = KEY.exec(raw);
    if (!m) {
      errors.push(`line ${n}: expected "key: value"`);
      continue;
    }
    const [, key, rest = ''] = m;
    if (key in fm) errors.push(`line ${n}: "${key}" appears twice`);
    const value = rest.trim();
    listKey = null;
    if (!value) {
      fm[key] = [];
      listKey = key;
    } else if (value.startsWith('{')) {
      errors.push(`line ${n}: "${key}" uses a {…} mapping, which isn't supported; write a string or a list`);
      fm[key] = '';
    } else if (value.startsWith('[')) {
      if (!value.endsWith(']')) {
        errors.push(`line ${n}: the list for "${key}" isn't closed with ]`);
        fm[key] = [];
      } else {
        fm[key] = splitFlow(value.slice(1, -1))
          .map(v => unquote(v, errors, n))
          .filter(v => v !== '');
      }
    } else if (value === '|' || value === '>' || value.startsWith('|-') || value.startsWith('>-')) {
      errors.push(`line ${n}: block scalars (| and >) aren't supported; put "${key}" on one line`);
      fm[key] = '';
    } else fm[key] = unquote(value, errors, n);
  }
  // A key written as "key:" with no items under it is an empty string, not an empty list, unless items followed.
  return { fm, body: lines.slice(end + 1).join('\n'), bodyLine: end + 2, errors, has: true };
}

const plain = /^[A-Za-z0-9][A-Za-z0-9 _./()+&%-]*$/;

function scalar(value: string): string {
  if (plain.test(value) && !/^(true|false|null|yes|no|~)$/i.test(value) && !/\s$/.test(value)) return value;
  return '"' + value.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
}

export function formatFrontmatter(fm: Record<string, string | string[] | number | undefined>): string {
  const lines = ['---'];
  for (const [key, value] of Object.entries(fm)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) lines.push(`${key}: [${value.map(scalar).join(', ')}]`);
    else lines.push(`${key}: ${scalar(String(value))}`);
  }
  lines.push('---');
  return lines.join('\n') + '\n';
}

export const asList = (value: string | string[] | undefined): string[] =>
  value === undefined ? [] : Array.isArray(value) ? value : value.trim() ? [value.trim()] : [];

export const asText = (value: string | string[] | undefined): string =>
  value === undefined ? '' : Array.isArray(value) ? value.join(', ') : value;

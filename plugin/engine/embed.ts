// The optional semantic channel. Keyword search finds what shares a question's words. This finds what
// shares its meaning, which matters when the question and the library use different vocabulary: a
// question in one field's terms about an idea another field holds. It embeds principles, accounts and
// topic frames through any OpenAI-compatible /embeddings endpoint, keeps the vectors in a file under
// .knowfu/ that can be deleted at any time, and never touches the library's own files.
import fs from 'node:fs';
import path from 'node:path';
import type { Config } from './config.ts';
import { asList, asText } from './frontmatter.ts';
import { isRetired } from './library.ts';
import type { Library } from './library.ts';
import { exists, fail, readText, sha } from './util.ts';

export type Embedder = NonNullable<Config['embedder']>;
export type SemanticHit = { tier: 'principle' | 'account' | 'topic'; sim: number };
export type Semantic = { hits: Map<string, SemanticHit>; top: number; mean: number; strong: boolean };

export function embedderOf(config: Config): Embedder | null {
  const e = config.embedder;
  if (!e || !e.base_url || !e.model) return null;
  if (!/^https?:\/\//.test(e.base_url)) fail('NOT_CONFIGURED', `embedder.base_url in the config isn't a web address: ${e.base_url}`);
  return e;
}

export const embedderLabel = (e: Embedder) => `${e.model} at ${new URL(e.base_url).host}`;

function keyFor(e: Embedder): string {
  const fromFile = e.api_key_file && exists(e.api_key_file) ? readText(e.api_key_file).trim() : '';
  const key = (e.api_key_env ? process.env[e.api_key_env] : '') || fromFile;
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(new URL(e.base_url).hostname);
  if (!key && !local) fail('NOT_CONFIGURED', `The embedder's API key isn't available. Set embedder.api_key_file (a file holding only the key) or embedder.api_key_env in ~/.know-fu/config.json.`);
  return key;
}

function unit(vector: number[], dimensions?: number): Float32Array {
  const kept = dimensions ? vector.slice(0, dimensions) : vector;
  const length = Math.hypot(...kept) || 1;
  return Float32Array.from(kept, x => x / length);
}

export async function embedTexts(e: Embedder, texts: string[], options: { fetcher?: typeof fetch; timeout?: number; attempts?: number } = {}): Promise<Float32Array[]> {
  const fetcher = options.fetcher ?? fetch;
  const key = keyFor(e);
  const out: Float32Array[] = [];
  for (let start = 0; start < texts.length; start += 32) {
    const batch = texts.slice(start, start + 32).map(t => t.slice(0, 20000));
    for (let attempt = 1; ; attempt++) {
      let response: Response;
      try {
        response = await fetcher(e.base_url.replace(/\/+$/, '') + '/embeddings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) },
          body: JSON.stringify({ model: e.model, input: batch, encoding_format: 'float' }),
          signal: AbortSignal.timeout(options.timeout ?? 60000),
        });
      } catch (error: any) {
        if (attempt >= (options.attempts ?? 3)) fail('EMBEDDER_UNREACHABLE', `The embedder at ${e.base_url} didn't answer: ${error.message}`);
        await new Promise(r => setTimeout(r, 1500 * attempt));
        continue;
      }
      if (response.ok) {
        const reply: any = await response.json();
        const data: any[] = Array.isArray(reply?.data) ? reply.data : [];
        if (data.length !== batch.length || !data.every(d => Array.isArray(d?.embedding))) fail('EMBEDDER_FAILED', `The embedder returned ${data.length} embeddings for ${batch.length} texts.`);
        data.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
        for (const d of data) out.push(unit(d.embedding, e.dimensions));
        break;
      }
      const detail = (await response.text().catch(() => '')).slice(0, 300);
      if ((response.status !== 429 && response.status < 500) || attempt >= (options.attempts ?? 3))
        fail(response.status === 401 || response.status === 403 ? 'EMBEDDER_KEY_REJECTED' : 'EMBEDDER_FAILED', `The embedder answered ${response.status}: ${detail || response.statusText}`);
      await new Promise(r => setTimeout(r, 2000 * attempt));
    }
  }
  return out;
}

type Entry = { ref: string; tier: SemanticHit['tier']; text: string; hash: string };

/** What gets embedded: the compiled layer. Source pages stay with keyword search. */
function entries(lib: Library, e: Embedder): Entry[] {
  const out: Omit<Entry, 'hash'>[] = [];
  for (const topic of lib.topics) {
    out.push({ ref: topic.path, tier: 'topic', text: `${asText(topic.fm.title)}\n${asText(topic.fm.summary)}\n\n${topic.frame}` });
    for (const p of topic.principles) out.push({ ref: `${topic.path}#${p.id}`, tier: 'principle', text: `${p.title}\n${p.statement}\nWhy: ${p.why}\nBreaks when: ${p.breaks}` });
  }
  for (const account of lib.accounts) {
    if (isRetired(account)) continue;
    out.push({ ref: account.slug, tier: 'account', text: `${asText(account.fm.title)}\n${asText(account.fm.summary)}\n${asList(account.fm.keywords).join(', ')}\n\n${account.body}` });
  }
  // The hash covers the model too, so changing the model re-embeds everything instead of mixing spaces.
  return out.map(entry => ({ ...entry, hash: sha(`${e.base_url}|${e.model}|${e.dimensions ?? 'full'}|${entry.text}`) }));
}

const storeFile = (lib: Library) => path.join(lib.root, '.knowfu', 'vectors.jsonl');

function loadStore(lib: Library): Map<string, Float32Array> {
  const vectors = new Map<string, Float32Array>();
  const file = storeFile(lib);
  if (!exists(file)) return vectors;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const { h, v } = JSON.parse(line);
      const bytes = Buffer.from(v, 'base64');
      vectors.set(h, new Float32Array(bytes.buffer, bytes.byteOffset, bytes.length / 4));
    } catch {
      // A line cut short by an interrupted write is skipped and embedded again next time.
    }
  }
  return vectors;
}

/** Embeds whatever in the compiled layer has no vector yet, and drops vectors nothing uses any more. */
export async function syncVectors(lib: Library, config: Config, fetcher?: typeof fetch): Promise<{ embedded: number; total: number } | null> {
  const e = embedderOf(config);
  if (!e) return null;
  const wanted = entries(lib, e);
  const store = loadStore(lib);
  const missing = wanted.filter(entry => !store.has(entry.hash));
  if (missing.length) {
    const vectors = await embedTexts(e, missing.map(m => m.text), { fetcher });
    missing.forEach((m, i) => store.set(m.hash, vectors[i]));
  }
  const keep = new Set(wanted.map(w => w.hash));
  if (missing.length || [...store.keys()].some(h => !keep.has(h))) {
    fs.mkdirSync(path.dirname(storeFile(lib)), { recursive: true });
    const lines = wanted.map(w => JSON.stringify({ h: w.hash, v: Buffer.from(store.get(w.hash)!.buffer, store.get(w.hash)!.byteOffset, store.get(w.hash)!.byteLength).toString('base64') }));
    fs.writeFileSync(storeFile(lib), lines.join('\n') + '\n');
  }
  return { embedded: missing.length, total: wanted.length };
}

/**
 * How close each principle, account and topic is in meaning to the question. Null when no embedder is
 * configured or nothing has been embedded yet. `strong` says whether the best match is close enough to
 * trust by itself, which is what lets recall answer a question that shares no words with the library.
 */
export async function semanticSearch(lib: Library, config: Config, queries: string[], fetcher?: typeof fetch): Promise<Semantic | null> {
  const e = embedderOf(config);
  if (!e) return null;
  const store = loadStore(lib);
  const known = entries(lib, e).filter(entry => store.has(entry.hash));
  if (!known.length) return null;
  // One try, short: a question shouldn't wait on an embedder that is down. Keyword search still answers.
  const asked = await embedTexts(e, queries, { fetcher, timeout: 8000, attempts: 1 });
  const hits = new Map<string, SemanticHit>();
  let sum = 0;
  for (const entry of known) {
    const vector = store.get(entry.hash)!;
    let best = -1;
    for (const q of asked) {
      let dot = 0;
      const n = Math.min(q.length, vector.length);
      for (let i = 0; i < n; i++) dot += q[i] * vector[i];
      if (dot > best) best = dot;
    }
    hits.set(entry.ref, { tier: entry.tier, sim: best });
    sum += best;
  }
  const top = Math.max(...[...hits.values()].filter(h => h.tier !== 'topic').map(h => h.sim), 0);
  // Measured on one hosted embedding model with one topic (10 November 2026): questions the library answers
  // in other words scored 0.74 to 0.77 at best, a question from another field 0.72, a subject the library
  // lacks 0.70, unrelated questions under 0.60. Similarity separates "related" from "unrelated" well and
  // "answered" from "merely related" poorly, so the bar for trusting meaning alone is set high, and below
  // it a close match is offered as a lead, never loaded as an answer. Other models need their own bar.
  return { hits, top, mean: sum / hits.size, strong: top >= (e.min_similarity ?? 0.74) };
}

import * as fs from "node:fs/promises";
import path from "node:path";
import { STATE, KBError, ensure, hash, readJson } from "./core.js";

/**
 * Which model embeds the library for semantic search, set under `embedder` in the state
 * folder's `config.json`:
 *
 * - `local` (the default): QMD's bundled EmbeddingGemma model on this machine's CPU.
 * - `api`: any OpenAI-compatible `/embeddings` endpoint, such as OpenRouter, OpenAI, or a
 *   local Ollama or LM Studio server. The key is read from the environment variable named
 *   in `api_key_env`, never from a file the engine writes.
 * - `off`: keyword and link search only.
 */
export type EmbedderConfig =
  | { provider: "local" }
  | { provider: "off" }
  | {
      provider: "api";
      base_url: string;
      model: string;
      api_key_env: string | null;
      /** A file holding the key, for hosts that don't pass environment variables on. */
      api_key_file: string | null;
      /** Keep the first N dimensions and renormalize. Only for models trained for it. */
      dimensions: number | null;
      batch_size: number;
      max_characters: number;
      timeout_ms: number;
    };

export async function embedderConfig(): Promise<EmbedderConfig> {
  const runtime = await readJson(path.join(STATE, "config.json")).catch(
    () => ({}),
  );
  const e = runtime?.embedder ?? {};
  const provider = e.provider ?? "local";
  ensure(
    ["local", "api", "off"].includes(provider),
    "CONFIGURATION_INVALID",
    `embedder.provider in ${path.join(STATE, "config.json")} is local, api or off`,
  );
  if (provider !== "api") return { provider };
  ensure(
    typeof e.base_url === "string" &&
      /^https?:\/\//.test(e.base_url) &&
      typeof e.model === "string" &&
      e.model.trim(),
    "CONFIGURATION_INVALID",
    "An api embedder needs base_url (for example https://openrouter.ai/api/v1) and model",
  );
  const positive = (value: unknown, fallback: number) =>
    Number.isInteger(value) && (value as number) > 0
      ? (value as number)
      : fallback;
  return {
    provider: "api",
    base_url: e.base_url.replace(/\/+$/, ""),
    model: e.model.trim(),
    api_key_env:
      typeof e.api_key_env === "string" && e.api_key_env.trim()
        ? e.api_key_env.trim()
        : null,
    api_key_file:
      typeof e.api_key_file === "string" && path.isAbsolute(e.api_key_file)
        ? e.api_key_file
        : null,
    dimensions: Number.isInteger(e.dimensions) ? e.dimensions : null,
    batch_size: Math.min(positive(e.batch_size, 32), 256),
    max_characters: positive(e.max_characters, 24000),
    timeout_ms: positive(e.timeout_ms, 120000),
  };
}

/** One line naming the embedder, for receipts and status. */
export function embedderLabel(config: EmbedderConfig) {
  return config.provider === "api"
    ? `${config.model} via ${new URL(config.base_url).host}${config.dimensions ? ` (${config.dimensions} dimensions)` : ""}`
    : config.provider === "local"
      ? "EmbeddingGemma 300M via QMD on this machine"
      : "off";
}

const isLocalHost = (url: string) =>
  ["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname);

function normalize(vector: number[], dimensions: number | null) {
  const kept = dimensions ? vector.slice(0, dimensions) : vector;
  const length = Math.hypot(...kept) || 1;
  return Float32Array.from(kept, (x) => x / length);
}

/**
 * Embeds texts through an OpenAI-compatible endpoint, in order, retrying rate limits and
 * server errors with backoff. Texts are cut to `max_characters` first.
 */
export async function embedTexts(
  config: Extract<EmbedderConfig, { provider: "api" }>,
  texts: string[],
  fetcher: typeof fetch = fetch,
  options: { attempts?: number; timeout_ms?: number } = {},
): Promise<Float32Array[]> {
  const attempts = options.attempts ?? 5;
  const timeout = options.timeout_ms ?? config.timeout_ms;
  const fromFile = config.api_key_file
    ? (await fs.readFile(config.api_key_file, "utf8").catch(() => "")).trim()
    : "";
  const key =
    (config.api_key_env ? process.env[config.api_key_env] : undefined) ||
    fromFile ||
    undefined;
  ensure(
    key || isLocalHost(config.base_url),
    "EMBEDDER_KEY_MISSING",
    config.api_key_env || config.api_key_file
      ? `The embedder's API key isn't available: ${[
          config.api_key_env &&
            `the ${config.api_key_env} environment variable isn't set for the app that runs Know Fu (set it, then restart that app)`,
          config.api_key_file && `${config.api_key_file} is missing or empty`,
        ]
          .filter(Boolean)
          .join(", and ")}.`
      : "A remote embedder needs api_key_env (the name of the environment variable holding its key) or api_key_file.",
  );
  const body = JSON.stringify({
    model: config.model,
    input: texts.map((t) => t.slice(0, config.max_characters)),
    encoding_format: "float",
  });
  let wait = 2000;
  for (let attempt = 1; ; attempt++) {
    let response: Response;
    try {
      response = await fetcher(config.base_url + "/embeddings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(key ? { Authorization: `Bearer ${key}` } : {}),
        },
        body,
        signal: AbortSignal.timeout(timeout),
      });
    } catch (error: any) {
      if (attempt >= attempts)
        throw new KBError(
          "EMBEDDER_UNREACHABLE",
          `The embedder at ${config.base_url} didn't answer: ${error.message}`,
        );
      await new Promise((r) => setTimeout(r, wait));
      wait *= 2;
      continue;
    }
    if (response.ok) {
      const reply: any = await response.json();
      const data: any[] = Array.isArray(reply?.data) ? reply.data : [];
      ensure(
        data.length === texts.length &&
          data.every((d) => Array.isArray(d?.embedding)),
        "EMBEDDER_FAILED",
        `The embedder returned ${data.length} embeddings for ${texts.length} texts`,
      );
      return data
        .map((d, i) => ({ index: Number.isInteger(d.index) ? d.index : i, d }))
        .sort((a, b) => a.index - b.index)
        .map(({ d }) => normalize(d.embedding, config.dimensions));
    }
    const detail = (await response.text().catch(() => "")).slice(0, 400);
    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt >= attempts)
      throw new KBError(
        response.status === 401 || response.status === 403
          ? "EMBEDDER_KEY_REJECTED"
          : "EMBEDDER_FAILED",
        `The embedder answered ${response.status}: ${detail || response.statusText}`,
      );
    const after = Number(response.headers.get("retry-after"));
    await new Promise((r) =>
      setTimeout(r, Number.isFinite(after) && after > 0 ? after * 1000 : wait),
    );
    wait *= 2;
  }
}

/**
 * Embeddings from an API embedder, kept in the state folder and keyed by a hash of the text
 * that was embedded, so a later release re-embeds only what changed. One folder per model
 * setting, because vectors from different models can't be compared.
 */
export class VectorStore {
  private vectors?: Map<string, Float32Array>;
  readonly dir: string;
  constructor(
    index: string,
    config: Extract<EmbedderConfig, { provider: "api" }>,
    root = path.join(STATE, "cache/vectors"),
  ) {
    this.dir = path.join(
      root,
      index,
      hash(
        `${config.base_url}|${config.model}|${config.dimensions ?? "full"}`,
      ).slice(0, 16),
    );
  }
  private get file() {
    return path.join(this.dir, "vectors.jsonl");
  }
  async load() {
    if (this.vectors) return this.vectors;
    const vectors = new Map<string, Float32Array>();
    const text = await fs.readFile(this.file, "utf8").catch(() => "");
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      try {
        const { h, v } = JSON.parse(line);
        const bytes = Buffer.from(v, "base64");
        vectors.set(
          h,
          new Float32Array(bytes.buffer, bytes.byteOffset, bytes.length / 4),
        );
      } catch {
        // A line cut short by an interrupted write is skipped and re-embedded later.
      }
    }
    this.vectors = vectors;
    return vectors;
  }
  async add(entries: { hash: string; vector: Float32Array }[]) {
    await fs.mkdir(this.dir, { recursive: true });
    await fs.appendFile(
      this.file,
      entries
        .map(
          ({ hash: h, vector }) =>
            JSON.stringify({
              h,
              v: Buffer.from(
                vector.buffer,
                vector.byteOffset,
                vector.byteLength,
              ).toString("base64"),
            }) + "\n",
        )
        .join(""),
    );
    const vectors = await this.load();
    for (const { hash: h, vector } of entries) vectors.set(h, vector);
  }
  forget() {
    this.vectors = undefined;
  }
}

/** Cosine similarity of unit vectors. */
export function similarity(a: Float32Array, b: Float32Array) {
  let sum = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) sum += a[i] * b[i];
  return sum;
}

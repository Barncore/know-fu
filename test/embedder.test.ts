import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import path from "node:path";
import * as fs from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { published } from "./helpers.js";
import { Projections } from "../src/projections.js";
import { embedTexts, type EmbedderConfig } from "../src/embedder.js";
import { readJson, uid, APP } from "../src/core.js";

/**
 * A stand-in for an OpenAI-compatible /embeddings endpoint (OpenRouter's shape): each text
 * becomes a bag-of-words vector, so texts sharing words point the same way.
 */
async function mockEmbedder(
  options: { failFirst?: number; delayMs?: number } = {},
) {
  const requests: { inputs: number; auth: string | undefined }[] = [];
  let failures = options.failFirst ?? 0;
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", async () => {
      if (options.delayMs)
        await new Promise((r) => setTimeout(r, options.delayMs));
      if (failures > 0) {
        failures--;
        res.writeHead(429, { "retry-after": "0" }).end("slow down");
        return;
      }
      const { input, model } = JSON.parse(body);
      requests.push({ inputs: input.length, auth: req.headers.authorization });
      const vector = (text: string) => {
        const v = new Array(32).fill(0);
        for (const word of text.toLowerCase().match(/[a-z]+/g) ?? [])
          v[[...word].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 32, 7)] +=
            1;
        return v;
      };
      res.writeHead(200, { "content-type": "application/json" }).end(
        JSON.stringify({
          model,
          data: input.map((text: string, index: number) => ({
            index,
            embedding: vector(text),
          })),
        }),
      );
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  const config: Extract<EmbedderConfig, { provider: "api" }> = {
    provider: "api",
    base_url: `http://127.0.0.1:${port}/v1`,
    model: "mock/bag-of-words",
    api_key_env: null,
    api_key_file: null,
    dimensions: null,
    batch_size: 4,
    max_characters: 24000,
    timeout_ms: 5000,
  };
  return { server, requests, config };
}

const quietQmd = async () => ({ stdout: "", stderr: "", elapsed_ms: 0 }) as any;

test("an API embedder embeds accounts and text passages only, once, and serves semantic search", async () => {
  const mock = await mockEmbedder();
  const vectorRoot = path.join(APP, "test-output", "vectors-" + uid());
  try {
    const f = await published("embedder-api");
    const projections = new Projections(f.store, {
      embedder: mock.config,
      vectorRoot,
    });
    projections.qmd = quietQmd;
    const receipt: any = await projections.build();
    assert.equal(receipt.semantic.state, "ready");
    assert.equal(receipt.search.semantic, true);
    assert.match(
      receipt.semantic.embedder,
      /mock\/bag-of-words via 127\.0\.0\.1/,
    );
    const map = await readJson<Record<string, string>>(
      f.store.p(`views/${receipt.release_id}/semantic-map.json`),
    );
    const searchMap = await readJson<Record<string, any>>(
      f.store.p(`views/${receipt.release_id}/search-map.json`),
    );
    // Relationships and summary documents stay out of the embedded set.
    for (const file of Object.keys(map)) {
      assert(!file.split("/")[0].endsWith("x"), file);
      assert.notEqual(searchMap[file].level, "summary");
    }
    assert(
      Object.keys(searchMap).some((file) => file.split("/")[0].endsWith("x")),
      "keyword-only documents still exist",
    );
    const embeddedTexts = mock.requests.reduce((n, r) => n + r.inputs, 0);
    assert.equal(embeddedTexts, new Set(Object.values(map)).size);
    assert(
      mock.requests.every((r) => r.inputs <= 4),
      "batches respect batch_size",
    );

    // A second reindex finds every vector already stored and asks for nothing.
    const before = mock.requests.length;
    await projections.build();
    assert.equal(mock.requests.length, before);

    const module = (await f.store.config()).modules[0].module_id;
    const hits = await projections.search(
      "lantern room valve",
      [module],
      true,
      5,
    );
    assert(hits.items.length > 0);
    assert(hits.items.every((h) => h.file in map));
    assert(hits.items[0].score >= hits.items.at(-1)!.score);
  } finally {
    mock.server.close();
    await fs.rm(vectorRoot, { recursive: true, force: true });
  }
});

test("background reindex returns before embedding finishes and records progress", async () => {
  const mock = await mockEmbedder();
  const vectorRoot = path.join(APP, "test-output", "vectors-" + uid());
  try {
    const f = await published("embedder-background");
    const projections = new Projections(f.store, {
      embedder: mock.config,
      vectorRoot,
      background: true,
    });
    projections.qmd = quietQmd;
    const returned: any = await projections.build();
    assert.equal(
      returned.search.state,
      "ready",
      "keyword search is ready at once",
    );
    assert.notEqual(returned.semantic.state, "off");
    await projections.settled();
    const done: any = await projections.receipt();
    assert.equal(done.semantic.state, "ready");
    assert.equal(done.semantic.embedded, done.semantic.documents);
    assert.equal(done.search.semantic, true);
  } finally {
    mock.server.close();
    await fs.rm(vectorRoot, { recursive: true, force: true });
  }
});

test("the API client retries a rate limit, and a missing key names the variable to set", async () => {
  const mock = await mockEmbedder({ failFirst: 1 });
  try {
    const vectors = await embedTexts(mock.config, ["one text", "two texts"]);
    assert.equal(vectors.length, 2);
    assert(Math.abs(Math.hypot(...vectors[0]) - 1) < 1e-6, "unit length");
    await assert.rejects(
      embedTexts(
        {
          ...mock.config,
          base_url: "https://embedder.invalid/v1",
          api_key_env: "KB_TEST_UNSET_KEY_" + uid().replace(/-/g, ""),
        },
        ["text"],
      ),
      { code: "EMBEDDER_KEY_MISSING", message: /KB_TEST_UNSET_KEY_/ },
    );
  } finally {
    mock.server.close();
  }
});

test("the local embedder runs QMD in five-minute slices on the embedded collection until nothing is left", async () => {
  const f = await published("embedder-local");
  const calls: string[][] = [];
  let slices = 0;
  const projections = new Projections(f.store, {
    embedder: { provider: "local" },
  });
  projections.qmd = async (args: string[]) => {
    calls.push(args);
    if (args[0] === "embed")
      return {
        stdout:
          ++slices < 3
            ? "\u001b[32m✓ Done!\u001b[0m Embedded 4 chunks from 3 documents in 5m"
            : "✓ All content hashes already have embeddings.",
        stderr: "",
        elapsed_ms: 0,
      } as any;
    return { stdout: "Vectors: 8 embedded", stderr: "", elapsed_ms: 0 } as any;
  };
  const receipt: any = await projections.build();
  assert.equal(receipt.semantic.state, "ready");
  const embeds = calls.filter((c) => c[0] === "embed");
  assert.equal(embeds.length, 3);
  for (const call of embeds) {
    const collection = call[call.indexOf("-c") + 1];
    assert.match(collection, /^m[0-9a-f]{16}$/, "only the embedded collection");
    assert.equal(call[call.indexOf("--timeout") + 1], "5");
  }
});

test("the setup scripts write an embedder setting that names the key's variable, never the key", async () => {
  const { embedderSetting } = await import("../scripts/configure-embedder.mjs");
  assert.deepEqual(embedderSetting({}), { provider: "local" });
  assert.deepEqual(embedderSetting({ embedder: "off" }), { provider: "off" });
  assert.deepEqual(
    embedderSetting({
      embedder: "api",
      url: "https://openrouter.ai/api/v1/",
      model: "example/embedding-model",
      "key-env": "OPENROUTER_API_KEY",
    }),
    {
      provider: "api",
      base_url: "https://openrouter.ai/api/v1",
      model: "example/embedding-model",
      api_key_env: "OPENROUTER_API_KEY",
    },
  );
  // A local server needs no key; a remote one does, and a pasted key is refused.
  assert.equal(
    embedderSetting({
      embedder: "api",
      url: "http://localhost:11434/v1",
      model: "nomic-embed-text",
    }).api_key_env,
    undefined,
  );
  assert.throws(
    () =>
      embedderSetting({
        embedder: "api",
        url: "https://openrouter.ai/api/v1",
        model: "example/embedding-model",
      }),
    /--key-env/,
  );
  assert.throws(
    () =>
      embedderSetting({
        embedder: "api",
        url: "https://openrouter.ai/api/v1",
        model: "example/embedding-model",
        "key-env": "sk-or-v1-abc123",
      }),
    /environment variable name/,
  );
  assert.equal(
    embedderSetting({
      embedder: "api",
      url: "https://openrouter.ai/api/v1",
      model: "example/embedding-model",
      "key-file": "C:/Users/someone/.know-fu/openrouter.key",
    }).api_key_file,
    "C:/Users/someone/.know-fu/openrouter.key",
  );
});

test("stopping an embedding (as a purge does) halts it before it writes more vectors", async () => {
  const mock = await mockEmbedder({ delayMs: 60 });
  const vectorRoot = path.join(APP, "test-output", "vectors-" + uid());
  try {
    const f = await published("embedder-stop");
    const projections = new Projections(f.store, {
      embedder: { ...mock.config, batch_size: 1 },
      vectorRoot,
      background: true,
    });
    projections.qmd = quietQmd;
    await projections.build();
    await new Promise((r) => setTimeout(r, 150));
    await projections.stopEmbedding("Stopped by a purge in the test");
    const receipt: any = await projections.receipt();
    assert.equal(receipt.semantic.state, "stopped");
    const requestsAtStop = mock.requests.length;
    await projections.settled();
    await new Promise((r) => setTimeout(r, 200));
    assert(
      mock.requests.length <= requestsAtStop + 1,
      "at most the batch in flight",
    );
    assert.equal((await projections.receipt()).semantic.state, "stopped");
  } finally {
    mock.server.close();
    await fs.rm(vectorRoot, { recursive: true, force: true });
  }
});

test("a run whose engine has gone reads as interrupted", async () => {
  const f = await published("embedder-interrupted");
  const projections = new Projections(f.store, {
    embedder: { provider: "off" },
  });
  await fs.mkdir(f.store.p("views"), { recursive: true });
  await fs.writeFile(
    f.store.p("views/receipt.json"),
    JSON.stringify({
      release_id: "r",
      semantic: { state: "running", pid: 2147483646 },
    }),
  );
  const receipt: any = await projections.receipt();
  assert.equal(receipt.semantic.state, "interrupted");
  assert.match(receipt.semantic.next, /reindex/);
});

test("a question's embedding fails fast when the embedder can't be reached", async () => {
  const mock = await mockEmbedder();
  const port = Number(new URL(mock.config.base_url).port);
  mock.server.close();
  await new Promise((r) => setTimeout(r, 50));
  const started = performance.now();
  await assert.rejects(
    embedTexts(
      { ...mock.config, base_url: `http://127.0.0.1:${port}/v1` },
      ["q"],
      fetch,
      {
        attempts: 1,
        timeout_ms: 2000,
      },
    ),
    { code: "EMBEDDER_UNREACHABLE" },
  );
  assert(performance.now() - started < 3000);
});

test("the key can come from a file, for hosts that don't pass environment variables on", async () => {
  const mock = await mockEmbedder();
  const keyFile = path.join(APP, "test-output", "key-" + uid() + ".txt");
  try {
    await fs.mkdir(path.dirname(keyFile), { recursive: true });
    await fs.writeFile(keyFile, "file-held-key\n");
    await embedTexts(
      {
        ...mock.config,

        api_key_file: keyFile,
      },
      ["text"],
    );
    assert.equal(mock.requests.at(-1)?.auth, "Bearer file-held-key");
  } finally {
    mock.server.close();
    await fs.rm(keyFile, { force: true });
  }
});

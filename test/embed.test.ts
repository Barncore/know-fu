// The optional semantic channel, against a stand-in embedder that maps a few concepts to dimensions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { checkLibrary } from '../plugin/engine/check.ts';
import { runTool } from '../plugin/engine/tools.ts';
import { builtLibrary } from './helpers.ts';

// Words that mean the same thing share a dimension, so "waiting at peak to level the chamber" lands near "hold" and "even".
const CONCEPTS = [
  ['hold', 'soak', 'waiting', 'wait', 'pause'],
  ['even', 'evens', 'level', 'equalize', 'uneven', 'unevenness'],
  ['reduction', 'reducing', 'starving', 'starved', 'oxygen', 'colour', 'copper', 'smoky', 'atmosphere'],
  ['ash', 'runs', 'surface', 'character'],
  ['firebox', 'chimney', 'chamber', 'front', 'back'],
  ['spreadsheet', 'invoice', 'tax'],
];

function vectorFor(text: string): number[] {
  const words = text.toLowerCase().split(/[^a-z]+/);
  const v = CONCEPTS.map(group => words.filter(w => group.includes(w)).length);
  // A small constant keeps every vector non-zero, like the baseline similarity real models show between any two texts.
  return [...v.map(x => Math.min(x, 3)), 0.3];
}

function standIn(counter: { calls: number; texts: number }, fail = false) {
  return (async (_url: any, init: any) => {
    if (fail) return new Response('down for maintenance', { status: 503 });
    const body = JSON.parse(init.body);
    counter.calls++;
    counter.texts += body.input.length;
    assert.equal(init.headers.Authorization, 'Bearer not-a-real-key');
    return new Response(JSON.stringify({ data: body.input.map((t: string, index: number) => ({ index, embedding: vectorFor(t) })) }), { status: 200 });
  }) as typeof fetch;
}

async function withEmbedder(work: (fx: Awaited<ReturnType<typeof builtLibrary>>, counter: { calls: number; texts: number }) => Promise<void>) {
  const fx = await builtLibrary();
  const real = globalThis.fetch;
  const counter = { calls: 0, texts: 0 };
  try {
    const key = path.join(fx.dir, 'key.txt');
    fs.writeFileSync(key, 'not-a-real-key');
    const config = JSON.parse(fs.readFileSync(fx.config, 'utf8'));
    fs.writeFileSync(fx.config, JSON.stringify({ ...config, embedder: { base_url: 'https://embed.invalid/v1', model: 'stand-in', api_key_file: key, min_similarity: 0.5 } }));
    globalThis.fetch = standIn(counter);
    await work(fx, counter);
  } finally {
    globalThis.fetch = real;
    fx.cleanup();
  }
}

test('a check embeds the compiled layer once, and again only for what changed', async () => {
  await withEmbedder(async (fx, counter) => {
    const first = (await runTool('kf_check', {})).text;
    // 2 principles, 3 accounts, 1 topic frame. Source pages are left to keyword search.
    assert.match(first, /semantic search: 6 principles, accounts and topics embedded \(6 new or changed\)/);
    assert.equal(counter.texts, 6);
    const second = (await runTool('kf_check', {})).text;
    assert.match(second, /semantic search: 6 principles, accounts and topics embedded\n|embedded$/);
    assert.equal(counter.texts, 6, 'nothing is sent twice');
    const file = path.join(fx.root, 'knowledge/ceramics/wood-firing/accounts/body-reduction-window.md');
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('Reduction has a price in temperature.', 'Reduction costs temperature.'));
    assert.match((await runTool('kf_check', {})).text, /\(1 new or changed\)/);
    assert.equal(counter.texts, 7);
    assert.match((await runTool('kf_status', {})).text, /semantic search: stand-in at embed\.invalid/);
  });
});

test('a question in other words is answered by meaning, and says so', async () => {
  await withEmbedder(async fx => {
    await runTool('kf_check', {});
    // None of the question's distinctive words are in the library; its meaning is the hold account's.
    const question = 'pause at the top so the temperature can equalize';
    const config = JSON.parse(fs.readFileSync(fx.config, 'utf8'));
    const { embedder, ...plain } = config;
    fs.writeFileSync(fx.config, JSON.stringify(plain));
    assert.match((await runTool('kf_recall', { query: question })).text, /Nothing in the compiled library clearly answers this/);
    fs.writeFileSync(fx.config, JSON.stringify(config));
    const found = (await runTool('kf_recall', { query: question })).text;
    assert.match(found, /matched by meaning/);
    assert.match(found, /### Hold (forty minutes once cone 9 bends|at cone 9, or stop stoking when it falls)/);
    assert.match(found, /Ranked by words and by meaning/);
  });
});

test('a near match in meaning that is not close enough is offered as a lead, never loaded as an answer', async () => {
  await withEmbedder(async fx => {
    await runTool('kf_check', {});
    const config = JSON.parse(fs.readFileSync(fx.config, 'utf8'));
    fs.writeFileSync(fx.config, JSON.stringify({ ...config, embedder: { ...config.embedder, min_similarity: 0.999 } }));
    const lead = (await runTool('kf_recall', { query: 'pause at the top so the temperature can equalize' })).text;
    assert.match(lead, /Nothing in the compiled library clearly answers this/);
    assert.match(lead, /## Closest in meaning \(a lead to follow, not an answer\)[\s\S]*hold-at-cone-9/);
    assert.doesNotMatch(lead, /## Accounts\n/);
  });
});

test('recall still answers by keyword when the embedder is down, and says the ranking is words only', async () => {
  await withEmbedder(async () => {
    await runTool('kf_check', {});
    globalThis.fetch = standIn({ calls: 0, texts: 0 }, true);
    const text = (await runTool('kf_recall', { query: 'forty minute hold at cone 9' })).text;
    assert.match(text, /### Hold forty minutes once cone 9 bends/);
    assert.match(text, /Semantic search was unavailable for this call/);
    // A check with the embedder down still checks and reports; it doesn't fail.
    const file = (await runTool('kf_check', {})).text;
    assert.match(file, /No errors\./);
  });
});

test('with no embedder configured nothing is sent anywhere', async () => {
  const fx = await builtLibrary();
  const real = globalThis.fetch;
  try {
    globalThis.fetch = (async () => {
      throw new Error('the engine made a network call with no embedder configured');
    }) as typeof fetch;
    checkLibrary(fx.root, { fix: true });
    assert.doesNotMatch((await runTool('kf_check', {})).text, /semantic search/);
    assert.match((await runTool('kf_recall', { query: 'forty minute hold at cone 9' })).text, /### Hold forty minutes/);
    assert.match((await runTool('kf_status', {})).text, /semantic search: off/);
  } finally {
    globalThis.fetch = real;
    fx.cleanup();
  }
});

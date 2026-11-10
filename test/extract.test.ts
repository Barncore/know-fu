// Extraction: PDFs through Poppler, timestamped transcripts, recordings through a stand-in transcription API.
// Tests that need Poppler or FFmpeg skip where the tool isn't installed, and say so.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadConfig } from '../plugin/engine/config.ts';
import { findPoppler, findTool, timeUnits } from '../plugin/engine/extract.ts';
import { parseFrontmatter } from '../plugin/engine/frontmatter.ts';
import { loadLibrary, resolveLoc } from '../plugin/engine/library.ts';
import { addSource } from '../plugin/engine/sources.ts';
import { runTool } from '../plugin/engine/tools.ts';
import { freshLibrary, PLUGIN, write } from './helpers.ts';

/** A minimal PDF with one line of text per page, built by hand so the tests need no PDF library. */
function tinyPdf(pages: string[]): Buffer {
  const objects: string[] = [];
  const kids = pages.map((_, i) => `${4 + i * 2} 0 R`).join(' ');
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[2] = `<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`;
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  pages.forEach((text, i) => {
    const stream = `BT /F1 12 Tf 72 720 Td (${text.replace(/[()\\]/g, '\\$&')}) Tj ET`;
    objects[4 + i * 2] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${5 + i * 2} 0 R /Resources << /Font << /F1 3 0 R >> >> >>`;
    objects[5 + i * 2] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  });
  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  for (let n = 1; n < objects.length; n++) {
    offsets[n] = out.length;
    out += `${n} 0 obj\n${objects[n]}\nendobj\n`;
  }
  const xref = out.length;
  out += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let n = 1; n < objects.length; n++) out += `${String(offsets[n]).padStart(10, '0')} 00000 n \n`;
  out += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}

const has = (find: () => string) => {
  try {
    find();
    return true;
  } catch {
    return false;
  }
};

test('a PDF becomes one unit per page, with page images on request', async t => {
  const fx = freshLibrary();
  try {
    if (!has(() => findPoppler(loadConfig()))) return t.skip("Poppler isn't installed");
    const pdf = path.join(fx.dir, 'paper.pdf');
    fs.writeFileSync(pdf, tinyPdf(['Thirty trades per free parameter is the floor for reading a backtest.', 'Figure 2.1 Edge against parameter value.', 'Neighbours within ten percent must keep half the edge.']));
    const added = await addSource(loadConfig(), { file: pdf, title: 'A paper on backtests', key: 'PBT', kind: 'paper' });
    assert.equal(added.units, 3);
    assert.equal(added.unit_kind, 'page');
    const source = loadLibrary(fx.root).sources[0];
    assert.deepEqual(resolveLoc(source, 'p.2-3'), [1, 2]);
    assert.ok(source.units[1].flags.includes('figure'), 'a caption at the start of a line flags the page');
    assert.ok(!source.units[0].flags.includes('figure'));
    assert.match((await runTool('kf_read', { ref: 'PBT', loc: 'p.3' })).text, /Neighbours within ten percent/);
    const image = await runTool('kf_read', { ref: 'PBT', loc: 'p.2', view: 'image' });
    assert.ok(image.image && fs.statSync(image.image).size > 500, 'a PNG was rendered');
    assert.match((await runTool('kf_read', { ref: 'PBT', loc: 'p.1', view: 'layout' })).text, /Thirty trades/);
    // A quote is checked against the page it cites, with one page of slack either side and no more.
    const account = (page: number) =>
      `---\ntype: account\nkind: reference\ntitle: Trades per parameter\nsummary: Thirty trades per free parameter.\nprinciples: []\nsources: [PBT]\nbasis: source\nupdated: 2026-11-10\n---\nThe floor is stated outright: "Thirty trades per free parameter is the floor" [PBT p.${page}].\n`;
    write(fx.root, 'knowledge/trading/DOMAIN.md', '---\ntype: domain\ntitle: Trading\nsummary: Markets.\n---\n# Trading\n');
    write(fx.root, 'knowledge/trading/backtesting/TOPIC.md', '---\ntype: topic\ntitle: Backtesting\nsummary: Testing strategies on history.\nupdated: 2026-11-10\n---\n# Backtesting\n\n## Frame\n\nA backtest is evidence only as far as its sample allows.\n\n## Principles\n');
    const file = write(fx.root, 'knowledge/trading/backtesting/accounts/trades-per-parameter.md', account(1));
    const errors = async () => (await runTool('kf_check', { warnings: false })).text;
    assert.doesNotMatch(await errors(), /\[quote\]/);
    fs.writeFileSync(file, account(2));
    assert.doesNotMatch(await errors(), /\[quote\]/);
    fs.writeFileSync(file, account(3));
    assert.match(await errors(), /\[quote\]/);
  } finally {
    fx.cleanup();
  }
});

test('a timestamped transcript keeps its timestamps; plain text splits into sections', async () => {
  const fx = freshLibrary();
  try {
    const lines = Array.from({ length: 24 }, (_, i) => `[${Math.floor((i * 20) / 60)}:${String((i * 20) % 60).padStart(2, '0')}] Line number ${i} of the talk about stops and targets.`);
    const transcript = write(fx.dir, 'talk.txt', lines.join('\n') + '\n');
    const added = await addSource(loadConfig(), { file: transcript, title: 'Stops talk', key: 'STP' });
    assert.equal(added.unit_kind, 'time');
    const source = loadLibrary(fx.root).sources[0];
    assert.equal(source.units[0].n, 0);
    assert.deepEqual(resolveLoc(source, '7:40'), [source.units.length - 1, source.units.length - 1]);
    assert.match((await runTool('kf_read', { ref: 'STP', loc: '2:00-3:00' })).text, /\[2:00\] Line number 6/);
    const prose = write(fx.dir, 'essay.txt', Array.from({ length: 40 }, (_, i) => `Paragraph ${i}. ` + 'word '.repeat(60)).join('\n\n'));
    const essay = await addSource(loadConfig(), { file: prose, title: 'An essay', key: 'ESY' });
    assert.equal(essay.unit_kind, 'section');
    assert.ok(essay.units >= 2 && essay.units <= 4, `${essay.units} sections of roughly 900 words`);
    await assert.rejects(addSource(loadConfig(), { file: write(fx.dir, 'data.xyz', 'x') }), /can't read \.xyz/);
  } finally {
    fx.cleanup();
  }
});

test('captions that repeat as they scroll are kept once, and units meet end to start', () => {
  const cues = [
    { start: 0, end: 4, text: 'welcome back' },
    { start: 4, end: 8, text: 'welcome back' },
    { start: 8, end: 100, text: 'today we cover risk' },
    { start: 130, end: 200, text: 'position size comes first' },
  ];
  const out = timeUnits(cues, 'test');
  assert.equal(out.units.length, 2);
  assert.equal(out.units[0].end, out.units[1].n);
  assert.equal((out.texts[0].match(/welcome back/g) ?? []).length, 1);
});

test('a recording is transcribed only after the owner approves the cost, and never paid for twice', async t => {
  const fx = freshLibrary();
  try {
    if (!has(() => findTool(loadConfig(), 'ffmpeg')) || !has(() => findTool(loadConfig(), 'ffprobe'))) return t.skip("FFmpeg isn't installed");
    const audio = path.join(fx.dir, 'lesson.wav');
    const made = spawnSync(findTool(loadConfig(), 'ffmpeg'), ['-nostdin', '-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=6', audio], { stdio: 'ignore' });
    if (made.status !== 0) return t.skip("this FFmpeg can't synthesize a test tone");
    const raw = JSON.parse(fs.readFileSync(fx.config, 'utf8'));
    fs.writeFileSync(fx.config, JSON.stringify({ ...raw, transcription: { endpoint: 'https://transcribe.invalid/v1/audio/transcriptions', model: 'test-model', api_key_file: write(fx.dir, 'key.txt', 'not-a-real-key'), cost_per_minute: 0.6 } }));
    let calls = 0;
    const fetcher = (async (_url: any, init: any) => {
      calls++;
      assert.equal(init.headers.Authorization, 'Bearer not-a-real-key');
      return new Response(JSON.stringify({ text: 'Risk first. Then size.', segments: [{ start: 0, end: 3, text: 'Risk first.' }, { start: 3, end: 6, text: 'Then size.' }] }), { status: 200 });
    }) as typeof fetch;
    // Six seconds at 0.60 a minute is 0.06. Without approval, nothing is sent.
    await assert.rejects(addSource(loadConfig(), { file: audio, title: 'Lesson', key: 'LSN', fetcher }), /estimated at 0\.06 USD[\s\S]*max_cost/);
    await assert.rejects(addSource(loadConfig(), { file: audio, title: 'Lesson', key: 'LSN', fetcher, max_cost: 0.01 }), /estimated at 0\.06 USD/);
    assert.equal(calls, 0);
    const added = await addSource(loadConfig(), { file: audio, title: 'Lesson', key: 'LSN', fetcher, max_cost: 0.1 });
    assert.equal(calls, 1);
    assert.equal(added.unit_kind, 'time');
    assert.match((await runTool('kf_read', { ref: 'LSN', loc: '0:00' })).text, /\[0:00\] Risk first\. Then size\./);
    // Adding it again under another name reuses the saved transcription for the same audio.
    fs.rmSync(path.join(fx.root, 'sources', 'lesson'), { recursive: true });
    await addSource(loadConfig(), { file: audio, title: 'Lesson', key: 'LSN', fetcher, max_cost: 0.1 });
    assert.equal(calls, 1, 'the saved chunk was reused');
  } finally {
    fx.cleanup();
  }
});

test("the format guide's own examples parse", () => {
  const guide = fs.readFileSync(path.join(PLUGIN, 'skills', 'know-fu', 'references', 'format.md'), 'utf8');
  const blocks = [...guide.matchAll(/```markdown\n([\s\S]*?)```/g)].map(m => m[1]);
  assert.ok(blocks.length >= 3, 'topic, account and idea examples');
  for (const block of blocks) {
    const parsed = parseFrontmatter(block);
    assert.deepEqual(parsed.errors, []);
    assert.ok(['topic', 'account', 'idea'].includes(String(parsed.fm.type)));
  }
});

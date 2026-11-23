// Extraction: PDFs through Poppler, timestamped transcripts, recordings through a stand-in transcription API.
// Tests that need Poppler or FFmpeg skip where the tool isn't installed, and say so.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadConfig } from '../plugin/engine/config.ts';
import { captionCues, chunkPlan, cuesFromWords, findPoppler, findTesseract, findTool, keyTerms, timeUnits } from '../plugin/engine/extract.ts';
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
    const note = (page: number) =>
      `---\ntype: note\nkind: reference\ntitle: Trades per parameter\nsummary: Thirty trades per free parameter.\nprinciples: []\nsources: [PBT]\nbasis: source\nupdated: 2026-11-10\n---\nThe floor is stated outright: "Thirty trades per free parameter is the floor" [PBT p.${page}].\n`;
    write(fx.root, 'knowledge/trading/DOMAIN.md', '---\ntype: domain\ntitle: Trading\nsummary: Markets.\n---\n# Trading\n');
    write(fx.root, 'knowledge/trading/backtesting/TOPIC.md', '---\ntype: topic\ntitle: Backtesting\nsummary: Testing strategies on history.\nupdated: 2026-11-10\n---\n# Backtesting\n\n## Frame\n\nA backtest is evidence only as far as its sample allows.\n\n## Principles\n');
    const file = write(fx.root, 'knowledge/trading/backtesting/notes/trades-per-parameter.md', note(1));
    const errors = async () => (await runTool('kf_check', { warnings: false })).text;
    assert.doesNotMatch(await errors(), /\[quote\]/);
    fs.writeFileSync(file, note(2));
    assert.doesNotMatch(await errors(), /\[quote\]/);
    fs.writeFileSync(file, note(3));
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
  // Automatic captions scroll: each line is shown again in the next cue as it moves up.
  const rolling = [
    'WEBVTT',
    '00:00:00.160 --> 00:00:02.389 align:start position:0%\n \nif<00:00:00.320><c> you have</c><00:00:00.480><c> clicked</c>',
    '00:00:02.389 --> 00:00:02.399 align:start position:0%\nif you have clicked\n ',
    '00:00:02.399 --> 00:00:04.230 align:start position:0%\nif you have clicked\nyou<00:00:02.800><c> are probably</c><00:00:03.100><c> struggling</c>',
    '00:00:04.230 --> 00:00:04.240 align:start position:0%\nyou are probably struggling\n ',
  ].join('\n\n');
  assert.deepEqual(
    captionCues(rolling).map(c => [c.start, c.text]),
    [
      [0.16, 'if you have clicked'],
      [2.399, 'you are probably struggling'],
    ],
  );
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

test('padded chunks share no core, and sentences are cut from word timestamps', () => {
  const plan = chunkPlan(700);
  assert.deepEqual(
    plan.map(c => [c.coreStart, c.coreEnd, c.start, c.end]),
    [
      [0, 300, 0, 308],
      [300, 600, 292, 608],
      [600, 700, 592, 700],
    ],
  );
  const word = (text: string, start: number, end = start + 0.3) => ({ text, start, end });
  const cues = cuesFromWords([
    word('Okay.', 0),
    word('So', 0.5),
    word('this', 0.9),
    word('is', 1.2),
    word('the', 1.5),
    word('swing', 1.8),
    word('low.', 2.1),
    word('Price', 2.6),
    word('swept', 3),
    word('it', 3.4),
    word('here', 3.8),
    // A pause with no full stop still ends the line.
    word('and', 6),
    word('reversed', 6.4),
  ]);
  assert.deepEqual(
    cues.map(c => [c.start, c.text]),
    [
      [0, 'Okay. So this is the swing low.'],
      [2.6, 'Price swept it here'],
      [6, 'and reversed'],
    ],
  );
  assert.deepEqual(keyTerms([' BOS ', 'bos', '', 'break  of structure', 'x'.repeat(61)]), ['BOS', 'break of structure']);
});

test('a recording is sent in padded chunks with key terms, and each sentence keeps the time it was spoken', async t => {
  const fx = freshLibrary();
  try {
    if (!has(() => findTool(loadConfig(), 'ffmpeg')) || !has(() => findTool(loadConfig(), 'ffprobe'))) return t.skip("FFmpeg isn't installed");
    const audio = path.join(fx.dir, 'lesson.wav');
    const made = spawnSync(findTool(loadConfig(), 'ffmpeg'), ['-nostdin', '-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=320', '-ar', '8000', audio], { stdio: 'ignore' });
    if (made.status !== 0) return t.skip("this FFmpeg can't synthesize a test tone");
    const raw = JSON.parse(fs.readFileSync(fx.config, 'utf8'));
    fs.writeFileSync(fx.config, JSON.stringify({ ...raw, transcription: { endpoint: 'https://transcribe.invalid/v1/audio/transcriptions', model: 'vendor/words-model', api_key_file: write(fx.dir, 'key.txt', 'not-a-real-key'), cost_per_minute: 0.06 } }));
    write(fx.root, 'knowledge/trading/DOMAIN.md', '---\ntype: domain\ntitle: Trading\nsummary: Markets.\n---\n# Trading\n');
    write(
      fx.root,
      'knowledge/trading/structure/TOPIC.md',
      '---\ntype: topic\ntitle: Market structure\nsummary: Reading swings.\nkeywords: [swing low]\nupdated: 2026-11-23\n---\n# Market structure\n\n## Frame\n\nStructure is the sequence of swings.\n\n## Principles\n\n## Vocabulary\n\n- **BOS:** a break of structure.\n- **Sell-side liquidity:** resting orders under a low.\n',
    );
    // What the stand-in model "hears", in the recording's own time. Each request gets the words inside what it was sent.
    const spoken: [number, string][] = [
      [1, 'First'],
      [1.4, 'we'],
      [1.8, 'mark'],
      [2.2, 'the'],
      [2.6, 'BOS.'],
      [296, 'Sell-side'],
      [296.6, 'liquidity'],
      [297.2, 'sits'],
      [297.8, 'below.'],
      [304, 'Then'],
      [304.4, 'price'],
      [304.8, 'sweeps'],
      [305.2, 'it.'],
    ];
    const requests: { terms: string[]; grains: string[] }[] = [];
    let refuseTerms = false;
    const fetcher = (async (_url: any, init: any) => {
      const form = init.body as FormData;
      const terms = form.getAll('keyterms[]').map(String);
      requests.push({ terms, grains: form.getAll('timestamp_granularities[]').map(String) });
      if (refuseTerms && terms.length) return new Response('{"error":"keyterms are not supported"}', { status: 400 });
      // The first request starts at 0 and the second at 292 seconds: tell them apart by the file's name.
      const second = /c001/.test((form.get('file') as File).name);
      const [from, to] = second ? [292, 320] : [0, 308];
      const words = spoken.filter(([at]) => at >= from && at < to).map(([at, word]) => ({ word, start: at - from, end: at - from + 0.3 }));
      return new Response(JSON.stringify({ text: words.map(w => w.word).join(' '), segments: [{ start: 0, end: to - from, text: 'everything' }], words }), { status: 200 });
    }) as typeof fetch;
    await assert.rejects(addSource(loadConfig(), { file: audio, title: 'Structure lesson', key: 'STR', fetcher, topic: 'trading/nowhere', max_cost: 1 }), /No topic "trading\/nowhere"/);
    const added = await addSource(loadConfig(), { file: audio, title: 'Structure lesson', key: 'STR', fetcher, topic: 'trading/structure', terms: ['Ilo Carrow'], max_cost: 1 });
    assert.equal(requests.length, 2, 'two padded chunks');
    assert.deepEqual(requests[0].terms, ['Ilo Carrow', 'BOS', 'Sell-side liquidity', 'swing low'], "the caller's terms, then the topic's vocabulary and keywords");
    assert.deepEqual(requests[0].grains, ['word', 'segment']);
    const text = fs.readFileSync(added.text_file, 'utf8');
    assert.match(text, /\[0:01\] First we mark the BOS\./);
    // Both chunks heard the sentence at 4:56, inside the padding of one and the core of the other. It is kept once.
    assert.equal((text.match(/Sell-side liquidity sits below\./g) ?? []).length, 1);
    assert.match(text, /\[4:56\] Sell-side liquidity sits below\./);
    assert.match(text, /\[5:04\] Then price sweeps it\./);
    assert.ok(added.notes.some(n => /4 key terms were sent/.test(n)));
    // A model that refuses key terms still transcribes, and the report says so.
    fs.rmSync(path.join(fx.root, 'sources', 'structure-lesson'), { recursive: true });
    fs.rmSync(path.join(fx.root, '.knowfu', 'transcribe'), { recursive: true, force: true });
    refuseTerms = true;
    const again = await addSource(loadConfig(), { file: audio, title: 'Structure lesson', key: 'STR', fetcher, terms: ['Ilo Carrow'], max_cost: 1 });
    assert.ok(again.notes.some(n => /refused key terms/.test(n)));
    assert.match(fs.readFileSync(again.text_file, 'utf8'), /First we mark the BOS\./);
  } finally {
    fx.cleanup();
  }
});

test("a video's screen is mapped into filmstrips, served by sentence, cropped, kept, and checked against what the digest says was opened", async t => {
  const fx = freshLibrary();
  try {
    if (!has(() => findTool(loadConfig(), 'ffmpeg')) || !has(() => findTool(loadConfig(), 'ffprobe'))) return t.skip("FFmpeg isn't installed");
    // Three still pictures of twelve seconds each: a box that sits in a different place in each. A small box
    // jitters in the corner the whole time, the way a webcam does.
    const video = path.join(fx.dir, 'lesson.mp4');
    const still = (x: number) => `color=c=white:s=640x360:r=10:d=12,drawbox=x=${x}:y=120:w=120:h=90:color=black:t=fill`;
    const graph = `${still(60)}[a];${still(260)}[b];${still(460)}[c];[a][b][c]concat=n=3:v=1:a=0[base];color=c=red:s=40x40:r=10:d=36[r];[base][r]overlay=x='560+10*mod(n\\,5)':y=10[v]`;
    const made = spawnSync(findTool(loadConfig(), 'ffmpeg'), ['-nostdin', '-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=36', '-filter_complex', graph, '-map', '[v]', '-map', '0:a', '-pix_fmt', 'yuv420p', '-shortest', video], { stdio: 'ignore' });
    if (made.status !== 0) return t.skip("this FFmpeg can't synthesize a test video");
    const raw = JSON.parse(fs.readFileSync(fx.config, 'utf8'));
    fs.writeFileSync(fx.config, JSON.stringify({ ...raw, transcription: { endpoint: 'https://transcribe.invalid/v1/audio/transcriptions', model: 'vendor/words-model', api_key_file: write(fx.dir, 'key.txt', 'not-a-real-key'), cost_per_minute: 0.06 } }));
    const say = (at: number, text: string) => text.split(' ').map((word, i) => ({ word, start: at + i * 0.3, end: at + i * 0.3 + 0.25 }));
    const words = [...say(2, 'The box starts on the left.'), ...say(10, 'Now watch it move over here.'), ...say(15, 'It stays in the middle now.'), ...say(30, 'And it ends on the right.')];
    const fetcher = (async () => new Response(JSON.stringify({ text: words.map(w => w.word).join(' '), segments: [], words }), { status: 200 })) as typeof fetch;
    const added = await addSource(loadConfig(), { file: video, title: 'Box lesson', key: 'BOX', fetcher, max_cost: 1 });
    assert.equal(added.frames, 3, 'one candidate for each still picture, and none for the jitter');
    assert.equal(added.sheets, 1);
    const strip = await runTool('kf_read', { ref: 'BOX', view: 'filmstrip', loc: '1' });
    assert.ok(strip.image && fs.statSync(strip.image).size > 2000, 'a filmstrip sheet was built');
    assert.match(strip.text, /0:0\d  0:1\d  0:2\d/);
    // The sentence at 0:10 is spoken across the change at 0:12, so it gets the picture before and after.
    const moved = await runTool('kf_read', { ref: 'BOX', view: 'screen', loc: '0:10' });
    assert.match(moved.text, /"Now watch it move over here\."/);
    assert.match(moved.text, /changed as this was said/);
    assert.equal(moved.images?.length, 2);
    // The next sentence is over long before the change at 0:24, and the silence after it belongs to no sentence.
    const held = await runTool('kf_read', { ref: 'BOX', view: 'screen', loc: '0:15' });
    assert.match(held.text, /held still/);
    assert.equal(held.images?.length, 1);
    // A 640x360 source is under 1080p, so a frame comes back enlarged; a crop is cut from the original.
    const frame = await runTool('kf_read', { ref: 'BOX', view: 'image', loc: '0:05' });
    const width = (file: string) => Number(spawnSync(findTool(loadConfig(), 'ffprobe'), ['-v', 'error', '-show_entries', 'stream=width', '-of', 'csv=p=0', file], { encoding: 'utf8' }).stdout.trim());
    assert.equal(width(frame.image!), 2576);
    const crop = await runTool('kf_read', { ref: 'BOX', view: 'image', loc: '0:05', box: '0,25,50,50' });
    assert.equal(width(crop.image!), 1200, 'a small crop is enlarged to 1,200 px on its long edge');
    await assert.rejects(runTool('kf_read', { ref: 'BOX', view: 'image', loc: '0:05', box: '90,0,40,40' }), /percent of the frame/);

    // The checker reads the digest's Frames line against what was opened.
    const page = path.join(fx.root, 'sources', 'box-lesson', 'source.md');
    const digest = (frames: string, exhibits = '') =>
      fs
        .readFileSync(page, 'utf8')
        .replace(/## Map\n\n[\s\S]*?\n\n## What it changed/, `## Map\n\n### The whole lesson [0:02-0:32]\n\nA box sits on the left, moves to the middle and ends on the right, which is all this recording shows and all that the speaker says about it in four short sentences.\n${frames}\n${exhibits}\n## What it changed`);
    const warnings = async () => (await runTool('kf_check', {})).text;
    fs.writeFileSync(page, digest(''));
    assert.match(await warnings(), /\[frames\][^\n]*the screen changed 3 times/);
    fs.writeFileSync(page, digest('- **Frames:** 0:05, 0:29\n'));
    assert.match(await warnings(), /lists a frame at 0:29, but no frame near that time was opened/);
    assert.doesNotMatch(await warnings(), /lists a frame at 0:05/);
    // A note in brackets and a "none" reason may mention times without listing frames.
    fs.writeFileSync(page, digest('- **Frames:** 0:05 (the box before it moves at 0:29)\n'));
    assert.doesNotMatch(await warnings(), /\[frames\]/);
    fs.writeFileSync(page, digest('- **Frames:** none: nothing changes between 0:29 and 0:33\n'));
    assert.doesNotMatch(await warnings(), /\[frames\]/);
    // Words printed on the screen aren't in the transcript. A screen citation is checked against the frames opened.
    fs.writeFileSync(page, digest('- **Frames:** 0:05\n\nThe frame is labelled "words that only the picture could carry" [0:05 screen].\n'));
    assert.doesNotMatch(await warnings(), /\[quote\]|\[citation\]/);
    fs.writeFileSync(page, digest('- **Frames:** 0:05\n\nThe frame is labelled "words that only the picture could carry" [0:29 screen].\n'));
    assert.match(await warnings(), /\[citation\][^\n]*cites the screen at a moment no frame was opened/);
    // An exhibit record needs its kept frame, and a kept frame is served from where it was kept.
    fs.writeFileSync(page, digest('- **Frames:** 0:05\n', '\n## Exhibits\n\n### 0:05 The box on the left\n\nA black box at the left of a white frame, with nothing else drawn on it and no labels or axes of any kind.\n'));
    assert.match(await warnings(), /\[exhibit\][^\n]*has no kept frame/);
    // Keeping a crop keeps the frame it was cut from as well.
    const kept = await runTool('kf_source', { action: 'keep', ref: 'BOX', loc: '0:05', box: '0,25,50,50' });
    assert.match(kept.image!, /exhibits/);
    assert.equal(fs.readdirSync(path.join(fx.root, 'sources', 'box-lesson', 'exhibits')).length, 2);
    assert.doesNotMatch(await warnings(), /\[exhibit\]/);
    fs.rmSync(path.join(fx.root, 'sources', 'box-lesson', 'frames'), { recursive: true });
    assert.match((await runTool('kf_read', { ref: 'BOX', view: 'image', loc: '0:05' })).image!, /exhibits/);
    // A page left with the placeholder summary that "new" writes is an error, not a silent commit.
    write(fx.root, 'knowledge/trading/DOMAIN.md', '---\ntype: domain\ntitle: Trading\nsummary: "TODO: one line on what this domain covers."\n---\n# Trading\n');
    assert.match(await warnings(), /summary is still the placeholder/);
  } finally {
    fx.cleanup();
  }
});

/** A PDF whose one page is a picture and nothing else, the way a scan is: the JPEG is embedded as it stands. */
function scannedPdf(jpeg: Buffer, width: number, height: number): Buffer {
  const content = 'q 612 0 0 792 0 0 cm /Im0 Do Q';
  const parts: Buffer[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (chunk: Buffer | string) => {
    const b = typeof chunk === 'string' ? Buffer.from(chunk, 'latin1') : chunk;
    parts.push(b);
    length += b.length;
  };
  const object = (n: number, body: (Buffer | string)[]) => {
    offsets[n] = length;
    push(`${n} 0 obj\n`);
    body.forEach(push);
    push('\nendobj\n');
  };
  push('%PDF-1.4\n');
  object(1, ['<< /Type /Catalog /Pages 2 0 R >>']);
  object(2, ['<< /Type /Pages /Kids [3 0 R] /Count 1 >>']);
  object(3, ['<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /XObject << /Im0 5 0 R >> >> >>']);
  object(4, [`<< /Length ${content.length} >>\nstream\n${content}\nendstream`]);
  object(5, [`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`, jpeg, '\nendstream']);
  const xref = length;
  push(`xref\n0 6\n0000000000 65535 f \n`);
  for (let n = 1; n <= 5; n++) push(`${String(offsets[n]).padStart(10, '0')} 00000 n \n`);
  push(`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return Buffer.concat(parts);
}

test('a scanned PDF page is read by OCR when Tesseract is installed, and flagged', async t => {
  const fx = freshLibrary();
  try {
    if (!has(() => findPoppler(loadConfig()))) return t.skip("Poppler isn't installed");
    if (!findTesseract(loadConfig())) return t.skip("Tesseract with English data isn't installed");
    // Make the scan: render a page of real text to a picture, and wrap the picture in a PDF with no text layer.
    const typed = tinyPdf(['Thirty trades per free parameter is the floor for reading a backtest.']);
    const render = spawnSync(findPoppler(loadConfig(), 'pdftoppm'), ['-jpeg', '-r', '150', '-f', '1', '-l', '1', '-'], { input: typed, maxBuffer: 1 << 26 });
    if (render.status !== 0 || !render.stdout.length) return t.skip("this Poppler can't render a JPEG");
    const pdf = path.join(fx.dir, 'scan.pdf');
    fs.writeFileSync(pdf, scannedPdf(render.stdout, 1275, 1650));
    const added = await addSource(loadConfig(), { file: pdf, title: 'A scanned paper', key: 'SCN', kind: 'paper' });
    assert.ok(added.notes.some(n => /1 of 1 pages had no text layer and were read by OCR/.test(n)));
    assert.deepEqual(added.worth_viewing, ['p.1']);
    const source = loadLibrary(fx.root).sources[0];
    assert.ok(source.units[0].flags.includes('ocr'));
    assert.match((await runTool('kf_read', { ref: 'SCN', loc: 'p.1' })).text, /Thirty trades per free parameter/i);
  } finally {
    fx.cleanup();
  }
});

test('a video link is fetched after the cost is approved, with its captions, and kept in the library', async t => {
  const fx = freshLibrary();
  try {
    if (!has(() => findTool(loadConfig(), 'ffmpeg')) || !has(() => findTool(loadConfig(), 'ffprobe'))) return t.skip("FFmpeg isn't installed");
    const made = path.join(fx.dir, 'made.mp4');
    const synth = spawnSync(findTool(loadConfig(), 'ffmpeg'), ['-nostdin', '-y', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=12', '-f', 'lavfi', '-i', 'color=c=white:s=320x180:r=10:d=12', '-pix_fmt', 'yuv420p', '-shortest', made], { stdio: 'ignore' });
    if (synth.status !== 0) return t.skip("this FFmpeg can't synthesize a test video");
    const raw = JSON.parse(fs.readFileSync(fx.config, 'utf8'));
    fs.writeFileSync(fx.config, JSON.stringify({ ...raw, transcription: { endpoint: 'https://transcribe.invalid/v1/audio/transcriptions', model: 'vendor/words-model', api_key_file: write(fx.dir, 'key.txt', 'not-a-real-key'), cost_per_minute: 0.6 } }));
    const link = 'https://video.invalid/watch?v=abc123';
    const calls: string[] = [];
    // Stands in for yt-dlp: answers the question about the page, and "downloads" by copying a file made here.
    const ytdlp = (args: string[]) => {
      if (args.includes('--dump-single-json')) {
        calls.push('info');
        return { status: 0, stderr: '', stdout: JSON.stringify({ id: 'abc123', title: 'Stops and targets', uploader: 'Ilo Carrow', upload_date: '20240815', duration: 12, webpage_url: link, description: 'A lesson on stops.', height: 1080, subtitles: { en: [{}] } }) };
      }
      calls.push('download');
      const out = args[args.indexOf('-o') + 1];
      fs.copyFileSync(made, out.replace('%(ext)s', 'mp4'));
      fs.writeFileSync(out.replace('%(ext)s', 'en.vtt'), 'WEBVTT\n\n00:00:01.000 --> 00:00:04.000\nA stop goes under the low.\n\n00:00:05.000 --> 00:00:09.000\nThe target is the range high.\n');
      return { status: 0, stderr: '', stdout: '' };
    };
    const words = 'A stop goes under the low.'.split(' ').map((word, i) => ({ word, start: 1 + i * 0.3, end: 1.25 + i * 0.3 }));
    const fetcher = (async () => new Response(JSON.stringify({ text: 'A stop goes under the low.', segments: [], words }), { status: 200 })) as typeof fetch;
    // Twelve seconds at 0.60 a minute is 0.12. Until that is approved, nothing is downloaded.
    await assert.rejects(addSource(loadConfig(), { file: link, key: 'STP', fetcher, ytdlp }), /estimated at 0\.12 USD[\s\S]*Nothing has been downloaded/);
    assert.deepEqual(calls, ['info']);
    const added = await addSource(loadConfig(), { file: link, key: 'STP', fetcher, ytdlp, max_cost: 0.2 });
    assert.equal(added.original, 'copied into the library');
    const source = loadLibrary(fx.root).sources[0];
    assert.equal(source.fm.title, 'Stops and targets');
    assert.equal(source.fm.url, link);
    assert.equal(source.fm.year, '2024');
    assert.ok(fs.existsSync(path.join(source.dir, 'original', 'stops-and-targets.mp4')));
    assert.match(fs.readFileSync(path.join(source.dir, 'captions.txt'), 'utf8'), /\[0:01\] A stop goes under the low\. The target is the range high\./);
    assert.ok(!fs.existsSync(path.join(fx.root, '.knowfu', 'downloads', 'abc123')), 'the download folder is cleared once the video is in the library');
    await assert.rejects(addSource(loadConfig(), { file: link, key: 'STP2', fetcher, ytdlp, max_cost: 0.2 }), /already in the library as/);
  } finally {
    fx.cleanup();
  }
});

test("the format guide's own examples parse", () => {
  const guide = fs.readFileSync(path.join(PLUGIN, 'skills', 'know-fu', 'references', 'format.md'), 'utf8');
  const blocks = [...guide.matchAll(/```markdown\n([\s\S]*?)```/g)].map(m => m[1]);
  assert.ok(blocks.length >= 4, 'topic, principle, note and idea examples');
  for (const block of blocks) {
    const parsed = parseFrontmatter(block);
    assert.deepEqual(parsed.errors, []);
    assert.ok(['topic', 'principle', 'note', 'idea'].includes(String(parsed.fm.type)));
  }
});

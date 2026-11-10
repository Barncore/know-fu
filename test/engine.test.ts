import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { checkLibrary } from '../plugin/engine/check.ts';
import { parseFrontmatter, formatFrontmatter } from '../plugin/engine/frontmatter.ts';
import { loadLibrary, resolveLoc } from '../plugin/engine/library.ts';
import { search } from '../plugin/engine/search.ts';
import { runTool } from '../plugin/engine/tools.ts';
import { ACCOUNTS, builtLibrary, freshLibrary, write } from './helpers.ts';

const codes = (issues: { code: string }[]) => issues.map(i => i.code);

test('frontmatter: strings and lists parse; anything else is refused, never truncated', () => {
  const ok = parseFrontmatter('---\ntitle: "A: B, C"\nprinciples: [one, "two, three"]\nkeywords:\n  - soak\n  - even heat\nplain: a value with: a colon\n---\nbody\n');
  assert.deepEqual(ok.errors, []);
  assert.equal(ok.fm.title, 'A: B, C');
  assert.deepEqual(ok.fm.principles, ['one', 'two, three']);
  assert.deepEqual(ok.fm.keywords, ['soak', 'even heat']);
  assert.equal(ok.fm.plain, 'a value with: a colon');
  assert.equal(ok.body, 'body\n');
  assert.equal(ok.bodyLine, 9);
  // The 17 October bug: a flow mapping whose value held a comma lost everything after the comma.
  const mapping = parseFrontmatter('---\nevidence: {level: moderate, why: A, B}\n---\n');
  assert.match(mapping.errors.join(' '), /mapping/);
  const nested = parseFrontmatter('---\nassess:\n  level: high\n---\n');
  assert.match(nested.errors.join(' '), /nested/);
  const unclosed = parseFrontmatter('---\ntitle: x\n');
  assert.match(unclosed.errors.join(' '), /never closed/);
  const round = parseFrontmatter(formatFrontmatter({ title: 'Say "hi": now', list: ['a b', 'c, d'] }));
  assert.equal(round.fm.title, 'Say "hi": now');
  assert.deepEqual(round.fm.list, ['a b', 'c, d']);
});

test('a source becomes citable units, and the original is kept', async () => {
  const fx = await builtLibrary();
  try {
    const lib = loadLibrary(fx.root);
    const book = lib.sources.find(s => s.key === 'WKH')!;
    assert.equal(book.units.length, 4);
    assert.equal(book.units[1].loc, 's.2');
    assert.ok(fs.existsSync(path.join(book.dir, 'original', 'handbook.md')));
    assert.deepEqual(resolveLoc(book, 's.2-3'), [1, 2]);
    assert.equal(resolveLoc(book, 's.9'), null);
    const talk = lib.sources.find(s => s.key === 'ATK')!;
    assert.equal(talk.units[0].kind, 'time');
    assert.deepEqual(resolveLoc(talk, '1:10'), [0, 0]);
    assert.deepEqual(resolveLoc(talk, '2:30-4:00'), [1, 1]);
    const text = (await runTool('kf_read', { ref: 'WKH', loc: 's.3' })).text;
    assert.match(text, /===== WKH s\.3/);
    assert.match(text, /Start body reduction at cone 010/);
    // The same file can't be added twice, and a key can't be reused.
    await assert.rejects(runTool('kf_source', { action: 'add', file: fx.handbook, title: 'Again' }), /already in the library/);
    const other = write(fx.dir, 'other.md', 'Some other text that is long enough to count as a source of its own.\n');
    await assert.rejects(runTool('kf_source', { action: 'add', file: other, title: 'Other', key: 'WKH' }), /already used/);
  } finally {
    fx.cleanup();
  }
});

test('a well-formed library passes, and the derived parts are brought in step', async () => {
  const fx = await builtLibrary();
  try {
    const report = checkLibrary(fx.root, { fix: true });
    assert.deepEqual(report.errors, []);
    const topic = fs.readFileSync(path.join(fx.root, 'knowledge/ceramics/wood-firing/TOPIC.md'), 'utf8');
    assert.match(topic, /- \*\*Governs:\*\* \[\[hold-at-cone-9\]\], \[\[hold-or-stop-at-cone-9\]\]/);
    assert.match(topic, /- \*\*Governs:\*\* \[\[body-reduction-window\]\]/);
    const index = fs.readFileSync(path.join(fx.root, 'knowledge/ceramics/wood-firing/_index.md'), 'utf8');
    assert.match(index, /## Heat work matures ware/);
    assert.match(index, /\[\[hold-at-cone-9\]\] \(method\)/);
    assert.match(fs.readFileSync(path.join(fx.root, 'INDEX.md'), 'utf8'), /2 principles, 3 accounts, 2 sources/);
    // A second run changes nothing: the fixes are stable.
    assert.deepEqual(checkLibrary(fx.root, { fix: true }).fixed, []);
    // An account that stops naming a principle drops out of its Governs line.
    const file = path.join(fx.root, 'knowledge/ceramics/wood-firing/accounts/hold-or-stop-at-cone-9.md');
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('principles: [heat-work-matures-ware]', 'principles: []'));
    checkLibrary(fx.root, { fix: true });
    assert.match(fs.readFileSync(path.join(fx.root, 'knowledge/ceramics/wood-firing/TOPIC.md'), 'utf8'), /- \*\*Governs:\*\* \[\[hold-at-cone-9\]\]\n/);
  } finally {
    fx.cleanup();
  }
});

test('the checker catches what breaks a library', async () => {
  const fx = await builtLibrary();
  try {
    const accounts = 'knowledge/ceramics/wood-firing/accounts';
    const base = ACCOUNTS['hold-at-cone-9'];
    // A misquote: the source says forty, not sixty.
    write(fx.root, `${accounts}/misquote.md`, base.replace('Hold forty minutes once cone 9 bends', 'A different title entirely here').replace('"Hold the kiln for forty minutes once cone 9 starts to bend."', '"Hold the kiln for sixty minutes once cone 9 starts to bend."'));
    // A dead link, a locator past the end, an unknown key, an unknown principle, an unlisted source.
    write(
      fx.root,
      `${accounts}/broken.md`,
      '---\ntype: account\nkind: method\ntitle: Broken on purpose\nsummary: Everything wrong at once.\nprinciples: [no-such-principle]\nsources: [WKH]\nbasis: source\nupdated: 2026-11-10\nmood: bad\n---\nSee [[nowhere]] and [WKH s.99] and [ZZZ p.1] and [ATK 0:20].\n',
    );
    write(fx.root, 'ideas/ten-minute-hold.md', '---\ntype: idea\ntitle: A ten minute hold\nsummary: A short hold might even the chamber and keep ash runs.\nstatus: candidate\npremises: [hold-at-cone-9, no-such-account]\nupdated: 2026-11-10\n---\nTry it.\n');
    // Knowledge may never rest on an idea.
    write(fx.root, `${accounts}/leans-on-idea.md`, base.replace('Hold forty minutes once cone 9 bends', 'Leaning on an idea is refused').replace('- see also [[body-reduction-window]]', '- supports [[ten-minute-hold]]'));
    const report = checkLibrary(fx.root);
    const at = (file: string) => report.errors.filter(e => e.file.endsWith(file));
    assert.deepEqual(codes(at('misquote.md')), ['quote']);
    assert.deepEqual(codes(at('broken.md')).sort(), ['citation', 'citation', 'frontmatter', 'link', 'principle', 'sources']);
    assert.deepEqual(codes(at('leans-on-idea.md')), ['idea-as-evidence']);
    assert.deepEqual(codes(at('ten-minute-hold.md')), ['idea']);
    // A principle nothing names is refused; a slogan with no boundary is refused.
    const topic = path.join(fx.root, 'knowledge/ceramics/wood-firing/TOPIC.md');
    fs.writeFileSync(topic, fs.readFileSync(topic, 'utf8').replace('## Tensions', '### Fire is beautiful\n\nServe the pot and the fire will serve you.\n\n- **Why:** it just is.\n- **Held by:** WKH (inferred)\n\n## Tensions'));
    const slogan = checkLibrary(fx.root).errors.filter(e => e.message.includes('Fire is beautiful'));
    assert.equal(slogan.length, 2);
    assert.match(slogan.map(e => e.message).join(' '), /Breaks when/);
    assert.match(slogan.map(e => e.message).join(' '), /governs no account/);
  } finally {
    fx.cleanup();
  }
});

test('a compiled source must be mapped end to end, and a retelling is flagged', async () => {
  const fx = await builtLibrary();
  try {
    const file = path.join(fx.root, 'sources/venn-the-wood-kiln-handbook/source.md');
    const text = fs.readFileSync(file, 'utf8');
    fs.writeFileSync(file, text.replace(/### Cooling \[s\.4\]\n\n.*\n\n/, ''));
    const gap = checkLibrary(fx.root).errors.filter(e => e.code === 'map');
    assert.equal(gap.length, 1);
    assert.match(gap[0].message, /no digest covers s\.4/);
    fs.writeFileSync(file, text);
    // The fixture's accounts are longer than its tiny source, so the retelling warning fires.
    const warned = checkLibrary(fx.root).warnings.filter(w => w.code === 'retelling');
    assert.ok(warned.some(w => w.file.includes('venn-the-wood-kiln-handbook')));
    // A registered source isn't held to the map rule yet.
    fs.writeFileSync(file, text.replace('status: compiled', 'status: registered').replace(/### Cooling \[s\.4\]\n\n.*\n\n/, ''));
    assert.equal(checkLibrary(fx.root).errors.filter(e => e.code === 'map').length, 0);
  } finally {
    fx.cleanup();
  }
});

test('a source read in part is measured against what its map covers, and its own page is checked too', async () => {
  const fx = await builtLibrary();
  try {
    const file = path.join(fx.root, 'sources/venn-the-wood-kiln-handbook/source.md');
    const text = fs.readFileSync(file, 'utf8');
    // Read so far: sections 1 to 3. Still "registered", so the gap at s.4 is reported, not refused.
    fs.writeFileSync(file, text.replace('status: compiled', 'status: registered').replace(/### Cooling \[s\.4\]\n\n.*\n\n/, ''));
    const partial = checkLibrary(fx.root);
    assert.deepEqual(partial.errors, []);
    const stats = partial.stats.sources.find(s => s.key === 'WKH')!;
    assert.equal(stats.unmapped, 's.4');
    assert.ok(stats.mapped_words > 0 && stats.mapped_words < stats.source_words);
    assert.match((await runTool('kf_check', {})).text, /WKH .*\[registered\]: \d+ of \d+ words mapped \(not yet: s\.4\)/);
    // On its own page a source is cited by bare locator, and a quote there is checked like any other.
    fs.writeFileSync(file, text.replace('Gives the forty minute hold', 'It says "hold the kiln for ninety minutes" [s.2], and gives the forty minute hold'));
    const misquote = checkLibrary(fx.root).errors.filter(e => e.code === 'quote');
    assert.equal(misquote.length, 1);
    assert.match(misquote[0].file, /venn-the-wood-kiln-handbook\/source\.md/);
    fs.writeFileSync(file, text.replace('Gives the forty minute hold', 'A locator past the end [s.40]. Gives the forty minute hold'));
    assert.equal(checkLibrary(fx.root).errors.filter(e => e.code === 'citation').length, 1);
    // An empty Frame is called empty, not missing.
    const topic = path.join(fx.root, 'knowledge/ceramics/wood-firing/TOPIC.md');
    fs.writeFileSync(file, text);
    fs.writeFileSync(topic, fs.readFileSync(topic, 'utf8').replace(/## Frame\n\n.*\n/, '## Frame\n\n'));
    assert.match(checkLibrary(fx.root).errors.map(e => e.message).join(' '), /"## Frame" section is empty/);
  } finally {
    fx.cleanup();
  }
});

test('a long span of source text comes back in pieces that say where to continue', async () => {
  const fx = freshLibrary();
  try {
    const big = write(fx.dir, 'long.md', Array.from({ length: 30 }, (_, i) => `## Part ${i + 1}\n\n` + `Sentence about part ${i + 1}. `.repeat(120)).join('\n\n'));
    await runTool('kf_source', { action: 'add', file: big, title: 'A long text', key: 'LNG' });
    const first = (await runTool('kf_read', { ref: 'LNG', loc: 's.1-30' })).text;
    assert.ok(first.length < 30000, `one reply is ${first.length} characters`);
    const next = /continue with loc "(s\.\d+-30)"/.exec(first);
    assert.ok(next, 'the reply says where to continue');
    assert.match((await runTool('kf_read', { ref: 'LNG', loc: next![1] })).text, new RegExp(`===== LNG ${next![1].split('-')[0].replace('.', '\\.')}`));
    // Registration was committed by itself.
    const log = fs.readFileSync(path.join(fx.root, 'log.md'), 'utf8');
    assert.match(log, /source: registered LNG \(a-long-text\)/);
  } finally {
    fx.cleanup();
  }
});

test('recall leads with principles, loads the best account whole and carries what disputes it', async () => {
  const fx = await builtLibrary();
  try {
    checkLibrary(fx.root, { fix: true });
    const text = (await runTool('kf_recall', { query: 'how long should I hold the kiln at cone 9 to even the temperature' })).text;
    const principles = text.indexOf('## Principles in play');
    const accounts = text.indexOf('## Accounts');
    assert.ok(principles > 0 && accounts > principles, 'principles come before accounts');
    assert.match(text, /\*\*Heat work matures ware\*\*/);
    assert.match(text.slice(accounts), /### Hold forty minutes once cone 9 bends/);
    assert.match(text, /can differ by two cones from firebox to chimney/);
    // The debate that qualifies the hold is either loaded or named as a dispute; it is never silently dropped.
    assert.ok(/### Hold at cone 9, or stop stoking when it falls/.test(text) || /hold-or-stop-at-cone-9` qualifies hold-at-cone-9/.test(text));
    // On a budget too small for both, the qualifying account still travels as a named dispute.
    const tight = (await runTool('kf_recall', { query: 'forty minute hold cone 9', budget: 400 })).text;
    assert.doesNotMatch(tight, /### Hold at cone 9, or stop stoking when it falls/);
    assert.match(tight, /## Disputes and qualifications[\s\S]*hold-or-stop-at-cone-9/);
    // Gists: one line each, nothing loaded.
    const gists = (await runTool('kf_recall', { query: 'reduction colour copper red', load: 'gists' })).text;
    assert.match(gists, /## Matching accounts[\s\S]*`body-reduction-window` \(mechanism, ceramics\/wood-firing\)/);
    assert.doesNotMatch(gists, /## Accounts\n/);
    // A question only the source text can answer points into the source and says the library has a gap.
    const cooling = (await runTool('kf_recall', { query: 'dunt damper cool matte crystals' })).text;
    assert.match(cooling, /In the sources[\s\S]*WKH s\.4/);
    const nothing = (await runTool('kf_recall', { query: 'zebra accordion' })).text;
    assert.match(nothing, /gap/);
    // A question about something the library lacks shares common words with real accounts. It still gets
    // told there is a gap, with no account loaded and no source passage offered as if it were evidence.
    const lacking = (await runTool('kf_recall', { query: 'how do I wire a thermocouple and program an electric controller for the kiln', ideas: true })).text;
    assert.match(lacking, /Nothing in the compiled library clearly answers this/);
    assert.doesNotMatch(lacking, /## Accounts\n/);
    assert.doesNotMatch(lacking, /## In the sources/);
    assert.match((await runTool('kf_recall', { query: 'forty minute hold', ideas: true })).text, /No ideas on file match this\./);
    // Sub-questions: each one's best match is present.
    const both = (await runTool('kf_recall', { query: ['when to start body reduction', 'how long to hold at cone 9'], budget: 6000 })).text;
    assert.match(both, /### Body reduction only works before the body seals/);
    assert.match(both, /### Hold forty minutes once cone 9 bends/);
    // Keywords reach an account by words its text never uses.
    const lib = loadLibrary(fx.root);
    assert.equal(search(lib, 'soak', { tiers: ['account'] })[0]?.ref, 'hold-at-cone-9');
  } finally {
    fx.cleanup();
  }
});

test('brief, read and connect', async () => {
  const fx = await builtLibrary();
  try {
    checkLibrary(fx.root, { fix: true });
    assert.match((await runTool('kf_brief', {})).text, /`ceramics\/wood-firing`: .*\(2 principles, 3 accounts\)/);
    const topic = (await runTool('kf_brief', { topic: 'wood-firing' })).text;
    assert.match(topic, /## Frame[\s\S]*### Heat work matures ware[\s\S]*Governs/);
    assert.match((await runTool('kf_read', { ref: 'hold-at-cone-9' })).text, /^---\ntype: account/);
    assert.match((await runTool('kf_read', { ref: 'ceramics/wood-firing#atmosphere-decides-colour' })).text, /### Atmosphere decides colour/);
    assert.match((await runTool('kf_read', { ref: 'ceramics/wood-firing/_index' })).text, /every account/);
    assert.match((await runTool('kf_read', { ref: 'WKH' })).text, /## Map/);
    await assert.rejects(runTool('kf_read', { ref: 'hold-at-cone' }), /Close: hold-at-cone-9|Nothing is named/);
    const chain = (await runTool('kf_connect', { from: 'hold-at-cone-9', to: 'hold-or-stop-at-cone-9' })).text;
    assert.match(chain, /`hold-or-stop-at-cone-9`/);
    assert.match(chain, /qualifies/);
    const far = (await runTool('kf_connect', { from: 'body-reduction-window', to: 'hold-or-stop-at-cone-9' })).text;
    assert.match(far, /`hold-at-cone-9`/, 'the chain runs through the account that links to both');
    assert.match((await runTool('kf_connect', { from: 'body reduction' })).text, /case of/);
  } finally {
    fx.cleanup();
  }
});

test('only the home session changes the library; any session can save a note', async () => {
  const fx = await builtLibrary();
  try {
    process.env.KB_PROJECT = path.join(fx.dir, 'some-project');
    fs.mkdirSync(process.env.KB_PROJECT, { recursive: true });
    await assert.rejects(runTool('kf_source', { action: 'add', file: fx.handbook }), /NOT_HOME|only runs from a session opened in the library folder/);
    await assert.rejects(runTool('kf_check', { commit: 'nope' }), /only runs from a session opened in the library folder/);
    // Reading works from anywhere, and a check from elsewhere changes nothing.
    const before = fs.readFileSync(path.join(fx.root, 'knowledge/ceramics/wood-firing/TOPIC.md'), 'utf8');
    assert.match((await runTool('kf_check', {})).text, /Library:/);
    assert.equal(fs.readFileSync(path.join(fx.root, 'knowledge/ceramics/wood-firing/TOPIC.md'), 'utf8'), before);
    const saved = (await runTool('kf_note', { title: 'Ten minute hold worked', body: 'Fired 3 November with a ten minute hold; ash runs survived.' })).text;
    assert.match(saved, /inbox/);
    assert.equal(loadLibrary(fx.root).inbox.length, 1);
    await assert.rejects(runTool('kf_note', { title: 'Ten minute hold worked', body: 'again' }), /already saved today/);
    // Pinning records the project, and status reports it.
    assert.match((await runTool('kf_pin', { topic: 'wood-firing' })).text, /ceramics\/wood-firing pinned/);
    assert.match((await runTool('kf_status', {})).text, /Pinned here: ceramics\/wood-firing/);
    assert.match((await runTool('kf_pin', { topic: 'wood-firing', remove: true })).text, /nothing pinned/);
    // Back home: a commit records the change in the log and in git.
    process.env.KB_PROJECT = fx.root;
    const committed = (await runTool('kf_check', { commit: 'test: fixture library' })).text;
    assert.match(committed, /No errors\./);
    assert.match(committed, /committed [0-9a-f]{7}|not committed/);
    assert.match(fs.readFileSync(path.join(fx.root, 'log.md'), 'utf8'), /test: fixture library/);
  } finally {
    fx.cleanup();
  }
});

test("the log and the commit say which agent made a change", async () => {
  const fx = await builtLibrary();
  const before = process.env.KB_ACTOR;
  try {
    process.env.KB_ACTOR = 'codex';
    assert.match((await runTool('kf_check', { commit: 'ingest: the handbook' })).text, /committed [0-9a-f]{7}|not committed/);
    assert.match(fs.readFileSync(path.join(fx.root, 'log.md'), 'utf8'), /\[codex\] ingest: the handbook/);
    // A value that isn't a plain name is left out, never written into the log.
    process.env.KB_ACTOR = 'x; rm -rf';
    await runTool('kf_note', { title: 'A note', body: 'So there is something to commit.' });
    await runTool('kf_check', { commit: 'second change' });
    assert.match(fs.readFileSync(path.join(fx.root, 'log.md'), 'utf8'), /\d{4}-\d{2}-\d{2} second change/);
  } finally {
    if (before === undefined) delete process.env.KB_ACTOR;
    else process.env.KB_ACTOR = before;
    fx.cleanup();
  }
});

test('with no config, every tool says how to set up instead of failing obscurely', async () => {
  const fx = freshLibrary();
  try {
    fs.rmSync(fx.config);
    assert.match((await runTool('kf_status', {})).text, /Not set up/);
    await assert.rejects(runTool('kf_brief', {}), /NOT_CONFIGURED|no Know Fu config file/);
    // A 0.5 config (per-agent sections, no top-level library) is named for what it is.
    fs.writeFileSync(fx.config, JSON.stringify({ schema_version: 1, agents: { claude: { library: 'x' } } }));
    await assert.rejects(runTool('kf_brief', {}), /one library for every agent/);
  } finally {
    fx.cleanup();
  }
});

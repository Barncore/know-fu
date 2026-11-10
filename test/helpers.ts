// Builds a small fictional library in a short temp folder. Every test gets its own.
// The subject (firing pottery in a wood kiln) and its "sources" are invented for the tests.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { initLibrary, scaffold } from '../plugin/engine/init.ts';
import { runTool } from '../plugin/engine/tools.ts';

export const ENGINE = path.join(import.meta.dirname, '..', 'plugin', 'engine');
export const PLUGIN = path.join(import.meta.dirname, '..', 'plugin');

export const HANDBOOK = `# The Wood Kiln Handbook

## Chapter 1: Heat work

Ware matures by heat work, which is temperature held over time, and not by peak temperature alone. A slow climb to a lower peak can mature a glaze that a fast climb to a higher peak leaves raw. This is why potters read cones and not only a pyrometer: a cone bends when it has absorbed enough heat work.

Hold the kiln for forty minutes once cone 9 starts to bend. The hold evens out the chamber, which can differ by two cones from firebox to chimney.

## Chapter 2: Reduction

Starving the fire of air makes the flame pull oxygen from the clay and glaze. Copper glazes turn red and iron bodies turn grey only in a reducing atmosphere. Start body reduction at cone 010 and keep it for one hour; start too late and the body has already sealed, so the colour never develops.

A reducing flame is cooler than a clean one. Each hour of heavy reduction costs about thirty degrees of climb, so plan the stoking schedule around it.

## Chapter 3: Cooling

Cool slowly between 1000 and 800 degrees for matte glazes: crystals need the time to grow. Crash cool through the same range for glossy glazes. Never open the damper below 600 degrees until the kiln is under 200, or the ware will dunt.
`;

export const TALK = `1
00:00:01,000 --> 00:00:20,000
Tonight I want to argue against the long hold at the end of a firing.

2
00:00:20,000 --> 00:01:10,000
In my kiln a forty minute hold flattens the ash runs that are the whole point of wood firing.

3
00:01:10,000 --> 00:02:30,000
I stop stoking the moment cone 9 is flat at the front, and accept an uneven chamber as part of the work.

4
00:02:30,000 --> 00:04:00,000
Place the glazes that need more heat near the firebox instead of holding the whole kiln for them.
`;

export type Fixture = { root: string; config: string; dir: string; cleanup: () => void };

/** Points the engine at a fresh library and makes this process its home session. */
export function freshLibrary(): Fixture {
  // A short folder: native SQLite can't open files under very long paths on Windows.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kf-'));
  const root = path.join(dir, 'library');
  const config = path.join(dir, 'config.json');
  process.env.KNOW_FU_CONFIG = config;
  delete process.env.KNOW_FU_LIBRARY;
  delete process.env.KNOW_FU_WRITE_ANYWHERE;
  process.env.KB_PROJECT = root;
  initLibrary(root);
  return { root, config, dir, cleanup: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

export const write = (root: string, rel: string, text: string) => {
  const file = path.join(root, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  return file;
};

export const TOPIC = `---
type: topic
title: Wood firing
summary: Firing stoneware in a wood kiln, from the climb to the cool.
updated: 2026-11-10
---
# Wood firing

## Frame

A firing is three decisions made in order: how much heat work the ware gets, what atmosphere it gets it in, and how it comes down. Each one trades evenness against character.

## Principles

### Heat work matures ware

Ware matures by temperature held over time, so the schedule matters as much as the peak.

- **Why:** glaze and body reactions need time at temperature, and a cone measures both together.
- **Breaks when:** the chamber is so uneven that no single schedule suits every shelf.
- **Held by:** WKH (stated, s.2)

### Atmosphere decides colour

What the flame takes from or gives to the ware sets its colour, and only while the body is still open.

- **Why:** a starved flame pulls oxygen out of metal oxides in clay and glaze.
- **Breaks when:** the body has sealed, after which atmosphere changes little.
- **Held by:** WKH (stated, s.3)

## Tensions

- Evenness against character: a hold evens the chamber and flattens ash runs. See [[hold-or-stop-at-cone-9]].

## Open questions

- Does a short hold of ten minutes keep the ash runs?
`;

export const ACCOUNTS: Record<string, string> = {
  'hold-at-cone-9': `---
type: account
kind: method
title: Hold forty minutes once cone 9 bends
summary: A forty minute hold at cone 9 evens a chamber that can differ by two cones front to back.
principles: [heat-work-matures-ware]
sources: [WKH]
basis: source
keywords: [soak, even temperature]
updated: 2026-11-10
---
The handbook's instruction is exact: "Hold the kiln for forty minutes once cone 9 starts to bend." [WKH s.2] The reason is unevenness. The chamber "can differ by two cones from firebox to chimney" [WKH s.2], and the hold lets the cool end catch up through heat work without raising the peak. The handbook gives the hold as a fixed forty minutes and does not say how to shorten it for a small kiln, so treat the number as its figure for its kiln. When a later source argues against holding at all, the cost it names is to surface character and not to maturity, which is why the two views can both be right for different ware. A potter who wants even maturity across every shelf follows this method; one who wants ash runs reads the debate first.

## Connections

- depends on [[wood-firing#heat-work-matures-ware]]: the hold adds heat work without adding temperature
- see also [[body-reduction-window]]
`,
  'body-reduction-window': `---
type: account
kind: mechanism
title: Body reduction only works before the body seals
summary: Start body reduction at cone 010 and hold it an hour; later than that the body has sealed and colour never develops.
principles: [atmosphere-decides-colour]
sources: [WKH]
basis: source
updated: 2026-11-10
---
Reduction changes colour by starving the fire so the flame takes oxygen from the ware: copper turns red and iron bodies turn grey "only in a reducing atmosphere" [WKH s.3]. The window is set by the clay and not by the potter. Reduction has to begin at cone 010 and run for one hour [WKH s.3], because once the body seals the atmosphere can no longer reach the oxides inside it. Start too late and the colour never develops, whatever is done afterwards.

Reduction has a price in temperature. A reducing flame is cooler, and each hour of heavy reduction costs about thirty degrees of climb [WKH s.3], so the stoking schedule has to allow for it or the firing stalls. That makes reduction a planning decision taken before the firing starts, and it means a firing that is running late should not skip the reduction hour to catch up, since colour lost here cannot be recovered and temperature can.

## Connections

- depends on [[wood-firing#atmosphere-decides-colour]]
`,
  'hold-or-stop-at-cone-9': `---
type: account
kind: debate
title: Hold at cone 9, or stop stoking when it falls
summary: The handbook holds forty minutes for an even chamber; the Ash talk stops at cone 9 flat to keep ash runs, and places needy glazes near the firebox instead.
principles: [heat-work-matures-ware]
sources: [WKH, ATK]
basis: synthesis
updated: 2026-11-10
---
Two sources give opposite instructions for the same moment, and they disagree about the goal more than about the facts. The handbook wants every shelf mature and holds forty minutes to get it [WKH s.2]. The talk wants surface: "a forty minute hold flattens the ash runs that are the whole point of wood firing" [ATK 0:20], so its speaker stops stoking when cone 9 is flat at the front and accepts an uneven chamber [ATK 1:10]. Both accept that the chamber is uneven. They differ on whether to fix that with time or with placement: the talk puts the glazes that need more heat near the firebox [ATK 2:30]. Neither source tests the other's method, so which is better for a given load is open. A potter chooses by what the ware is for.

## Connections

- qualifies [[hold-at-cone-9]]: the hold costs ash runs, which the handbook does not mention
`,
};

/** A library with one topic, two sources and three accounts that passes the checker. */
export async function builtLibrary(): Promise<Fixture & { handbook: string; talk: string }> {
  const fx = freshLibrary();
  const handbook = write(fx.dir, 'handbook.md', HANDBOOK);
  const talk = write(fx.dir, 'ash-talk.srt', TALK);
  await runTool('kf_source', { action: 'add', file: handbook, title: 'The Wood Kiln Handbook', authors: ['Mara Venn'], year: '2019', key: 'WKH' });
  await runTool('kf_source', { action: 'add', file: talk, title: 'Against the long hold', authors: ['Ilo Carrow'], key: 'ATK', kind: 'video' });
  scaffold(fx.root, 'ceramics/wood-firing', 'Wood firing', 'Firing stoneware in a wood kiln.');
  write(fx.root, 'knowledge/ceramics/DOMAIN.md', '---\ntype: domain\ntitle: Ceramics\nsummary: Making and firing pottery.\nupdated: 2026-11-10\n---\n# Ceramics\n');
  write(fx.root, 'knowledge/ceramics/wood-firing/TOPIC.md', TOPIC);
  for (const [slug, text] of Object.entries(ACCOUNTS)) write(fx.root, `knowledge/ceramics/wood-firing/accounts/${slug}.md`, text);
  compileSource(fx.root, 'venn-the-wood-kiln-handbook', [
    ['Front matter and heat work [s.1-2]', 'Heat work, not peak temperature, matures ware; cones measure it. Gives the forty minute hold at cone 9 and the two-cone spread across the chamber.'],
    ['Reduction [s.3]', 'How a starved flame changes colour, the cone 010 start for body reduction and its one hour length, and the thirty degrees an hour that reduction costs.'],
    ['Cooling [s.4]', 'Slow cooling between 1000 and 800 for matte glazes, crash cooling for gloss, and the damper rule below 600. Not yet compiled into accounts in this fixture.'],
  ]);
  compileSource(fx.root, 'carrow-against-the-long-hold', [['The whole talk [0:01-4:00]', 'Argues against the long hold: it flattens ash runs. Stop when cone 9 is flat at the front and place needy glazes near the firebox.']]);
  return { ...fx, handbook, talk };
}

export function compileSource(root: string, id: string, map: [string, string][]) {
  const file = path.join(root, 'sources', id, 'source.md');
  const text = fs.readFileSync(file, 'utf8');
  const head = text.slice(0, text.indexOf('\n# ')).replace('status: registered', 'status: compiled');
  const title = /\n# (.*)\n/.exec(text)![1];
  const body = [
    `# ${title}`,
    '',
    '## About',
    '',
    'An invented source for the tests. It rests on its author\'s experience and reports no measurements.',
    '',
    '## Map',
    '',
    ...map.flatMap(([heading, digest]) => [`### ${heading}`, '', digest, '']),
    '## What it changed',
    '',
    'It supplied the accounts in this fixture.',
    '',
  ].join('\n');
  fs.writeFileSync(file, head + '\n' + body);
}

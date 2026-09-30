import fs from 'node:fs/promises';
import { Resvg } from '@resvg/resvg-js';

// Called with XML checked by visual_assets.py. No external resources are loaded.
const [source, target] = process.argv.slice(2);
const renderer = new Resvg(await fs.readFile(source), { font: { loadSystemFonts: true } });
if (!(renderer.width > 0 && renderer.height > 0 && renderer.width * renderer.height <= 60_000_000))
  throw new Error('SVG dimensions exceed the visual preview limit');
await fs.writeFile(target, renderer.render().asPng());

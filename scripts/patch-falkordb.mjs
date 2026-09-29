import fs from 'node:fs/promises';
import path from 'node:path';
const app=path.resolve(import.meta.dirname,'..'),pkg=JSON.parse(await fs.readFile(path.join(app,'node_modules/falkordb/package.json'),'utf8'));
if(pkg.version!=='6.8.0')throw Error('Review the FalkorDB connection-error patch before changing client versions.');
const file=path.join(app,'node_modules/falkordb/dist/src/falkordb.js'),text=await fs.readFile(file,'utf8');
const marker="        falkordb.on('error', () => {}); // research-knowledge: connect must reject instead of crashing before callers can attach a listener";
if(!text.includes(marker)){const needle='        const falkordb = new FalkorDB();';if(text.split(needle).length!==2)throw Error('FalkorDB patch target changed');await fs.writeFile(file,text.replace(needle,needle+'\n'+marker));}
console.log('FalkorDB 6.8.0 connection-error patch verified.');

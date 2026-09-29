import fs from 'node:fs/promises';
import path from 'node:path';
import './package-plugin.mjs';
import os from 'node:os';
const app=path.resolve(import.meta.dirname,'..'),target=path.join(os.homedir(),'plugins/know-fu'),stage=path.join(app,'plugin');
await fs.access(path.join(stage,'.mcp.json')).catch(()=>{throw Error('Run scripts/configure-plugin.mjs with the approved storage and media choices before installing.');});
await fs.mkdir(path.join(target,'skills'),{recursive:true});
for(const part of ['.codex-plugin','.mcp.json','skills','README.md','docs','contracts','examples','engine-contracts.json'])await fs.cp(path.join(stage,part),path.join(target,part),{recursive:true,force:true});
console.log(JSON.stringify({plugin:target,engine:app}));

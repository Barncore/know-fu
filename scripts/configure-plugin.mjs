import fs from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
const app=path.resolve(import.meta.dirname,'..');
const {values}=parseArgs({options:{corpus:{type:'string'},state:{type:'string'},project:{type:'string'},media:{type:'string'},distro:{type:'string'},output:{type:'string'},help:{type:'boolean'}}});
if(values.help){console.log('Usage: node scripts/configure-plugin.mjs --corpus ABSOLUTE_PATH --state ABSOLUTE_PATH --media native|wsl [--distro Ubuntu] [--project ABSOLUTE_PATH] [--output FILE]\nWrites a machine-local MCP configuration only. Does not install services, initialize a corpus, or move existing data.');process.exit(0);}
for(const key of ['corpus','state'])if(!values[key]||!path.isAbsolute(values[key]))throw Error(`Choose an absolute --${key} path after reviewing storage locations.`);
if(!['native','wsl'].includes(values.media))throw Error('Choose --media native or wsl explicitly.');
if(values.project&&!path.isAbsolute(values.project))throw Error('Use an absolute --project workspace path.');
const env={KB_CORPUS:path.resolve(values.corpus),KB_STATE_DIR:path.resolve(values.state),KB_MEDIA_RUNTIME:values.media};
if(values.media==='wsl')env.KB_WSL_DISTRO=values.distro??'Ubuntu';
if(values.project)env.KB_PROJECT=path.resolve(values.project);
const output=path.resolve(values.output??path.join(app,'plugin/.mcp.json'));
await fs.mkdir(path.dirname(output),{recursive:true});
// Exclusive creation prevents silently overwriting an existing installation's configuration.
await fs.writeFile(output,JSON.stringify({mcpServers:{'know-fu':{command:process.execPath,args:[path.join(app,'dist/mcp.js')],env}}},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({output,engine:app,corpus:env.KB_CORPUS,state:env.KB_STATE_DIR,initialized:false}));

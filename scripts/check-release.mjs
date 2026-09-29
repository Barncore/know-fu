import fs from 'node:fs/promises';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const app=path.resolve(import.meta.dirname,'..'),staged=process.argv.includes('--staged');
const git=(...args)=>execFileSync('git',args,{cwd:app,encoding:'utf8',maxBuffer:20*1024*1024});
const files=git('ls-files','-z').split('\0').filter(Boolean);
if(!files.length)throw Error('No tracked/staged release files; stage the reviewed allowlisted source first.');
const changed=staged?git('diff','--cached','--name-only','--diff-filter=ACMR','-z').split('\0').filter(Boolean):[];
const contents=new Map();
for(const file of files){
  if(/^(?:acceptance|test-output|node_modules|dist|\.runtime|\.venv|knowledge-library)\//.test(file)||file==='plugin/.mcp.json'||/(?:^|\/)(?:\.env(?:\..*)?|[^/]*\.secret)$/.test(file))throw Error('Excluded release path: '+file);
  const content=staged?git('show',':'+file):await fs.readFile(path.join(app,file),'utf8');
  if(!/\.(?:jpg|png|gif|webp|pdf)$/i.test(file)){
    // Report paths only; never echo a potential credential value.
    if(/(?:[CP]:[\\/]Users[\\/]Nic|P:[\\/]4_Other Projects|nic_research_library_\d)/i.test(content))throw Error('Private installation identity in '+file);
    if(/(?:gh[pousr]_[A-Za-z0-9]{30,}|sk-(?:proj-)?[A-Za-z0-9_-]{35,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/.test(content))throw Error('Potential credential in '+file);
  }
  contents.set(file,content);
}
let links=0;
for(const [file,content] of contents){
  if(!file.endsWith('.md')||file.startsWith('test/fixtures/'))continue;
  for(const match of content.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)){
    const target=match[1].replace(/^<|>$/g,'');if(/^[a-z][a-z0-9+.-]*:|^#/i.test(target))continue;
    const resolved=path.posix.normalize(path.posix.join(path.posix.dirname(file),decodeURIComponent(target.split('#')[0])));
    if(!contents.has(resolved)&&!files.some(p=>p.startsWith(resolved.replace(/\/$/,'')+'/')))throw Error(`Broken release link in ${file}: ${target}`);
    links++;
  }
}
if(staged&&changed.some(p=>/^(?:src|scripts|contracts|config|plugin|test)\//.test(p))){
  if(!changed.includes('CHANGELOG.md'))throw Error('Behavior/package changes require a staged CHANGELOG entry.');
  const docs=changed.some(p=>p==='README.md'||/^docs\/.+\.md$/.test(p)||/^plugin\/(?:docs|skills)\/.+\.md$/.test(p));
  if(!docs&&!/Documentation impact:\s*none/i.test(contents.get('CHANGELOG.md')??''))throw Error('Update affected documentation or record a no-documentation-impact rationale.');
}
console.log(JSON.stringify({files:files.length,relative_links:links,staged,changed:changed.length,checks:'passed',limitation:'Pattern checks do not prove absence of all sensitive content; review staged changes.'}));

import { createHash, randomUUID } from 'node:crypto';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { Ajv2020 } from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import type { RecordData } from './generated/record.js';
import type { CorpusData } from './generated/corpus.js';
import type { ReleaseData } from './generated/release.js';
import type { ProposalData } from './generated/proposal.js';
import type { JobData } from './generated/job.js';
export type { RecordData, CorpusData, ReleaseData, ProposalData, JobData };
export type Ref = {id:string; revision:number};
export type Scope = {read_modules:string[];write_modules:string[];source_refs:Ref[]};
export const VERSION='1.1.0';
export const APP=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
// Keep the existing installation stable; portable deployments select their own state directory.
export const STATE=path.resolve(process.env.KB_STATE_DIR??path.join(APP,'.runtime'));
export const now=()=>new Date().toISOString();
export const uid=(prefix='')=>prefix+randomUUID();
export const hash=(data:string|Uint8Array)=>createHash('sha256').update(data).digest('hex');
export const json=(v:unknown)=>JSON.stringify(v,null,2)+'\n';
export const key=(r:Ref)=>`${r.id}@${r.revision}`;
export const ref=(r:Ref):Ref=>({id:r.id,revision:r.revision});
export const slug=(id:string)=>id.replace(':','_');
export const objectPath=(r:Ref)=>`objects/${slug(r.id)}/${r.revision}`;
export class KBError extends Error {
  constructor(public code:string,message:string,public details:unknown=null, public resumable=true){super(message);}
}
export function ensure(test:unknown,code:string,message:string,details:unknown=null):asserts test {if(!test)throw new KBError(code,message,details);}
export async function exists(p:string){try{await fs.access(p);return true;}catch{return false;}}
export async function readJson<T=any>(p:string):Promise<T>{return JSON.parse((await fs.readFile(p,'utf8')).replace(/^\uFEFF/,''));}
export async function atomic(p:string,data:string|Uint8Array){
  await fs.mkdir(path.dirname(p),{recursive:true}); const tmp=p+'.'+uid()+'.tmp';
  const f=await fs.open(tmp,'wx');
  try{await f.writeFile(data);await f.sync();}finally{await f.close();}
  try{await fs.rename(tmp,p);}catch(e){await fs.rm(tmp,{force:true});throw e;}
}
export async function immutable(p:string,data:string|Uint8Array){
  await fs.mkdir(path.dirname(p),{recursive:true});
  if(await exists(p)){ensure(hash(await fs.readFile(p))===hash(data),'REVISION_CONFLICT','Immutable file already exists with different content',{path:p});return;}
  // Publish a fully flushed inode without replacing an existing immutable object.
  const tmp=p+'.'+uid()+'.tmp',f=await fs.open(tmp,'wx');
  try{await f.writeFile(data);await f.sync();}finally{await f.close();}
  try{await fs.link(tmp,p);}catch(e:any){if(e.code!=='EEXIST')throw e;ensure(hash(await fs.readFile(p))===hash(data),'REVISION_CONFLICT','Immutable file already exists with different content',{path:p});}finally{await fs.rm(tmp,{force:true});}
}
export async function safePath(root:string,relative:string,missing=false){
  ensure(typeof relative==='string' && relative.length>0 && !/[\\:]/.test(relative) && !relative.startsWith('/') && !relative.split('/').some(p=>p==='..'||p==='.'||!p),'VALIDATION_FAILED','Unsafe corpus path',{relative});
  const abs=path.resolve(root,relative); let current=path.resolve(root);
  for(const part of relative.split('/')){current=path.join(current,part);try{const s=await fs.lstat(current);ensure(!s.isSymbolicLink(),'VALIDATION_FAILED','Symlink paths are forbidden',{relative});}catch(e:any){if(e.code==='ENOENT'&&missing)break;throw e;}}
  return abs;
}
export async function withLock<T>(root:string,name:string,fn:()=>Promise<T>):Promise<T>{
  const lock=path.join(root,`.${name}.lock`); await fs.mkdir(root,{recursive:true});
  for(let attempt=0;;attempt++){
    try{await fs.mkdir(lock);await fs.writeFile(path.join(lock,'owner.json'),json({pid:process.pid,host:os.hostname(),time:now()}));break;}
    catch(e:any){if(e.code!=='EEXIST')throw e;
      const owner=await readJson(path.join(lock,'owner.json')).catch(()=>null);
      let alive=true;if(owner?.host===os.hostname()){try{process.kill(owner.pid,0);}catch(err:any){if(err.code==='ESRCH')alive=false;}}
      if(owner&&!alive){await fs.rename(lock,lock+'.abandoned.'+uid()).catch(()=>{});continue;}
      ensure(attempt<100,'BUSY','Corpus operation is in progress; retry',{lock});await new Promise(r=>setTimeout(r,50));
    }
  }
  try{return await fn();}finally{await fs.rm(lock,{recursive:true,force:true});}
}
const ajv=new Ajv2020({allErrors:true,strict:false}); (addFormats as unknown as (a:Ajv2020)=>void)(ajv);
const validators=new Map<string,Promise<any>>();
export async function validate(name:string,value:unknown){
  if(!validators.has(name)){const pending=readJson(path.join(APP,'contracts','schemas',name+'.schema.json')).then(schema=>ajv.compile(schema));validators.set(name,pending);pending.catch(()=>validators.delete(name));}
  const check=await validators.get(name)!;ensure(check(value),'VALIDATION_FAILED',`Invalid ${name}`,check.errors);
}
export function refs(value:unknown):Ref[]{
  if(!value||typeof value!=='object')return [];
  if(!Array.isArray(value) && Object.keys(value).length===2 && 'id' in value && 'revision' in value)return [value as Ref];
  return Object.values(value).flatMap(refs);
}
export function uniqueRefs(list:Ref[]){return [...new Map(list.map(r=>[key(r),ref(r)])).values()];}
export function recordRefs(r:RecordData){return uniqueRefs([...r.provenance.source_refs,...r.provenance.input_refs,...r.depends_on,...refs(r.payload),...refs(r.extensions)]);}
export function emptyAssessment(){return {level:'not_assessed' as const,rationale:'No substantive assessment has been supplied.',context:null};}
export function emptyScope(domains:string[]){return {domains,conditions:[],exclusions:[],condition_expression:null,valid_from:null,valid_until:null};}
export function subset(request:Scope,allowed:Scope):Scope{
  ensure(request.read_modules.every(m=>allowed.read_modules.includes(m))&&request.write_modules.every(m=>allowed.write_modules.includes(m))&&request.write_modules.every(m=>request.read_modules.includes(m)),'SCOPE_DENIED','Requested modules exceed the project binding');
  if(allowed.source_refs.length)ensure(request.source_refs.length&&request.source_refs.every(r=>allowed.source_refs.some(a=>key(a)===key(r))),'SCOPE_DENIED','Source restriction cannot be widened');
  return request;
}
export type Truth='true'|'false'|'unknown';
export function condition(expr:any,context:Record<string,{value:unknown;unit?:string|null}>,dimensions:Record<string,any>):Truth{
  if(!expr)return 'unknown';
  if(expr.all){const r=expr.all.map((x:any)=>condition(x,context,dimensions));return r.includes('false')?'false':r.includes('unknown')?'unknown':'true';}
  if(expr.any){const r=expr.any.map((x:any)=>condition(x,context,dimensions));return r.includes('true')?'true':r.includes('unknown')?'unknown':'false';}
  if(expr.not){const r=condition(expr.not,context,dimensions);return r==='unknown'?r:r==='true'?'false':'true';}
  const d=dimensions[expr.dimension],c=context[expr.dimension];if(!d||!c||d.type!==typeof c.value||(expr.unit??null)!==(c.unit??null))return 'unknown';
  const a=c.value as any,b=expr.value;let result:boolean;
  switch(expr.operator){case 'exists':return 'true';case 'eq':result=a===b;break;case 'ne':result=a!==b;break;case 'in':result=Array.isArray(b)&&b.includes(a);break;case 'gt':result=a>b;break;case 'gte':result=a>=b;break;case 'lt':result=a<b;break;case 'lte':result=a<=b;break;default:return 'unknown';}
  return result?'true':'false';
}

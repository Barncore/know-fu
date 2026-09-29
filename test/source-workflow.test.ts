import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import {APP,uid,hash,json,readJson,atomic,ref} from '../src/core.js';
import {Media,chunks} from '../src/media.js';
import {SourceWorkflow} from '../src/source-workflow.js';
import {Jobs} from '../src/jobs.js';
import {published} from './helpers.js';

const config={models:[{id:'wording',endpoint:'https://example.invalid/asr',model:'words',key_env:'KB_MOCK_KEY',estimated_cost_per_minute:.0045,currency:'USD'},{id:'timing',endpoint:'https://example.invalid/asr',model:'clock',key_env:'KB_MOCK_KEY',estimated_cost_per_minute:.006,currency:'USD',response_format:'verbose_json',timestamp_granularities:['word','segment']}]};
const budget={limit:2,currency:'USD',authorization:'Synthetic mock requests only'};
function mockRunner(duration=310):any{return async(_command:string,args:string[])=>{if(args.includes('ffprobe'))return {stdout:json({format:{duration},streams:[]}),stderr:''};if(args.includes('ffmpeg'))await fs.writeFile(args.at(-1)!,'encoded synthetic audio');return {stdout:args.at(-1),stderr:''};};}

test('overlapping media cores cover the full timeline including short tails',()=>{const parts=chunks(611);assert.deepEqual(parts.map(p=>[p.core_start,p.core_end]),[[0,300],[300,600],[600,611]]);assert.deepEqual(parts.map(p=>[p.start,p.end]),[[0,308],[292,608],[592,611]]);assert.throws(()=>chunks(0));});

test('two decoders retain raw responses, timing offsets and explicit join review; resume makes no calls',async()=>{
  const dir=path.join(APP,'test-output',uid('dual-'));await fs.mkdir(dir,{recursive:true});const source=path.join(dir,'input.mp3');await fs.writeFile(source,'synthetic source');let calls=0;
  const request:any=async(_url:string,options:any)=>{calls++;const model=options.body.get('model');if(model==='clock')assert.deepEqual(options.body.getAll('timestamp_granularities[]'),['word','segment']);return new Response(json({text:model==='clock'?'The sample is valid unless it is hot.':'The sample is valid only when cold.',...(model==='clock'?{words:[{word:'sample',start:1,end:1.5}],segments:[{text:'sample',start:1,end:1.5}]}:{})}),{headers:{'x-request-id':'mock-'+calls}});};
  process.env.KB_MOCK_KEY='not-a-real-key';try{
    const media=new Media(mockRunner(),request),result=await media.convert(source,dir,budget,config);
    assert.equal(calls,4);assert.equal(result.units.filter(u=>u.kind==='transcript').length,4);assert.equal(result.units.filter(u=>u.unit_id.startsWith('join-')).length,2);assert.equal(result.units.filter(u=>u.unit_id.startsWith('compare-')).length,2);
    const timing=JSON.parse(result.units.find(u=>u.unit_id==='timing-timing-1').text);assert.equal(timing.words[0].source_start,293);assert.match(timing.precision,/never transfer/);
    const again=await media.convert(source,dir,budget,config);assert.equal(calls,4);assert.deepEqual(again.units,result.units);
    await assert.rejects(()=>media.convert(source,dir,budget,{...config,overlap_seconds:9}),{code:'REVISION_CONFLICT'});assert.equal(calls,4);
    const journal=await readJson(path.join(dir,'transcription-requests.json'));await fs.appendFile(path.join(dir,`response-${journal[0].id}.json`),' ');await assert.rejects(()=>media.convert(source,dir,budget,config),{code:'SOURCE_UNREADABLE'});assert.equal(calls,4);
  }finally{delete process.env.KB_MOCK_KEY;}
});

test('complete dual-model estimate is checked before upload',async()=>{const dir=path.join(APP,'test-output',uid('preflight-'));await fs.mkdir(dir,{recursive:true});let calls=0;const m=new Media(mockRunner(),async()=>{calls++;throw Error('No request permitted');});await assert.rejects(()=>m.convert('unused',dir,{...budget,limit:.001},config),{code:'PAID_BUDGET_REQUIRED'});assert.equal(calls,0);});

test('supplemental reading copies preserve exact spans and reopen coverage without changing original mapping',async()=>{
  const f=await published(),jobs=new Jobs(f.store),source=f.store.p('lecture.mp3');await fs.writeFile(source,'synthetic media');const created=await jobs.ingest({paths:[source],module:f.scope.write_modules[0],domains:['lumen'],idempotency_key:'supplement',authorization:'Local synthetic fixture'}),id=created.job.job_id,records=await readJson(path.join(jobs.jobPath(id),'sources.json')),s=records[0];
  const folder=path.posix.dirname(s.payload.original_path)+`/extractions/${id}`,mapping=folder+'/extraction.json';
  const units=['A','B'].map((k,i)=>{const text=i?'boundary B remainder':'opening boundary A';return {unit_id:s.id+':'+k,kind:'transcript',text,sha256:hash(text),asset_path:null,details:{decoder:'wording'},locator:{kind:'time_ms',label:k,start:i*100,end:i*100+120,anchor:`extract:${id}:${k}`,precision:'approximate'}};});
  await atomic(f.store.p(mapping),json({units}));const original=hash(await fs.readFile(f.store.p(mapping)));const job=await jobs.load(id);job.stage='compile';job.coverage=units.map(u=>({unit_id:u.unit_id,source_ref:ref(s),locator:u.locator,registered:'complete',converted:'complete',read:'complete',integrated:'complete',checked:'complete',receipts:[mapping],gaps:[],exclusion_reason:null})) as any;await jobs.save(job);
  const workflow=new SourceWorkflow(jobs),request={action:'reading_copy',source_id:s.id,spans:[{unit_id:units[0].unit_id,start:0,end:7},{unit_id:units[1].unit_id,start:11,end:20}],rationale:'Reviewed the overlap against both original text chunks; these spans retain the intended words.'};
  const result:any=await workflow.call(id,request);assert.equal(result.added,1);assert.equal((await jobs.load(id)).stage,'reconstruct');assert.equal(hash(await fs.readFile(f.store.p(mapping))),original);
  const read=await jobs.readUnit(id,result.units[0].unit_id);assert.equal(read.text,'opening\nremainder');assert.equal(read.details.origins.length,2);assert.equal((await workflow.call(id,request) as any).added,0);
  await f.store.verifyLocator({payload:{text:read.text,extraction_sha256:read.extraction_sha256,locator:read.locator,asset_path:null}} as any,s);
  await assert.rejects(()=>workflow.call(id,{...request,spans:[{unit_id:units[0].unit_id,start:0,end:999}]}),{code:'LOCATOR_UNRESOLVED'});
  await assert.rejects(()=>workflow.call(id,{action:'source_review',source_id:s.id,review_id:'bad',review:{summary:'A substantive review with an invalid source link.',evidence_unit_ids:['foreign-unit']}}),{code:'LOCATOR_UNRESOLVED'});
  const review:any=await workflow.call(id,{action:'source_review',source_id:s.id,review_id:'good',review:{summary:'Read both chunks and retained an unresolved pronunciation difference.',evidence_unit_ids:[units[0].unit_id]}});assert.equal(review.canonical,false);
});

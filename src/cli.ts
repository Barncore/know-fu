#!/usr/bin/env node
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { KnowledgeSystem, descriptions } from './api.js';
import { Store } from './store.js';
import { APP, VERSION, KBError, json, readJson } from './core.js';
const args=process.argv.slice(2),command=args.shift()??'help';
function option(name:string,fallback:string){const i=args.indexOf(name);if(i<0)return fallback;const v=args[i+1];args.splice(i,2);return v;}
const root=option('--corpus',process.env.KB_CORPUS??path.resolve(APP,'../knowledge-library'));
const project=option('--project',process.env.KB_PROJECT??process.cwd());
try{
  if(command==='help'){console.log(json({commands:descriptions,usage:'node dist/cli.js kb_status --corpus PATH --project PROJECT_ID --input request.json',init:'node dist/cli.js init --corpus PATH --project PROJECT_ID --input corpus.json'}));}
  else{const file=option('--input','');let input:any={};if(file)input=await readJson(file);else if(!process.stdin.isTTY){let data='';for await(const chunk of process.stdin)data+=chunk;if(data.trim())input=JSON.parse(data);}
    const store=new Store(root,project);if(command==='init')console.log(json(await store.init(input)));else console.log(json(await new KnowledgeSystem(store).call(command,input)));
  }
}catch(e:any){console.error(json({error:e.code??'INTERNAL_ERROR',message:e.message,details:e.details??null,resumable:e.resumable??false}));process.exitCode=1;}

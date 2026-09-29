import { compile } from 'json-schema-to-typescript';
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
await mkdir('src/generated', {recursive:true});
for (const file of await readdir('contracts/schemas')) {
  const name = file.replace('.schema.json','').split('-').map(s=>s[0].toUpperCase()+s.slice(1)).join('')+'Data';
  const schema = JSON.parse(await readFile(`contracts/schemas/${file}`,'utf8'));
  delete schema.title; delete schema.$id;
  await writeFile(`src/generated/${file.replace('.schema.json','.ts')}`,await compile(schema,name,{bannerComment:'/* Generated from the canonical JSON Schema. Do not edit. */',unreachableDefinitions:true,ignoreMinAndMaxItems:true}));
}

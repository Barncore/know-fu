import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';

const usage = `Usage: node scripts/configure-embedder.mjs --state PATH --embedder local|api|off [--url URL] [--model MODEL] [--key-env NAME | --key-file PATH] [--dimensions N]

Sets which model embeds a library for semantic search, in <state>/config.json, keeping every other setting.
  local  QMD's EmbeddingGemma on this machine's CPU (the default; 75 to 90 minutes for a 364-page book on 16 cores)
  api    any OpenAI-compatible /embeddings endpoint: OpenRouter, OpenAI, or a local Ollama or LM Studio server
  off    keyword and link search only
For api, --url is the base URL (https://openrouter.ai/api/v1), --model the model id (openai/text-embedding-3-small),
and --key-env the name of the environment variable that holds the key (OPENROUTER_API_KEY). For a host that doesn't
pass environment variables on, --key-file is the absolute path of a file you create holding only the key. This script
never writes the key. A server on localhost needs no key. --dimensions keeps the first N dimensions, only for models
trained for it. The old config.json is kept as config.json.bak. Run kb_maintain reindex afterwards.`;

export const options = {
  state: { type: 'string' },
  embedder: { type: 'string' },
  url: { type: 'string' },
  model: { type: 'string' },
  'key-env': { type: 'string' },
  'key-file': { type: 'string' },
  dimensions: { type: 'string' },
  help: { type: 'boolean' },
};

/**
 * The `embedder` setting for config.json, from parsed flags. Throws an Error with a plain
 * message when the flags don't make a valid setting. Shared with create-library.mjs.
 */
export function embedderSetting(values) {
  const provider = values.embedder ?? 'local';
  if (!['local', 'api', 'off'].includes(provider)) throw Error('--embedder is local, api or off.');
  if (provider !== 'api') {
    if (values.url || values.model || values['key-env'] || values['key-file']) throw Error('--url, --model, --key-env and --key-file go with --embedder api.');
    return { provider };
  }
  if (!/^https?:\/\//.test(values.url ?? '')) throw Error('--embedder api needs --url, the endpoint base, for example https://openrouter.ai/api/v1.');
  if (!values.model) throw Error('--embedder api needs --model, for example openai/text-embedding-3-small.');
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(new URL(values.url).hostname);
  if (!values['key-env'] && !values['key-file'] && !local) throw Error('--embedder api needs --key-env (the name of the environment variable holding the key, such as OPENROUTER_API_KEY) or --key-file (the path of a file you made that holds it).');
  if (values['key-file'] && !path.isAbsolute(values['key-file'])) throw Error('--key-file needs an absolute path.');
  if (values['key-env'] && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(values['key-env'])) throw Error('--key-env is an environment variable name, not the key itself.');
  const setting = { provider, base_url: values.url.replace(/\/+$/, ''), model: values.model };
  if (values['key-env']) setting.api_key_env = values['key-env'];
  if (values['key-file']) setting.api_key_file = values['key-file'];
  if (values.dimensions !== undefined) {
    const n = Number(values.dimensions);
    if (!Number.isInteger(n) || n < 8) throw Error('--dimensions is a whole number of dimensions to keep, such as 768.');
    setting.dimensions = n;
  }
  return setting;
}

async function main() {
  let values;
  try {
    ({ values } = parseArgs({ options, allowPositionals: false }));
  } catch (error) {
    console.error(`${error.message}\n\n${usage}`);
    process.exit(2);
  }
  if (values.help) return console.log(usage);
  const fail = (message) => {
    console.error(message);
    process.exit(2);
  };
  if (!values.state || !path.isAbsolute(values.state)) fail('--state needs the absolute path of the state folder.');
  const file = path.join(values.state, 'config.json');
  if (!existsSync(file)) fail(`No config.json in ${values.state}. Create the library with create-library.mjs first.`);
  let setting;
  try {
    setting = embedderSetting(values);
  } catch (error) {
    fail(error.message);
  }
  const text = await fs.readFile(file, 'utf8');
  const config = JSON.parse(text.replace(/^﻿/, ''));
  await fs.writeFile(file + '.bak', text);
  config.embedder = setting;
  await fs.writeFile(file, JSON.stringify(config, null, 2) + '\n');
  console.log(JSON.stringify({ config: file, backup: file + '.bak', embedder: setting, next: 'Run kb_maintain {action:"reindex"}; kb_status shows progress under views.semantic.' }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();

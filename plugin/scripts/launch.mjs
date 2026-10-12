// Starts the Know Fu engine for one chat. Settings come from Know Fu's own config file rather than
// the host's plugin options: the Claude desktop app hands installed plugins to Claude Code as bare
// folders, and options saved for the installed plugin never reach that copy, so a launch that
// depended on them was dropped without an error. The engine is imported into this process, not
// spawned, so the launcher costs no extra memory.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { pathToFileURL } from 'node:url';

const configPath = process.env.KNOW_FU_CONFIG || path.join(os.homedir(), '.know-fu', 'config.json');
const actor = String(process.env.KB_ACTOR ?? '').trim().toLowerCase();

// A host that can't fill a placeholder may pass it through literally; treat that as unset.
const given = value => (typeof value === 'string' && value.trim() && !value.includes('${') ? value : undefined);

function settings() {
  if (!fs.existsSync(configPath)) return { problem: `There's no Know Fu config file at ${configPath}.` };
  let config;
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (error) {
    return { problem: `The Know Fu config file at ${configPath} isn't valid JSON: ${error.message}` };
  }
  // A section for this agent overrides the shared values, so Claude and Codex can use different libraries.
  const merged = { ...config, ...(config.agents?.[actor] ?? {}) };
  delete merged.agents;
  const missing = ['engine', 'library', 'state'].filter(key => !given(merged[key]));
  if (missing.length) return { problem: `The Know Fu config file at ${configPath} has no ${missing.join(', ')} for ${actor || 'this agent'}.` };
  const entry = path.join(merged.engine, 'dist', 'mcp.js');
  if (!fs.existsSync(entry)) return { problem: `The engine folder ${merged.engine} has no dist/mcp.js. Build it with npm ci and npm run build.` };
  return { merged, entry };
}

const { merged, entry, problem } = settings();
if (problem) serveSetupNotice(problem);
else {
  // Variables already set by the host win, so a test or a hand-written launcher can override the file.
  const env = {
    KB_CORPUS: merged.library,
    KB_STATE_DIR: merged.state,
    KB_MEDIA_RUNTIME: merged.media ?? 'native',
    KB_WSL_DISTRO: merged.wsl_distro ?? 'Ubuntu',
    KB_ADVANCED_TOOLS: merged.specialist_tools ? 'true' : 'false',
  };
  for (const [key, value] of Object.entries(env)) if (!given(process.env[key])) process.env[key] = String(value);
  // The caller's folder is its identity for library bindings. Fall back to the folder the host started us in.
  process.env.KB_PROJECT = given(process.env.KB_PROJECT) ?? given(process.env.CLAUDE_PROJECT_DIR) ?? process.cwd();
  await import(pathToFileURL(entry).href);
}

// Without settings there's no engine to run, but a server that never appears looks like a host fault.
// So answer the MCP handshake with one kb_status tool that says what's missing and how to fix it.
function serveSetupNotice(problem) {
  const notice = [
    'KNOWFU_NOT_CONFIGURED',
    problem,
    'Know Fu is installed, but this machine has no settings for it yet, so its tools are unavailable.',
    'Fix: ask the agent to run Know Fu setup, following plugin/docs/setup-ai.md in the Know Fu repository, which writes this file. Then start a new chat.',
  ].join('\n');
  process.stderr.write(`[know-fu] ${problem}\n`);
  const send = message => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', ...message }) + '\n');
  readline.createInterface({ input: process.stdin }).on('line', line => {
    let request;
    try {
      request = JSON.parse(line);
    } catch {
      return;
    }
    const { id, method, params } = request;
    if (id === undefined) return;
    if (method === 'initialize')
      send({ id, result: { protocolVersion: params?.protocolVersion ?? '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'know-fu', version: 'not-configured' } } });
    else if (method === 'tools/list')
      send({ id, result: { tools: [{ name: 'kb_status', description: 'Report why Know Fu is not available on this machine and how to set it up.', inputSchema: { type: 'object', properties: {} } }] } });
    else if (method === 'tools/call') send({ id, result: { content: [{ type: 'text', text: notice }], isError: true } });
    else if (method === 'ping') send({ id, result: {} });
    else send({ id, error: { code: -32601, message: `Method not found: ${method}` } });
  });
}

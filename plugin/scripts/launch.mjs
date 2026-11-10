// Starts Know Fu's MCP server for one chat. The engine is TypeScript that Node runs directly, so there
// is no build step and nothing to install: this file checks Node is new enough, then imports the server.
// Settings come from Know Fu's own config file (~/.know-fu/config.json), read by the engine on each call,
// so a config change takes effect without restarting the chat.
import readline from 'node:readline';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const [major, minor] = process.versions.node.split('.').map(Number);
// Running .ts files without a flag arrived in Node 22.18 and 23.6. node:sqlite needs 22.5.
const ok = major > 23 || (major === 23 && minor >= 6) || (major === 22 && minor >= 18);

// A host that can't fill a placeholder may pass it through literally; treat that as unset.
for (const key of ['KB_PROJECT', 'CLAUDE_PROJECT_DIR']) if (process.env[key]?.includes('${')) delete process.env[key];

if (ok) await import(pathToFileURL(path.join(import.meta.dirname, '..', 'engine', 'mcp.ts')).href);
else serveNotice(`Know Fu needs Node 22.18 or newer (24 recommended); this machine's "node" is ${process.versions.node}. Install a newer Node, then start a new chat.`);

// A server that never appears looks like a host fault. So answer the handshake with one tool that says what's wrong.
function serveNotice(problem) {
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
    if (id === undefined || id === null) return;
    if (method === 'initialize') send({ id, result: { protocolVersion: params?.protocolVersion ?? '2025-06-18', capabilities: { tools: {} }, serverInfo: { name: 'know-fu', version: 'unavailable' } } });
    else if (method === 'tools/list') send({ id, result: { tools: [{ name: 'kf_status', description: 'Report why Know Fu is not available on this machine.', inputSchema: { type: 'object', properties: {} } }] } });
    else if (method === 'tools/call') send({ id, result: { content: [{ type: 'text', text: `NOT_AVAILABLE: ${problem}` }], isError: true } });
    else if (method === 'ping') send({ id, result: {} });
    else send({ id, error: { code: -32601, message: `Method not found: ${method}` } });
  });
}

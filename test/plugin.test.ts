// The parts a host runs as separate processes: the MCP server, the gate, the session hook and the command line.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { checkLibrary } from '../plugin/engine/check.ts';
import { runTool, TOOLS } from '../plugin/engine/tools.ts';
import { builtLibrary, ENGINE, PLUGIN } from './helpers.ts';

function rpc(env: Record<string, string>, requests: object[]): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(PLUGIN, 'scripts', 'launch.mjs')], { env: { ...process.env, ...env }, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let err = '';
    child.stdout.on('data', d => (out += d));
    child.stderr.on('data', d => (err += d));
    child.on('error', reject);
    child.on('close', () => {
      try {
        resolve(
          out
            .split('\n')
            .filter(Boolean)
            .map(l => JSON.parse(l)),
        );
      } catch (error) {
        reject(new Error(`server wrote something that isn't JSON: ${out}\n${err}\n${error}`));
      }
    });
    for (const request of requests) child.stdin.write(JSON.stringify({ jsonrpc: '2.0', ...request }) + '\n');
    child.stdin.end();
  });
}

test('the MCP server answers the handshake, lists the tools and runs one', async () => {
  const fx = await builtLibrary();
  try {
    checkLibrary(fx.root, { fix: true });
    const replies = await rpc({ KNOW_FU_CONFIG: fx.config, KB_PROJECT: fx.root }, [
      { id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '0' } } },
      { method: 'notifications/initialized' },
      { id: 2, method: 'tools/list' },
      { id: 3, method: 'tools/call', params: { name: 'kf_recall', arguments: { query: 'body reduction cone 010' } } },
      { id: 4, method: 'tools/call', params: { name: 'kf_read', arguments: { ref: 'no-such-thing-at-all' } } },
      { id: 5, method: 'resources/list' },
      { id: 6, method: 'ping' },
    ]);
    const byId = new Map(replies.map(r => [r.id, r]));
    assert.equal(replies.length, 6, 'a notification gets no reply');
    assert.equal(byId.get(1).result.protocolVersion, '2025-06-18');
    assert.equal(byId.get(1).result.serverInfo.name, 'know-fu');
    assert.deepEqual(byId.get(2).result.tools.map((t: any) => t.name), TOOLS.map(t => t.name));
    for (const tool of byId.get(2).result.tools) assert.equal(tool.inputSchema.type, 'object');
    assert.match(byId.get(3).result.content[0].text, /Body reduction only works before the body seals/);
    assert.equal(byId.get(4).result.isError, true);
    assert.match(byId.get(4).result.content[0].text, /^NOT_FOUND:/);
    assert.equal(byId.get(5).error.code, -32601);
    assert.deepEqual(byId.get(6).result, {});
  } finally {
    fx.cleanup();
  }
});

test('tool descriptions stay small: they are in context for every chat that uses Know Fu', () => {
  const size = JSON.stringify(TOOLS.map(({ name, description, inputSchema }) => ({ name, description, inputSchema }))).length;
  assert.ok(size < 9000, `tool definitions are ${size} characters`);
});

function gate(mode: string, event: object, env: Record<string, string>) {
  return spawnSync(process.execPath, [path.join(PLUGIN, 'scripts', 'gate.mjs'), mode], { input: JSON.stringify(event), env: { ...process.env, ...env }, encoding: 'utf8' });
}

test('the gate keeps tools closed until the user invokes the skill, or the project is pinned', async () => {
  const fx = await builtLibrary();
  try {
    const project = path.join(fx.dir, 'strategy-lab');
    fs.mkdirSync(project);
    const env = { KNOW_FU_CONFIG: fx.config, CLAUDE_PROJECT_DIR: project };
    const session = `gate-test-${process.pid}-${Date.now()}`;
    const denied = gate('tool', { session_id: session, cwd: project }, env);
    assert.equal(JSON.parse(denied.stdout).hookSpecificOutput.permissionDecision, 'deny');
    // An ordinary prompt doesn't open it; the typed command does.
    gate('prompt', { session_id: session, prompt: 'tell me about /know-fu:know-fu' }, env);
    assert.match(gate('tool', { session_id: session, cwd: project }, env).stdout, /deny/);
    gate('prompt', { session_id: session, prompt: '/know-fu:know-fu what does the library say about holds?' }, env);
    assert.equal(gate('tool', { session_id: session, cwd: project }, env).stdout, '');
    // A pinned project is open from the first call, however the folder is spelled.
    process.env.KB_PROJECT = project;
    await runTool('kf_pin', { topic: 'wood-firing' });
    const other = `gate-test-pinned-${process.pid}-${Date.now()}`;
    assert.equal(gate('tool', { session_id: other, cwd: project }, { ...env, CLAUDE_PROJECT_DIR: project.replace(/\\/g, '/') }).stdout, '');
    // Somewhere unpinned stays closed, and deliberate_use false opens everything.
    const elsewhere = path.join(fx.dir, 'elsewhere');
    fs.mkdirSync(elsewhere);
    const third = `gate-test-elsewhere-${process.pid}-${Date.now()}`;
    assert.match(gate('tool', { session_id: third, cwd: elsewhere }, { ...env, CLAUDE_PROJECT_DIR: elsewhere }).stdout, /deny/);
    const config = JSON.parse(fs.readFileSync(fx.config, 'utf8'));
    fs.writeFileSync(fx.config, JSON.stringify({ ...config, deliberate_use: false }));
    assert.equal(gate('tool', { session_id: `${third}-b`, cwd: elsewhere }, { ...env, CLAUDE_PROJECT_DIR: elsewhere }).stdout, '');
  } finally {
    fx.cleanup();
  }
});

test('a pinned project starts its sessions with the topic\'s principles; other projects get nothing', async () => {
  const fx = await builtLibrary();
  try {
    checkLibrary(fx.root, { fix: true });
    const project = path.join(fx.dir, 'kiln-controller');
    fs.mkdirSync(project);
    const run = (dir: string) =>
      spawnSync(process.execPath, [path.join(PLUGIN, 'scripts', 'session.mjs')], { input: JSON.stringify({ session_id: 's', cwd: dir, source: 'startup' }), env: { ...process.env, KNOW_FU_CONFIG: fx.config, CLAUDE_PROJECT_DIR: dir }, encoding: 'utf8' });
    assert.equal(run(project).stdout, '');
    process.env.KB_PROJECT = project;
    await runTool('kf_pin', { topic: 'ceramics/wood-firing' });
    const out = JSON.parse(run(project).stdout).hookSpecificOutput;
    assert.equal(out.hookEventName, 'SessionStart');
    assert.match(out.additionalContext, /\*\*Heat work matures ware\.\*\* Ware matures by temperature held over time/);
    assert.match(out.additionalContext, /kf_brief/);
    assert.ok(out.additionalContext.length < 9600);
    // A broken config never blocks a session from starting.
    fs.writeFileSync(fx.config, '{ not json');
    const broken = run(project);
    assert.equal(broken.status, 0);
    assert.equal(broken.stdout, '');
  } finally {
    fx.cleanup();
  }
});

test('the command line runs the same tools', async () => {
  const fx = await builtLibrary();
  try {
    const cli = (...args: string[]) => spawnSync(process.execPath, [path.join(ENGINE, 'cli.ts'), ...args], { env: { ...process.env, KNOW_FU_CONFIG: fx.config, KB_PROJECT: fx.root }, encoding: 'utf8' });
    const check = cli('check');
    assert.match(check.stdout, /No errors\./);
    assert.match(cli('recall', 'when do I start body reduction', '--topic', 'wood-firing').stdout, /cone 010/);
    assert.match(cli('read', 'WKH', 's.2').stdout, /Hold the kiln for forty minutes/);
    assert.match(cli('new', 'ceramics/glazes', '--title', 'Glazes').stdout, /Created knowledge\/ceramics\/glazes\/TOPIC\.md/);
    const bad = cli('read', 'nothing-here-at-all');
    assert.equal(bad.status, 1);
    assert.match(bad.stderr, /NOT_FOUND/);
    assert.match(cli('status').stdout, /1 domains, 2 topics/);
  } finally {
    fx.cleanup();
  }
});

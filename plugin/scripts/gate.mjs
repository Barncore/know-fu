// Keeps Know Fu deliberate in Claude Code. The skill is manual-only, but the engine's tools are listed
// in every chat where the plugin is on, so a model could call them without the skill. This hook opens
// the tools only after the user has invoked /know-fu:know-fu in the chat, or in a project the owner
// pinned a topic to.
//   node gate.mjs prompt   (UserPromptSubmit) notes an invocation typed by the user
//   node gate.mjs tool     (PreToolUse on Know Fu's tools) denies the call until the chat is open
// Setting "deliberate_use": false in ~/.know-fu/config.json turns the gate off.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const mode = process.argv[2];
const markers = path.join(os.tmpdir(), 'know-fu-gate');
// The command as the user types it, and the forms Claude Code records when a skill is invoked.
const typed = /^\s*\/know-fu(?::know-fu)?(?:\s|$)/;
const recorded = [/<command-name>\/know-fu(?::know-fu)?<\/command-name>/, /"skill":"know-fu(?::know-fu)?"/];

const input = await new Promise(resolve => {
  let data = '';
  process.stdin.on('data', chunk => (data += chunk)).on('end', () => resolve(data));
});

try {
  const event = JSON.parse(input || '{}');
  const marker = path.join(markers, String(event.session_id ?? 'unknown').replace(/[^\w.-]/g, '_'));
  if (mode === 'prompt') {
    if (typed.test(String(event.prompt ?? ''))) open(marker);
  } else if (mode === 'tool') {
    const config = settings();
    if (config.deliberate_use === false || fs.existsSync(marker) || pinned(config, event.cwd) || invokedInTranscript(event.transcript_path)) {
      open(marker);
    } else {
      deny("Know Fu only runs when the user asks for it. The user hasn't invoked /know-fu:know-fu in this chat and no topic is pinned to this project, so its tools stay closed. If the user wants the library, ask them to start their request with /know-fu:know-fu.");
    }
  }
} catch (error) {
  // Fail closed for tool calls, with the reason, rather than letting a broken gate wave everything through.
  if (mode === 'tool') deny(`Know Fu's gate couldn't check this call (${error.message}). Ask the user to start their request with /know-fu:know-fu.`);
}

function open(marker) {
  fs.mkdirSync(markers, { recursive: true });
  fs.writeFileSync(marker, new Date().toISOString());
}

function settings() {
  try {
    return JSON.parse(fs.readFileSync(process.env.KNOW_FU_CONFIG || path.join(os.homedir(), '.know-fu', 'config.json'), 'utf8'));
  } catch {
    return {};
  }
}

// Two agents can spell one folder two ways (slashes, drive-letter case), so compare a normalized form.
function same(a, b) {
  const norm = p => {
    const full = path.resolve(p).replace(/\\/g, '/').replace(/\/+$/, '');
    return process.platform === 'win32' ? full.toLowerCase() : full;
  };
  return norm(a) === norm(b);
}

function pinned(config, cwd) {
  const project = process.env.CLAUDE_PROJECT_DIR || cwd;
  if (!project) return false;
  return Object.entries(config.pins ?? {}).some(([folder, topics]) => Array.isArray(topics) && topics.length > 0 && same(folder, project));
}

// The prompt hook can miss an invocation, for example one picked from a menu, so check the chat's own record too.
function invokedInTranscript(file) {
  if (!file || !fs.existsSync(file)) return false;
  const text = fs.readFileSync(file, 'utf8');
  return recorded.some(pattern => pattern.test(text));
}

function deny(reason) {
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } }));
}

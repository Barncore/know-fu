import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { MediaRuntime } from "../src/media-runtime.js";
import { APP, uid, readJson } from "../src/core.js";

test("native Windows media preserves literal paths without invoking WSL", async () => {
  const calls: any[] = [];
  const runner: any = async (...args: any[]) => {
    calls.push(args);
    return { stdout: "", stderr: "", elapsed_ms: 0 };
  };
  const media = new MediaRuntime(runner, "win32", "native");
  const original = "D:/Research & media/video.mp4";
  assert.equal(await media.file(original), original);
  await media.exec("ffprobe", ["-i", original]);
  assert.deepEqual(calls[0].slice(0, 2), ["ffprobe", ["-i", original]]);
});
test("WSL media honors the selected distribution and avoids shell interpretation", async () => {
  const calls: any[] = [];
  const runner: any = async (...args: any[]) => {
    calls.push(args);
    return { stdout: "/mnt/d/file\n", stderr: "", elapsed_ms: 0 };
  };
  const media = new MediaRuntime(runner, "win32", "wsl", "ResearchLinux");
  await media.file("D:/file");
  await media.exec("ffmpeg", ["-vf", "select=gte(t\\,2)"]);
  assert.deepEqual(calls[0][1].slice(0, 4), [
    "-d",
    "ResearchLinux",
    "--exec",
    "wslpath",
  ]);
  assert.deepEqual(calls[1][1], [
    "-d",
    "ResearchLinux",
    "--exec",
    "ffmpeg",
    "-vf",
    "select=gte(t\\,2)",
  ]);
});
test("plugin configuration records chosen paths and refuses to overwrite another configuration", async () => {
  const dir = path.join(APP, "test-output", uid("setup-"));
  await fs.mkdir(dir, { recursive: true });
  const settings = path.join(dir, "config.json"),
    launcher = path.join(dir, "mcp.json"),
    args = (state: string) => [
      path.join(APP, "scripts/configure-plugin.mjs"),
      "--agent",
      "codex",
      "--library",
      path.join(dir, "library"),
      "--state",
      state,
      "--media",
      "native",
      "--config",
      settings,
      "--output",
      launcher,
    ];
  const first = spawnSync(process.execPath, args(path.join(dir, "state")), {
    encoding: "utf8",
  });
  assert.equal(first.status, 0, first.stderr);
  const config = await readJson(settings);
  assert.equal(config.agents.codex.state, path.join(dir, "state"));
  assert.equal(config.agents.codex.engine, APP);
  assert.equal(config.deliberate_use, true);
  const server = (await readJson(launcher)).mcpServers["know-fu"];
  assert.equal(server.args[0], path.join(APP, "plugin/scripts/launch.mjs"));
  assert.equal(server.env.KB_ACTOR, "codex");
  assert.equal(server.env.KNOW_FU_CONFIG, settings);
  const before = [await fs.readFile(settings), await fs.readFile(launcher)];
  // A rerun refuses the existing launcher, and a different path refuses the existing section; neither writes.
  for (const state of [path.join(dir, "state"), path.join(dir, "other")]) {
    const again = spawnSync(process.execPath, args(state), {
      encoding: "utf8",
    });
    assert.notEqual(again.status, 0);
    assert.deepEqual(
      [await fs.readFile(settings), await fs.readFile(launcher)],
      before,
    );
  }
});
test("the launcher reports a missing setup through kb_status instead of failing silently", () => {
  const messages = [
    {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-06-18" },
    },
    { jsonrpc: "2.0", id: 2, method: "tools/list" },
    {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: { name: "kb_status", arguments: {} },
    },
  ];
  const run = spawnSync(
    process.execPath,
    [path.join(APP, "plugin/scripts/launch.mjs")],
    {
      encoding: "utf8",
      input: messages.map((m) => JSON.stringify(m)).join("\n") + "\n",
      env: {
        ...process.env,
        KB_ACTOR: "claude",
        KNOW_FU_CONFIG: path.join(
          APP,
          "test-output",
          uid("absent-"),
          "config.json",
        ),
      },
    },
  );
  const replies = run.stdout
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line));
  assert.deepEqual(
    replies[1].result.tools.map((t: any) => t.name),
    ["kb_status"],
  );
  assert.equal(replies[2].result.isError, true);
  assert.match(replies[2].result.content[0].text, /^KNOWFU_NOT_CONFIGURED/);
});
test("the gate keeps Know Fu's tools closed until the user invokes the skill in that chat", async () => {
  const gate = path.join(APP, "plugin/scripts/gate.mjs"),
    session = uid("gate-test-"),
    env = {
      ...process.env,
      KNOW_FU_CONFIG: path.join(
        APP,
        "test-output",
        uid("absent-"),
        "config.json",
      ),
    };
  const hook = (mode: string, event: object) =>
    spawnSync(process.execPath, [gate, mode], {
      encoding: "utf8",
      input: JSON.stringify({ session_id: session, ...event }),
      env,
    });
  const call = { tool_name: "mcp__plugin_know-fu_know-fu__kb_status" };
  try {
    const closed = JSON.parse(hook("tool", call).stdout);
    assert.equal(closed.hookSpecificOutput.permissionDecision, "deny");
    // Mentioning the command later in a prompt isn't an invocation.
    hook("prompt", { prompt: "what does /know-fu:know-fu do?" });
    assert.equal(
      JSON.parse(hook("tool", call).stdout).hookSpecificOutput
        .permissionDecision,
      "deny",
    );
    hook("prompt", {
      prompt: "/know-fu:know-fu what does the library say about X?",
    });
    assert.equal(hook("tool", call).stdout, "");
  } finally {
    // The gate keeps its marker in the system temp folder; this made-up session's marker goes with the test.
    await fs.rm(path.join(os.tmpdir(), "know-fu-gate", session), {
      force: true,
    });
  }
});
test("the Codex install copies the whole plugin, replaces the old copy and leaves the checkout alone", async () => {
  const dir = path.join(APP, "test-output", uid("install-")),
    target = path.join(dir, "plugins", "know-fu"),
    backup = path.join(dir, "previous"),
    mcp = path.join(APP, "plugin/.mcp.json"),
    exists = (p: string) =>
      fs.stat(p).then(
        () => true,
        () => false,
      );
  // The install needs Codex's machine-local launch file; a checkout set up for Codex already has one.
  const placeholder = !(await exists(mcp));
  if (placeholder) await fs.writeFile(mcp, "{}\n");
  try {
    await fs.mkdir(target, { recursive: true });
    await fs.writeFile(path.join(target, "left-over.md"), "older version");
    const watched = ["plugin/release.json", "plugin/engine-contracts.json"],
      read = () =>
        Promise.all(watched.map((f) => fs.readFile(path.join(APP, f))));
    const before = await read();
    const run = spawnSync(
      process.execPath,
      [
        path.join(APP, "scripts/install-plugin.mjs"),
        "--target",
        target,
        "--backup",
        backup,
      ],
      { encoding: "utf8" },
    );
    assert.equal(run.status, 0, run.stderr);
    assert.deepEqual(await read(), before);
    const files = async (root: string) =>
      (await fs.readdir(root, { recursive: true, withFileTypes: true }))
        .filter((e) => e.isFile())
        .map((e) => path.relative(root, path.join(e.parentPath, e.name)))
        .sort();
    assert.deepEqual(
      await files(target),
      await files(path.join(APP, "plugin")),
    );
    assert.deepEqual(await files(backup), ["left-over.md"]);
  } finally {
    if (placeholder) await fs.rm(mcp, { force: true });
  }
});
test("runtime state root selects the deletion ledger without changing the corpus location", () => {
  const state = path.join(APP, "test-output", uid("state-"));
  const code =
    "import {STATE} from './src/core.ts';import {Store} from './src/store.ts';console.log(JSON.stringify({state:STATE,ledger:new Store('corpus','project').ledgerRoot}));";
  const child = spawnSync(
    process.execPath,
    ["--import", "tsx", "--input-type=module", "-e", code],
    {
      cwd: APP,
      env: { ...process.env, KB_STATE_DIR: state },
      encoding: "utf8",
    },
  );
  assert.equal(child.status, 0, child.stderr);
  assert.deepEqual(JSON.parse(child.stdout), {
    state,
    ledger: path.join(state, "ledgers"),
  });
});

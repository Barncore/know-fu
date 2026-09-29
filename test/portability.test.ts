import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
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
  const file = path.join(dir, "mcp.json"),
    args = [
      path.join(APP, "scripts/configure-plugin.mjs"),
      "--corpus",
      path.join(dir, "corpus"),
      "--state",
      path.join(dir, "state"),
      "--media",
      "native",
      "--output",
      file,
    ];
  const first = spawnSync(process.execPath, args, { encoding: "utf8" });
  assert.equal(first.status, 0, first.stderr);
  const config = await readJson(file);
  assert.equal(
    config.mcpServers["know-fu"].env.KB_STATE_DIR,
    path.join(dir, "state"),
  );
  const bytes = await fs.readFile(file);
  const second = spawnSync(process.execPath, args, { encoding: "utf8" });
  assert.notEqual(second.status, 0);
  assert.deepEqual(await fs.readFile(file), bytes);
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

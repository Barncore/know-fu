import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { APP, uid } from "../src/core.js";

test("document conversion emits UTF-8 JSON even with a legacy Windows console encoding", async (t) => {
  const python =
    process.env.KB_TEST_PYTHON ??
    path.join(
      APP,
      ".venv",
      process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
    );
  const available = spawnSync(python, ["-c", "import bs4"], {
    windowsHide: true,
  });
  if (available.error || available.status !== 0) {
    t.skip(
      "Optional document runtime unavailable; set KB_TEST_PYTHON to run this integration test.",
    );
    return;
  }
  const dir = path.join(APP, "test-output", uid("unicode-"));
  await fs.mkdir(dir, { recursive: true });
  const source = path.join(dir, "math.html");
  await fs.writeFile(
    source,
    '<meta charset="utf-8"><p>Uncertainty: ν = 8; σ = 2; 漢字; �</p>',
  );
  const result = spawnSync(
    python,
    [path.join(APP, "scripts/convert.py"), source, dir],
    {
      encoding: "utf8",
      windowsHide: true,
      env: { ...process.env, PYTHONIOENCODING: "cp1252" },
    },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    JSON.parse(result.stdout).units[0].text,
    "Uncertainty: ν = 8; σ = 2; 漢字; �",
  );
});

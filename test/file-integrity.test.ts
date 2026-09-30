import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import path from "node:path";
import {
  APP,
  uid,
  hash,
  fileHash,
  immutableCopy,
  snapshotFile,
  checkSnapshot,
} from "../src/core.js";

test("streamed preservation verifies bytes and refuses changed originals or immutable replacements", async () => {
  const dir = path.join(APP, "test-output", uid("file-integrity-"));
  await fs.mkdir(dir, { recursive: true });
  const source = path.join(dir, "source"),
    target = path.join(dir, "copy");
  await fs.writeFile(source, "original bytes");
  const digest = await fileHash(source),
    snapshot = await snapshotFile(source);
  assert.equal(digest, hash("original bytes"));
  await immutableCopy(source, target, digest);
  await immutableCopy(source, target, digest);
  await checkSnapshot(source, snapshot);
  await fs.writeFile(source, "altered bytes!");
  await assert.rejects(() => checkSnapshot(source, snapshot), {
    code: "SOURCE_UNREADABLE",
  });
  await assert.rejects(() => immutableCopy(source, target, digest), {
    code: "SOURCE_UNREADABLE",
  });
  await assert.rejects(
    () => immutableCopy(source, target, hash("altered bytes!")),
    { code: "REVISION_CONFLICT" },
  );
  assert.equal(await fileHash(target), digest);
});

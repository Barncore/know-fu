import { test } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { APP, uid, readJson, json, atomic, fileHash } from "../src/core.js";
import { Jobs } from "../src/jobs.js";
import { published } from "./helpers.js";

const python =
  process.env.KB_TEST_PYTHON ??
  path.join(
    APP,
    ".venv",
    process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
  );
function pythonReady() {
  return (
    spawnSync(
      python,
      ["-c", "import docling_core, pypdf, pypdfium2, ebooklib, PIL"],
      { windowsHide: true },
    ).status === 0
  );
}

test("Docling character provenance retains correct pages and flags ambiguous spans", (t) => {
  if (!pythonReady())
    return t.skip("Optional document runtime unavailable; set KB_TEST_PYTHON.");
  const result = spawnSync(
    python,
    [path.join(APP, "test/pdf_extraction_test.py")],
    { encoding: "utf8", windowsHide: true },
  );
  assert.equal(result.status, 0, result.stderr);
});

test("PDF and EPUB conversions preserve pages and readable visuals at long Windows paths", async (t) => {
  if (!pythonReady())
    return t.skip("Optional document runtime unavailable; set KB_TEST_PYTHON.");
  const f = await published("document-formats-" + "deep-".repeat(18)),
    dir = path.join(f.store.root, "synthetic");
  const generated = spawnSync(
    python,
    [path.join(APP, "test/document_fixtures.py"), dir],
    { encoding: "utf8", windowsHide: true },
  );
  assert.equal(generated.status, 0, generated.stderr);
  const jobs = new Jobs(f.store, undefined, async () => ({
    python,
    pdftotext: process.env.KB_PDFTOTEXT,
  }));
  const original = path.join(dir, "pages.pdf"),
    originalHash = await fileHash(original);
  const start = await jobs.ingest({
    paths: [original, path.join(dir, "visuals.epub")],
    module: "workshop",
    domains: ["fictional_workshop"],
    idempotency_key: "formats",
    authorization: "Inspect synthetic documents",
  });
  const converted = await jobs.convert(start.job.job_id, undefined, {
    pdf_profile: "prose",
  });
  const reads = await Promise.all(
    converted.job.coverage.map((u) =>
      jobs.readUnit(start.job.job_id, u.unit_id),
    ),
  );
  const flow = reads.filter((u) => u.locator.anchor?.endsWith("poppler-flow"));
  assert.equal(flow.length, 2);
  assert.match(flow[0].text, /PAGE_ONE_TOKEN/);
  assert.doesNotMatch(flow[0].text, /PAGE_TWO_TOKEN/);
  assert.match(flow[1].text, /PAGE_TWO_TOKEN/);
  const epubImages = reads.filter(
    (u) => u.locator.kind === "epub" && u.kind === "figure",
  );
  assert.equal(epubImages.length, 3);
  for (const unit of epubImages) {
    assert.equal(unit.image?.mimeType, "image/png");
    assert.equal(
      Buffer.from(unit.image!.data, "base64").subarray(1, 4).toString(),
      "PNG",
    );
    const preserved = path.join(
      path.dirname(f.store.p(unit.asset_path!)),
      unit.details.source_asset,
    );
    assert.equal(await fileHash(preserved), unit.details.source_sha256);
  }
  assert.equal(await fileHash(original), originalHash);
  // Simulate the checkpoint loss after extraction files have been preserved.
  const jobFile = path.join(jobs.jobPath(start.job.job_id), "job.json");
  await atomic(jobFile, json(start.job));
  await assert.rejects(() => jobs.convert(start.job.job_id), {
    code: "REVISION_CONFLICT",
  });
  const resumed = await jobs.convert(start.job.job_id, undefined, {
    pdf_profile: "prose",
  });
  assert.deepEqual(resumed.job.coverage, converted.job.coverage);
});

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

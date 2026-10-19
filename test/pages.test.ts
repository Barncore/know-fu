import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { APP } from "../src/core.js";
import { Jobs, pageUnit } from "../src/jobs.js";
import { published } from "./helpers.js";

const python =
  process.env.KB_TEST_PYTHON ??
  path.join(
    APP,
    ".venv",
    process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
  );
const pythonReady = () =>
  spawnSync(python, ["-c", "import pypdf, pypdfium2, PIL"], {
    windowsHide: true,
  }).status === 0;

async function convertedPdf(label: string) {
  const f = await published(label),
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
  const start = await jobs.ingest({
    paths: [path.join(dir, "pages.pdf")],
    module: "workshop",
    domains: ["fictional_workshop"],
    idempotency_key: label,
    authorization: "Read synthetic pages",
  });
  const id = start.job.job_id;
  const converted = await jobs.convert(id, undefined, { pdf_profile: "prose" });
  return { jobs, id, coverage: converted.job.coverage };
}

test("kb_read pages serves a run of pages in one call and counts each as read", async (t) => {
  if (!pythonReady())
    return t.skip("Optional document runtime unavailable; set KB_TEST_PYTHON.");
  const { jobs, id } = await convertedPdf("pages-read");
  const result: any = await jobs.readPages(id, { from: 1, to: 2 });
  assert.equal(result.pages.length, 2);
  assert.match(result.pages[0].text, /PAGE_ONE_TOKEN/);
  assert.match(result.pages[1].text, /PAGE_TWO_TOKEN/);
  assert(result.pages.every((p: any) => p.image_unit_id));
  const read = await jobs.unitsRead(id);
  for (const page of result.pages) assert(read.has(page.unit_id));
});

test("a page-range receipt covers a span in one line, and the engine covers layout twins", async (t) => {
  if (!pythonReady())
    return t.skip("Optional document runtime unavailable; set KB_TEST_PYTHON.");
  const { jobs, id, coverage } = await convertedPdf("pages-receipt");
  await jobs.readPages(id, { from: 1, to: 2 });
  // The reader opened one page image; the range exclusion must still count it as read.
  const image = coverage.find(
    (u) => pageUnit(u)?.representation === "visual" && pageUnit(u)?.page === 2,
  )!;
  await jobs.readUnit(id, image.unit_id);
  const next: any = await jobs.submit(id, {
    step_id: "reconstruct-pages",
    stage: "reconstruct",
    summary:
      "Read both pages' flow text; page images had no figures except page 2.",
    coverage: [
      { pages: [1, 2], representation: "text", status: "complete" },
      {
        pages: [1, 2],
        representation: "image",
        status: "excluded",
        reason: "No figure on the page",
      },
    ] as any,
  });
  const units = next.job.coverage;
  const of = (representation: string, page: number) =>
    units.find(
      (u: any) =>
        pageUnit(u)?.representation === representation &&
        pageUnit(u)?.page === page,
    );
  assert.equal(of("poppler-flow", 1).read, "complete");
  assert.equal(of("poppler-layout", 1).read, "excluded");
  assert.match(of("poppler-layout", 1).exclusion_reason, /flow text was read/);
  assert.equal(of("visual", 1).read, "excluded");
  assert.equal(of("visual", 2).read, "complete");
  assert.notEqual(next.job.stage, "reconstruct");
});

test("coverage_all after page reads covers the layout text, and an unknown representation is refused", async (t) => {
  if (!pythonReady())
    return t.skip("Optional document runtime unavailable; set KB_TEST_PYTHON.");
  const { jobs, id } = await convertedPdf("pages-coverage-all");
  await jobs.readPages(id, { from: 1, to: 2 });
  await assert.rejects(
    jobs.submit(id, {
      step_id: "bad-name",
      stage: "reconstruct",
      summary: "A receipt naming a representation that doesn't exist.",
      coverage: [
        {
          pages: [1, 2],
          representation: "images",
          status: "excluded",
          reason: "No figures",
        },
      ] as any,
    }),
    /No units on this job's pages are "images"/,
  );
  const next: any = await jobs.submit(id, {
    step_id: "all-read",
    stage: "reconstruct",
    summary: "Both pages read in full; their images held no figures.",
    coverage: [
      {
        pages: [1, 2],
        representation: "image",
        status: "excluded",
        reason: "No figure on the page",
      },
    ] as any,
    coverage_all: { status: "complete" },
  });
  const layout = next.job.coverage.filter(
    (u: any) => pageUnit(u)?.representation === "poppler-layout",
  );
  assert(layout.length && layout.every((u: any) => u.read === "excluded"));
  assert.notEqual(next.job.stage, "reconstruct");
});

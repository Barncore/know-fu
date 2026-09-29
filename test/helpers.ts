import * as fs from "node:fs/promises";
import path from "node:path";
import {
  APP,
  readJson,
  key,
  uid,
  VERSION,
  emptyScope,
  emptyAssessment,
  hash,
  now,
  ref,
  objectPath,
} from "../src/core.js";
import { Store } from "../src/store.js";
import type { RecordData, CorpusData } from "../src/core.js";
export const FIX = path.resolve(APP, "test/fixtures/lumen");
export async function fixture(label = "test", runtimeLedger = false) {
  const root = path.join(APP, "test-output", label + "-" + uid()),
    ledger = runtimeLedger ? undefined : path.join(APP, "test-output/ledgers");
  const config = await readJson<CorpusData>(path.join(FIX, "corpus.json"));
  config.corpus_id = "test_" + uid();
  const store = new Store(root, "specification_review", ledger);
  await store.init(config);
  await fs.writeFile(
    store.p("dimensions.json"),
    JSON.stringify({ "lumen.room": { type: "string", unit: null } }),
  );
  await fs.cp(path.join(FIX, "sources"), store.p("sources"), {
    recursive: true,
  });
  const release = await readJson(path.join(FIX, "release.json"));
  const records: RecordData[] = [],
    bodies: Record<string, string> = {};
  for (const e of release.records) {
    const r = await readJson<RecordData>(path.join(FIX, e.metadata_path));
    r.corpus_id = config.corpus_id;
    if (r.body)
      bodies[key(r)] = await fs.readFile(path.join(FIX, r.body.path), "utf8");
    records.push(r);
  }
  return { store, records, bodies, scope: config.default_scope };
}
export async function published(label = "test") {
  const f = await fixture(label);
  const publication = await f.store.publish(
    f.records,
    f.bodies,
    null,
    "Fixture baseline",
    f.scope,
  );
  return { ...f, publication };
}

import { ensure, recordRefs } from "./core.js";
import type { RecordData } from "./core.js";

type GraphWriter = {
  query: (
    query: string,
    options?: { params: Record<string, any> },
  ) => Promise<{ data?: any[] }>;
};

/** Rebuild only a derived graph. The caller owns its lock and readiness receipt. */
export async function writeGraph(
  graph: GraphWriter,
  records: Map<string, RecordData>,
  release: string,
  batchSize = 256,
) {
  ensure(
    Number.isInteger(batchSize) && batchSize > 0 && batchSize <= 1000,
    "VALIDATION_FAILED",
    "Graph batch size must be between 1 and 1000",
  );
  const started = performance.now();
  let batches = 0;
  const write = async (query: string, rows: unknown[][]) => {
    for (let start = 0; start < rows.length; start += batchSize) {
      await graph.query(query, {
        params: { rows: rows.slice(start, start + batchSize) },
      });
      batches++;
    }
  };

  await graph.query("MATCH (n) DETACH DELETE n");
  for (const property of ["id", "module", "predicate", "status"]) {
    try {
      await graph.query(`CREATE INDEX FOR (n:Record) ON (n.${property})`);
    } catch (error: any) {
      if (error.message !== `Attribute '${property}' is already indexed`)
        throw error;
    }
  }

  // Lists of scalar values keep data out of the Cypher text, including titles
  // containing quotes. Avoid map-valued SET operations and dynamic predicates.
  const nodes = [...records.values()].map((record) => [
    record.id,
    record.revision,
    record.record_type,
    record.title,
    record.maintenance_module,
    record.lifecycle,
    record.archived,
    record.corpus_id,
    release,
    (record.payload as any).predicate ?? "",
  ]);
  await write(
    `UNWIND $rows AS row CREATE (:Record {
    id:row[0], revision:row[1], family:row[2], title:row[3], module:row[4],
    status:row[5], archived:row[6], corpus:row[7], release:row[8], predicate:row[9]
  })`,
    nodes,
  );

  const inputs: unknown[][] = [];
  const relationships: unknown[][] = [];
  for (const record of records.values()) {
    for (const dependency of recordRefs(record)) {
      if (records.has(dependency.id))
        inputs.push([record.id, dependency.id, dependency.revision]);
    }
    if (record.record_type === "relationship") {
      const payload = record.payload as any;
      ensure(
        records.has(payload.subject.id) && records.has(payload.object.id),
        "VALIDATION_FAILED",
        "Graph relationship endpoint is absent",
      );
      relationships.push([record.id, payload.subject.id, payload.object.id]);
    }
  }
  await write(
    `UNWIND $rows AS row
    MATCH (a:Record {id:row[0]}), (b:Record {id:row[1]})
    CREATE (a)-[:INPUT {revision:row[2]}]->(b)`,
    inputs,
  );
  await write(
    `UNWIND $rows AS row
    MATCH (a:Record {id:row[0]}), (s:Record {id:row[1]}), (o:Record {id:row[2]})
    CREATE (s)-[:SUBJECT_OF]->(a), (a)-[:OBJECT]->(o)`,
    relationships,
  );

  const counts = await graph.query("MATCH (n:Record) RETURN count(n) AS count");
  ensure(
    Number(counts.data?.[0]?.count) === records.size,
    "VALIDATION_FAILED",
    "Graph projection count mismatch",
  );
  const edges = await graph.query(
    "MATCH ()-[e]->() RETURN type(e) AS kind, count(e) AS count",
  );
  const byType = new Map(
    (edges.data ?? []).map((row) => [row.kind, Number(row.count)]),
  );
  ensure(
    (byType.get("INPUT") ?? 0) === inputs.length &&
      (byType.get("SUBJECT_OF") ?? 0) === relationships.length &&
      (byType.get("OBJECT") ?? 0) === relationships.length,
    "VALIDATION_FAILED",
    "Graph projection relationship count mismatch",
  );
  // Publish the marker last. Partial or failed rebuilds never look ready.
  await graph.query("CREATE (:Projection {release:$release})", {
    params: { release },
  });
  return {
    nodes: records.size,
    edges: inputs.length + relationships.length * 2,
    batches,
    elapsed_ms: performance.now() - started,
  };
}

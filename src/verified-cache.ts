import * as fs from "node:fs/promises";
import { ensure, hash, safePath, validate } from "./core.js";

type Entry = {
  stamp: string;
  digest: string;
  text: string;
  parsed?: unknown;
  schemas: Set<string>;
  weight: number;
};

/** A bounded cache of verified file contents, never an authority for access policy. */
export class VerifiedCache {
  private entries = new Map<string, Entry>();
  private bytes = 0;
  private hits = 0;
  private misses = 0;

  constructor(
    private root: string,
    readonly maxBytes = 64 * 1024 * 1024,
  ) {}

  clear() {
    this.entries.clear();
    this.bytes = 0;
  }

  stats() {
    return {
      entries: this.entries.size,
      estimatedBytes: this.bytes,
      maxBytes: this.maxBytes,
      hits: this.hits,
      misses: this.misses,
    };
  }

  private discard(file: string) {
    const entry = this.entries.get(file);
    if (entry) this.bytes -= entry.weight;
    this.entries.delete(file);
  }

  private async load(relative: string, expected?: string) {
    // Check every path component again. A directory replaced by a symlink must
    // not inherit an earlier file's trusted cache entry.
    const file = await safePath(this.root, relative);
    try {
      const stat = await fs.stat(file, { bigint: true });
      const stamp = [
        stat.dev,
        stat.ino,
        stat.size,
        stat.mtimeNs,
        stat.ctimeNs,
      ].join(":");
      let entry = this.entries.get(file);
      if (entry?.stamp === stamp) {
        this.hits++;
        this.entries.delete(file);
        this.entries.set(file, entry);
      } else {
        this.discard(file);
        this.misses++;
        const bytes = await fs.readFile(file);
        const after = await fs.stat(file, { bigint: true });
        const afterStamp = [
          after.dev,
          after.ino,
          after.size,
          after.mtimeNs,
          after.ctimeNs,
        ].join(":");
        ensure(
          stamp === afterStamp,
          "REVISION_CONFLICT",
          "Canonical file changed while being read; retry",
        );
        entry = {
          stamp,
          digest: hash(bytes),
          text: bytes.toString("utf8"),
          schemas: new Set(),
          weight: bytes.length * 4 + 1024,
        };
        // The allowance accounts conservatively for text and parsed objects;
        // it is not a bound on the whole process or the current request.
        if (entry.weight <= this.maxBytes) {
          while (
            this.bytes + entry.weight > this.maxBytes ||
            this.entries.size >= 20000
          ) {
            this.discard(this.entries.keys().next().value!);
          }
          this.entries.set(file, entry);
          this.bytes += entry.weight;
        }
      }
      ensure(
        !expected || entry.digest === expected,
        "VALIDATION_FAILED",
        "Canonical file hash mismatch",
        { relative },
      );
      return entry;
    } catch (error) {
      this.discard(file);
      throw error;
    }
  }

  async text(relative: string, expected: string) {
    return (await this.load(relative, expected)).text;
  }

  async json<T>(
    relative: string,
    schema: string,
    expected?: string,
  ): Promise<T> {
    const entry = await this.load(relative, expected);
    try {
      entry.parsed ??= JSON.parse(entry.text.replace(/^\uFEFF/, ""));
      if (!entry.schemas.has(schema)) {
        await validate(schema, entry.parsed);
        entry.schemas.add(schema);
      }
      // Callers may prepare a revision by editing a returned record. Never let
      // that edit mutate the shared verified object.
      return structuredClone(entry.parsed) as T;
    } catch (error) {
      this.discard(await safePath(this.root, relative));
      throw error;
    }
  }
}

/** Bound filesystem concurrency without changing result order. */
export async function mapLimit<T, R>(
  values: T[],
  fn: (value: T) => Promise<R>,
  concurrency = 16,
): Promise<R[]> {
  const output = new Array<R>(values.length);
  let next = 0;
  const workers = Array.from(
    { length: Math.min(concurrency, values.length) },
    async () => {
      for (;;) {
        const index = next++;
        if (index >= values.length) return;
        output[index] = await fn(values[index]);
      }
    },
  );
  // Drain all workers before a caller handles failure or retries the operation.
  const settled = await Promise.allSettled(workers);
  const failure = settled.find((result) => result.status === "rejected");
  if (failure?.status === "rejected") throw failure.reason;
  return output;
}

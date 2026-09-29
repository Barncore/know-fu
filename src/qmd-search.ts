import { fork, type ChildProcess } from "node:child_process";
import path from "node:path";
import { APP, STATE, KBError } from "./core.js";

export type SearchRequest = {
  index: string;
  query: string;
  collections: string[];
  semantic: boolean;
  limit: number;
  rerank: boolean;
};
export type SearchReply = {
  items: { file: string; score: number }[];
  elapsed_ms: number;
};

/** Keep QMD's imported code warm, but release its DB/models after each query. */
export class QmdSearch {
  private child?: ChildProcess;
  private idle?: NodeJS.Timeout;
  private queue: Promise<unknown> = Promise.resolve();
  private generation = 0;
  private counter = 0;
  private active?: { id: number; reject: (error: Error) => void };

  constructor(
    private worker = path.join(APP, "dist/qmd-worker.js"),
    private idleMs = 60000,
  ) {}

  close() {
    this.generation++;
    clearTimeout(this.idle);
    const child = this.child;
    this.child = undefined;
    this.active?.reject(
      new KBError(
        "INDEX_STALE",
        "Search worker stopped; retry against the current index",
      ),
    );
    this.active = undefined;
    child?.kill();
  }

  search(
    request: SearchRequest,
    timeout = request.rerank ? 180000 : 45000,
  ): Promise<SearchReply> {
    if (!request.collections.length)
      return Promise.resolve({ items: [], elapsed_ms: 0 });
    const generation = this.generation;
    const result = this.queue.then(() => {
      if (generation !== this.generation)
        throw new KBError("INDEX_STALE", "Queued search invalidated; retry");
      return this.execute(request, timeout);
    });
    this.queue = result.catch(() => {});
    return result;
  }

  private execute(
    request: SearchRequest,
    timeout: number,
  ): Promise<SearchReply> {
    clearTimeout(this.idle);
    if (!this.child) {
      this.child = fork(this.worker, [], {
        execPath: process.execPath,
        execArgv: [],
        windowsHide: true,
        stdio: ["ignore", "ignore", "ignore", "ipc"],
        env: {
          ...process.env,
          XDG_CACHE_HOME: path.join(STATE, "cache"),
          XDG_CONFIG_HOME: path.join(STATE, "qmd-config"),
          QMD_FORCE_CPU: "1",
          QMD_EMBED_PARALLELISM: "1",
        },
      });
      const spawned = this.child;
      spawned.once("exit", () => {
        if (this.child === spawned) this.child = undefined;
      });
      this.child.unref();
      this.child.channel?.unref();
    }
    const child = this.child;
    const id = ++this.counter;
    const started = performance.now();
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (error?: Error, items?: SearchReply["items"]) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        child.removeListener("message", message);
        child.removeListener("error", failed);
        child.removeListener("exit", exited);
        if (this.active?.id === id) this.active = undefined;
        if (error) {
          if (this.child === child) this.child = undefined;
          child.kill();
          reject(error);
        } else {
          this.idle = setTimeout(() => this.close(), this.idleMs);
          this.idle.unref();
          resolve({ items: items!, elapsed_ms: performance.now() - started });
        }
      };
      const failed = (error: Error) => finish(error);
      const exited = () =>
        finish(
          new KBError(
            "PROCESS_FAILED",
            "QMD search worker exited unexpectedly",
          ),
        );
      const message = (reply: any) => {
        if (reply.id !== id) return;
        if (reply.error)
          finish(new KBError("INDEX_STALE", "QMD search failed", reply.error));
        else if (!Array.isArray(reply.items))
          finish(new KBError("INDEX_STALE", "QMD returned invalid results"));
        else finish(undefined, reply.items);
      };
      const timer = setTimeout(
        () =>
          finish(
            new KBError("TIMEOUT", "QMD search exceeded its time allowance"),
          ),
        timeout,
      );
      this.active = { id, reject: failed };
      child.on("message", message);
      child.once("error", failed);
      child.once("exit", exited);
      child.send({ id, request, state: STATE }, (error) => {
        if (error) finish(error);
      });
    });
  }
}

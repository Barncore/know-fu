import * as fs from "node:fs/promises";
import path from "node:path";
import { createStore, type ExpandedQuery } from "@tobilu/qmd";
import type { SearchRequest } from "./qmd-search.js";

process.on(
  "message",
  async (message: { id: number; request: SearchRequest; state: string }) => {
    let store: Awaited<ReturnType<typeof createStore>> | undefined;
    let result: { items?: { file: string; score: number }[]; error?: string };
    try {
      const { request, state } = message;
      if (!/^kb_[a-f0-9]{24}$/.test(request.index))
        throw Error("Invalid search index");
      const dbPath = path.join(state, "cache/qmd", request.index + ".sqlite");
      // Never recreate a deleted/purged index by opening a new empty database.
      await fs.access(dbPath);
      store = await createStore({
        dbPath,
        configPath: path.join(state, "qmd-config/qmd", request.index + ".yml"),
      });
      let items;
      if (request.semantic) {
        const queries: ExpandedQuery[] = /^(lex|vec|hyde):/m.test(request.query)
          ? request.query
              .split("\n")
              .filter((line) => line.trim())
              .map((line) => {
                const match = line.match(/^(lex|vec|hyde):\s*(.+)$/);
                if (!match) throw Error("Invalid structured query line");
                return {
                  type: match[1] as ExpandedQuery["type"],
                  query: match[2],
                };
              })
          : [
              { type: "lex", query: request.query.replaceAll("\n", " ") },
              { type: "vec", query: request.query.replaceAll("\n", " ") },
            ];
        items = await store.search({
          queries,
          collections: request.collections,
          limit: request.limit,
          candidateLimit: 12,
          rerank: request.rerank,
        });
      } else {
        items = await store.searchLex(request.query, {
          collection: request.collections,
          limit: request.limit,
        });
      }
      result = {
        items: items.map((item) => ({
          file: "file" in item ? item.file : item.filepath,
          score: item.score,
        })),
      };
    } catch (error: any) {
      result = { error: error.message };
    } finally {
      // An idle process holds neither the index DB nor model instances. This is
      // essential for Windows rebuild/purge and prevents stale open DB handles.
      try {
        await store?.close();
      } catch (error: any) {
        result = { error: error.message };
      }
    }
    process.send?.({ id: message.id, ...result! });
  },
);
process.on("disconnect", () => process.exit(0));

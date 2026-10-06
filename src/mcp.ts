import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import path from "node:path";
import { Store } from "./store.js";
import { KnowledgeSystem, descriptions, exposedTools } from "./api.js";
import { APP, ENGINE_VERSION } from "./core.js";
import { presentResult } from "./present.js";
const system = new KnowledgeSystem(
  new Store(
    process.env.KB_CORPUS ?? path.resolve(APP, "../knowledge-library"),
    process.env.KB_PROJECT ?? process.cwd(),
  ),
);
const server = new McpServer({ name: "know-fu", version: ENGINE_VERSION });
for (const name of exposedTools())
  server.registerTool(
    name,
    {
      description: descriptions[name],
      inputSchema: { request: z.record(z.string(), z.unknown()).default({}) },
      annotations: {
        readOnlyHint: [
          "kb_status",
          "kb_read",
          "kb_retrieve",
          "kb_recall",
          "kb_brief",
          "kb_connect",
        ].includes(name),
        destructiveHint: name === "kb_lifecycle",
        openWorldHint: false,
      },
    },
    async ({ request }) => {
      try {
        const result = await system.call(name, request);
        if (
          result &&
          typeof result === "object" &&
          "image" in result &&
          result.image
        ) {
          const { image, ...metadata } = result;
          return {
            content: [
              { type: "text" as const, text: JSON.stringify(metadata) },
              {
                type: "image" as const,
                mimeType: image.mimeType,
                data: image.data,
              },
            ],
          };
        }
        return {
          content: [
            { type: "text" as const, text: presentResult(request, result) },
          ],
        };
      } catch (e: any) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({
                code: e.code ?? "INTERNAL_ERROR",
                message: e.message,
                details: e.details ?? null,
                resumable: e.resumable ?? false,
              }),
            },
          ],
        };
      }
    },
  );
await server.connect(new StdioServerTransport());

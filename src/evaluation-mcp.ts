import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { EvaluationReader } from "./evaluation-reader.js";
import { readJson, ENGINE_VERSION, ensure } from "./core.js";
import { renderReadingResponse } from "./reading-render.js";

ensure(
  process.argv[2],
  "VALIDATION_FAILED",
  "A coordinator-owned reader configuration is required",
);
const reader = new EvaluationReader(await readJson(process.argv[2]));
const server = new McpServer({
  name: "know-fu-evaluation-reader",
  version: ENGINE_VERSION,
});
for (const [name, description] of Object.entries({
  kb_retrieve:
    "Discover research through the pinned library. request: query, reason, optional purpose=explain|teach|apply|compare|invent|synthesize|investigate, domains, context, limit (1–40), offset, semantic. Begin precise questions with limit=3; broaden when a relevant branch is missing. Returns summary candidates and their conditional material context, not read bodies. Select relevant accounts, then call kb_read. Corpus, scope, release and graph policy are fixed.",
  kb_read:
    'Read the pinned library. request: reason and kind=catalogue|topic (topic required)|account (record_ref required, optional section_id)|accounts (record_refs, 1–12 selected accounts in one call)|sections (record_ref)|context (record_refs, optional context_offset). References MUST be objects: record_ref={"id":"knowledge:example","revision":1}, record_refs=[{"id":"knowledge:example","revision":1}]. Optional purpose, context, limit (1–40), offset. Full accounts have complete prose; sections are partial. Batch accounts already chosen for reading, with their identified material qualifications and prerequisites. Open necessary_reading accounts before relying on the selected explanation. Supports exact historical references. No filesystem, unpublished source units or writes.',
}))
  server.registerTool(
    name,
    {
      description,
      inputSchema: { request: z.record(z.string(), z.unknown()) },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async ({ request }) => {
      try {
        return {
          content: [
            {
              type: "text" as const,
              text: renderReadingResponse(await reader.call(name, request)),
            },
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
                message: e.code
                  ? e.message
                  : "Reading failed; coordinator diagnostics were preserved.",
              }),
            },
          ],
        };
      }
    },
  );
await server.connect(new StdioServerTransport());

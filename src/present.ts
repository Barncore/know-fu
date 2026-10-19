import { renderReadingResponse } from "./reading-render.js";
import { isJobResponse, renderJobResponse } from "./job-render.js";

/** Text an MCP client receives for a tool result. The API and CLI keep the structured JSON. */
export function presentResult(request: any, result: any): string {
  if (request?.detail === "full") return JSON.stringify(result);
  if (
    result &&
    typeof result === "object" &&
    typeof result.briefing === "string"
  )
    return result.briefing;
  if (isJobResponse(result)) return renderJobResponse(result);
  if (result?.kind === "pages" && Array.isArray(result.pages))
    return renderPages(result);
  if (result && typeof result === "object" && isJobResponse(result.job)) {
    const { job, ...status } = result;
    return `${JSON.stringify(status)}\n\n${renderJobResponse(job)}`;
  }
  return renderReadingResponse(result);
}

/** A run of PDF pages as readable text, one heading per page. */
function renderPages(result: any): string {
  const lines = [
    `Pages ${result.pages[0]?.page ?? "none"}-${result.pages.at(-1)?.page ?? "none"} of ${result.source_id} (job ${result.job_id})`,
    result.note,
  ];
  for (const page of result.pages)
    lines.push(
      `\n## Physical page ${page.page} · ${page.unit_id}` +
        (page.image_unit_id ? ` · image ${page.image_unit_id}` : "") +
        (page.figure_hint ? ` · figure hint: ${page.figure_hint}` : "") +
        `\n\n${page.text}`,
    );
  if (result.next_page)
    lines.push(
      `\nStopped at the character limit. Continue from page ${result.next_page}.`,
    );
  return lines.join("\n");
}

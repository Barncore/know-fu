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
  if (result && typeof result === "object" && isJobResponse(result.job)) {
    const { job, ...status } = result;
    return `${JSON.stringify(status)}\n\n${renderJobResponse(job)}`;
  }
  return renderReadingResponse(result);
}

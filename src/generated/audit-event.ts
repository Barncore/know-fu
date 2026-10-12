/* Generated from the canonical JSON Schema. Do not edit. */

export interface AuditEventData {
  schema_version: "1.1.0";
  event_id: string;
  timestamp: string;
  job_id: string | null;
  operation: string;
  description: string;
  actor: string;
  /**
   * Optional. The calling project folder, as the launcher passed it (KB_PROJECT).
   */
  project?: string;
  /**
   * Optional. The agent the engine worked for (KB_ACTOR), or unspecified.
   */
  agent?: string;
  /**
   * @minItems 0
   */
  record_refs: {
    id: string;
    revision: number;
  }[];
  before_release: string | null;
  after_release: string | null;
  outcome: "prepared" | "committed" | "failed" | "cancelled" | "redacted";
  reason: string;
}

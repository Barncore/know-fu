/* Generated from the canonical JSON Schema. Do not edit. */

export interface LifecyclePlanData {
  schema_version: "1.1.0";
  plan_id: string;
  corpus_id: string;
  base_release: string;
  action: "archive" | "unarchive" | "withdraw" | "reinstate" | "purge";
  /**
   * @minItems 1
   */
  targets: {
    id: string;
    revision: number;
  }[];
  reason: string;
  /**
   * @minItems 0
   */
  affected_refs: {
    id: string;
    revision: number;
  }[];
  /**
   * @minItems 0
   */
  components: (
    | "originals"
    | "records"
    | "extractions"
    | "graph"
    | "search"
    | "wiki"
    | "jobs"
    | "audit"
    | "managed_exports"
    | "managed_backups"
  )[];
  /**
   * @minItems 0
   */
  outside_control: string[];
  authorization_ref: string | null;
  state: "planned" | "authorized" | "running" | "complete" | "incomplete" | "cancelled";
  /**
   * @minItems 0
   */
  receipts: string[];
  /**
   * @minItems 0
   */
  limitations: string[];
}

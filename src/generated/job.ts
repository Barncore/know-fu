/* Generated from the canonical JSON Schema. Do not edit. */

export interface JobData {
  schema_version: "1.1.0";
  job_id: string;
  corpus_id: string;
  base_release: string | null;
  idempotency_key: string;
  authorized_scope: string;
  scope_policy: {
    /**
     * @minItems 1
     */
    read_modules: string[];
    /**
     * @minItems 0
     */
    write_modules: string[];
    /**
     * @minItems 0
     */
    source_refs: {
      id: string;
      revision: number;
    }[];
  };
  stage:
    "register" | "convert" | "reconstruct" | "integrate" | "discover" | "reweave" | "compile" | "check" | "publish";
  status: "pending" | "running" | "waiting_for_codex" | "blocked" | "cancelled" | "complete";
  /**
   * @minItems 1
   */
  source_refs: {
    id: string;
    revision: number;
  }[];
  /**
   * @minItems 1
   */
  coverage: {
    unit_id: string;
    source_ref: {
      id: string;
      revision: number;
    };
    locator: {
      kind: "lines" | "pages" | "time_ms" | "epub" | "web";
      label: string;
      start: number | null;
      end: number | null;
      anchor: string | null;
      precision: "exact" | "approximate";
    };
    registered: "pending" | "complete" | "excluded" | "blocked";
    converted: "pending" | "complete" | "excluded" | "blocked";
    read: "pending" | "complete" | "excluded" | "blocked";
    integrated: "pending" | "complete" | "excluded" | "blocked";
    checked: "pending" | "complete" | "excluded" | "blocked";
    /**
     * @minItems 0
     */
    receipts: string[];
    /**
     * @minItems 0
     */
    gaps: string[];
    exclusion_reason: string | null;
  }[];
  /**
   * @minItems 0
   */
  remaining_work: string[];
  /**
   * @minItems 0
   */
  receipts: string[];
  paid_budget: {
    currency: string | null;
    limit: number | null;
    /**
     * @minItems 0
     */
    provider_request_ids: string[];
  };
  error: null | {
    code: string;
    message: string;
    resumable: boolean;
  };
  /**
   * New jobs require explicit reweave decisions and an understanding-change report. Absent on preserved legacy jobs.
   */
  workflow_version?: 2;
}

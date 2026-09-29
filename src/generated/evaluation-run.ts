/* Generated from the canonical JSON Schema. Do not edit. */

export interface EvaluationRunData {
  schema_version: "1.1.0";
  run_id: string;
  corpus_id: string;
  release_id: string;
  /**
   * @minItems 1
   */
  case_ids: string[];
  condition: "no_kb" | "source_only" | "prose_and_passages" | "full_system";
  fingerprint: string;
  model: string;
  model_version: string | null;
  reasoning_setting: string;
  answer_budget: number;
  tool_budget: number;
  /**
   * @minItems 0
   */
  available_tools: string[];
  status: "pending" | "running" | "complete" | "incomplete";
  /**
   * @minItems 0
   */
  results: {
    case_id: string;
    answer_path: string;
    verdict: "pass" | "fail" | "ambiguous" | "not_scored";
    rationale: string;
    /**
     * @minItems 0
     */
    diagnosis: string[];
    /**
     * @minItems 0
     */
    evidence_refs: {
      id: string;
      revision: number;
    }[];
  }[];
  /**
   * @minItems 0
   */
  limitations: string[];
  /**
   * @minItems 0
   */
  receipts: string[];
}

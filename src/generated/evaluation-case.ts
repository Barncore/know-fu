/* Generated from the canonical JSON Schema. Do not edit. */

export interface EvaluationCaseData {
  schema_version: "1.1.0";
  case_id: string;
  revision: number;
  split: "design_fixture" | "regression" | "held_out" | "retired";
  task: "explain" | "teach" | "apply" | "compare" | "invent" | "abstain";
  prompt: string;
  /**
   * @minItems 1
   */
  source_refs: {
    id: string;
    revision: number;
  }[];
  critical: boolean;
  private_rubric: {
    /**
     * @minItems 1
     */
    required_behaviors: string[];
    /**
     * @minItems 0
     */
    forbidden_behaviors: string[];
    /**
     * @minItems 0
     */
    ambiguities: string[];
  };
  preparation: {
    basis: "original_sources" | "synthetic_design_fixture";
    exposed_to_compiler: boolean;
    notes: string;
  };
}

/* Generated from the canonical JSON Schema. Do not edit. */

export interface EvaluationGradeData {
  verdict: "pass" | "partial" | "fail";
  /**
   * @minItems 1
   */
  reasons: string[];
  /**
   * @minItems 0
   */
  citation_errors: string[];
  /**
   * @minItems 0
   */
  rubric_errors: string[];
  /**
   * @minItems 0
   */
  source_errors: string[];
  /**
   * @minItems 0
   */
  uncertainty: string[];
}

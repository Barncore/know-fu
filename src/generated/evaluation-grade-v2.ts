/* Generated from the canonical JSON Schema. Do not edit. */

export interface EvaluationGradeV2Data {
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
  dimensions: {
    correctness: {
      verdict: "pass" | "partial" | "fail" | "not_applicable";
      rationale: string;
    };
    completeness: {
      verdict: "pass" | "partial" | "fail" | "not_applicable";
      rationale: string;
    };
    decisive_conditions: {
      verdict: "pass" | "partial" | "fail" | "not_applicable";
      rationale: string;
    };
    citation_support: {
      verdict: "pass" | "partial" | "fail" | "not_applicable";
      rationale: string;
    };
    coherent_teaching: {
      verdict: "pass" | "partial" | "fail" | "not_applicable";
      rationale: string;
    };
    useful_synthesis: {
      verdict: "pass" | "partial" | "fail" | "not_applicable";
      rationale: string;
    };
    justified_inference: {
      verdict: "pass" | "partial" | "fail" | "not_applicable";
      rationale: string;
    };
    gap_recognition: {
      verdict: "pass" | "partial" | "fail" | "not_applicable";
      rationale: string;
    };
  };
  decisive_failures: string[];
}

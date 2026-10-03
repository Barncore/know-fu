/* Generated from the canonical JSON Schema. Do not edit. */

/**
 * Version 3 interactive and matched-budget runtime manifests, preserved version 2 fixed-packet runs, and inspectable legacy design receipts.
 */
export type EvaluationRunData =
  | {
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
  | {
      schema_version: "1.1.0";
      version: 2;
      kind: "evaluation_manifest";
      run_id: string;
      corpus_id: string;
      root: string;
      project: string;
      release_id: string;
      model: string;
      /**
       * @minItems 1
       */
      conditions: ("no_kb" | "source_passages" | "prose_and_passages" | "full_kb")[];
      /**
       * @minItems 1
       */
      case_ids: string[];
      created_at: string;
      cases_hash: string;
      fingerprint: string;
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
      state: "prepared" | "running" | "complete" | "incomplete";
      isolation:
        | "not_yet_verified"
        | {
            verified: true;
            mode: "native_commands_denied_input_only";
            [k: string]: unknown;
          };
      budget: {
        reasoning_effort: "medium";
        timeout_ms: 600000;
        answer_words: 1000;
      };
      /**
       * @minItems 0
       */
      limitations: string[];
      /**
       * @minItems 0
       */
      results: {
        case_id: string;
        condition: "no_kb" | "source_passages" | "prose_and_passages" | "full_kb";
        attempt_id: string;
        state: "complete" | "failed";
        answer?: string;
        grade?: {
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
        };
        grade_raw?: string;
        elapsed_ms?: number;
        model?: string;
        evidence_hash?: string;
        held_out?: boolean;
        usage?: {
          [k: string]: unknown;
        };
        error?: string;
        error_code?: string | null;
        details?: unknown;
      }[];
      retrieval_mode?: string;
      completed_at?: string;
    }
  | {
      schema_version: "1.1.0";
      version: 3;
      kind: "evaluation_manifest";
      run_id: string;
      corpus_id: string;
      root: string;
      project: string;
      release_id: string;
      model: string;
      /**
       * @minItems 1
       */
      conditions: (
        "no_kb" | "source_passages" | "prose_and_passages" | "full_kb" | "progressive_graph" | "progressive_prose"
      )[];
      /**
       * @minItems 1
       */
      case_ids: string[];
      created_at: string;
      cases_hash: string;
      fingerprint: string;
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
      state: "prepared" | "running" | "complete" | "incomplete";
      isolation:
        | "not_yet_verified"
        | {
            verified: true;
            mode: "native_commands_denied_input_only" | "native_commands_denied_scoped_mcp";
            [k: string]: unknown;
          };
      budget: {
        reasoning_effort: "medium";
        timeout_ms: 600000;
        answer_words: 1000;
        tool_calls: number;
        rendered_characters: number;
        input_tokens: number;
        input_budget_enforcement: "measured_after_completion";
      };
      /**
       * @minItems 0
       */
      limitations: string[];
      /**
       * @minItems 0
       */
      results: {
        case_id: string;
        condition:
          "no_kb" | "source_passages" | "prose_and_passages" | "full_kb" | "progressive_graph" | "progressive_prose";
        attempt_id: string;
        state: "complete" | "failed";
        answer?: string;
        grade?: {
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
        };
        grade_raw?: string;
        elapsed_ms?: number;
        model?: string;
        evidence_hash?: string;
        held_out?: boolean;
        usage?: {
          [k: string]: unknown;
        };
        error?: string;
        error_code?: string | null;
        details?: unknown;
        case_group?: string;
        budget_status?: "within" | "exceeded" | "unmeasured";
        reading?: {
          [k: string]: unknown;
        };
      }[];
      retrieval_mode?: string;
      completed_at?: string;
      implementation_fingerprint: string;
      grading_data_authorization?: {
        destination: "configured_codex_service";
        basis: "public_sources" | "explicit_user_permission";
        statement: string;
        source_refs: {
          id: string;
          revision: number;
        }[];
        evidence_hashes: string[];
      };
    };

/* Generated from the canonical JSON Schema. Do not edit. */

/**
 * Version 2 runtime manifests and legacy condition-level design receipts. Legacy receipts remain readable but are not resumable runtime runs.
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
    };

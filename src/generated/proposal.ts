/* Generated from the canonical JSON Schema. Do not edit. */

/**
 * This interface was referenced by `ProposalData`'s JSON-Schema
 * via the `definition` "condition".
 */
export type Condition =
  | {
      /**
       * @minItems 1
       */
      all: Condition[];
    }
  | {
      /**
       * @minItems 1
       */
      any: Condition[];
    }
  | {
      not: Condition;
    }
  | {
      dimension: string;
      operator: "eq" | "ne" | "in" | "gt" | "gte" | "lt" | "lte" | "exists";
      value: string | number | boolean | null | (string | number | boolean)[];
      unit: string | null;
    };

export interface ProposalData {
  schema_version: "1.1.0";
  proposal_id: string;
  job_id: string;
  base_release: string | null;
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
  /**
   * @minItems 1
   */
  items: ((
    | {
        record_type?: "source";
        payload?: {
          original_path: string;
          sha256: string;
          media_type: string;
          edition: string;
          origin_id: string;
          evidence_family: string;
          independence: "independent" | "derived" | "unknown";
          /**
           * @minItems 0
           */
          derived_from_sources: (
            | {
                id: string;
                revision: number;
              }
            | {
                local_ref: string;
              }
          )[];
        };
        [k: string]: unknown;
      }
    | {
        record_type?: "passage";
        payload?: {
          source_ref:
            | {
                id: string;
                revision: number;
              }
            | {
                local_ref: string;
              };
          kind: "text" | "figure" | "table" | "transcript" | "frame" | "formula";
          text: string;
          asset_path: string | null;
          locator: {
            kind: "lines" | "pages" | "time_ms" | "epub" | "web";
            label: string;
            start: number | null;
            end: number | null;
            anchor: string | null;
            precision: "exact" | "approximate";
          };
          extraction_sha256: string;
        };
        [k: string]: unknown;
      }
    | {
        record_type?: "concept";
        payload?: {
          definition: string;
          meaning_scope: string;
          /**
           * @minItems 0
           */
          aliases: string[];
        };
        [k: string]: unknown;
      }
    | {
        record_type?: "knowledge";
        payload?: {
          form: "assertion" | "explanation" | "mechanism" | "procedure" | "synthesis";
          summary: string;
          /**
           * @minItems 0
           */
          concept_refs: (
            | {
                id: string;
                revision: number;
              }
            | {
                local_ref: string;
              }
          )[];
        };
        [k: string]: unknown;
      }
    | {
        record_type?: "relationship";
        payload?: {
          subject:
            | {
                id: string;
                revision: number;
              }
            | {
                local_ref: string;
              };
          object:
            | {
                id: string;
                revision: number;
              }
            | {
                local_ref: string;
              };
          predicate:
            | "supports"
            | "challenges"
            | "qualifies"
            | "depends_on"
            | "explains"
            | "exemplifies"
            | "applies_to"
            | "derived_from";
          rationale: string;
          materiality: "essential" | "contextual";
        };
        [k: string]: unknown;
      }
    | {
        record_type?: "judgment";
        payload?: {
          /**
           * @minItems 1
           */
          issue_refs: (
            | {
                id: string;
                revision: number;
              }
            | {
                local_ref: string;
              }
          )[];
          outcome:
            | "different_scope"
            | "compatible"
            | "qualified"
            | "provisional_preference"
            | "superseded_interpretation"
            | "unresolved";
          /**
           * @minItems 0
           */
          alternatives: (
            | {
                id: string;
                revision: number;
              }
            | {
                local_ref: string;
              }
          )[];
          /**
           * @minItems 0
           */
          preferred_refs: (
            | {
                id: string;
                revision: number;
              }
            | {
                local_ref: string;
              }
          )[];
          rationale: string;
          what_would_change: string;
        };
        [k: string]: unknown;
      }
    | {
        record_type?: "learning";
        payload?: {
          form: "primer" | "lesson" | "worked_example" | "near_miss" | "application" | "teaching_sequence";
          /**
           * @minItems 1
           */
          knowledge_refs: (
            | {
                id: string;
                revision: number;
              }
            | {
                local_ref: string;
              }
          )[];
          /**
           * @minItems 1
           */
          objectives: string[];
        };
        [k: string]: unknown;
      }
    | {
        record_type?: "question";
        payload?: {
          /**
           * @minItems 1
           */
          related_refs: (
            | {
                id: string;
                revision: number;
              }
            | {
                local_ref: string;
              }
          )[];
          known: string;
          unknown: string;
          impact: string;
          next_action: string;
          resolution_status: "open" | "investigating" | "answered" | "deferred";
          priority: {
            impact: "low" | "medium" | "high";
            effort: "low" | "medium" | "high" | "unknown";
            rationale: string;
          };
        };
        [k: string]: unknown;
      }
  ) & {
    local_id: string;
    record_type: "source" | "passage" | "concept" | "knowledge" | "relationship" | "judgment" | "learning" | "question";
    title: string;
    maintenance_module: string;
    epistemic:
      "source_account" | "synthesis" | "inference" | "hypothesis" | "judgment" | "illustration" | "administrative";
    scope: {
      /**
       * @minItems 1
       */
      domains: string[];
      /**
       * @minItems 0
       */
      conditions: string[];
      /**
       * @minItems 0
       */
      exclusions: string[];
      condition_expression: null | Condition;
      valid_from: string | null;
      valid_until: string | null;
    };
    /**
     * @minItems 0
     */
    source_refs: (
      | {
          id: string;
          revision: number;
        }
      | {
          local_ref: string;
        }
    )[];
    /**
     * @minItems 0
     */
    input_refs: (
      | {
          id: string;
          revision: number;
        }
      | {
          local_ref: string;
        }
    )[];
    change_reason: string;
    body_markdown: string | null;
    payload: {
      [k: string]: unknown;
    };
    existing_ref?: {
      id: string;
      revision: number;
    };
    assessments?: {
      fidelity: {
        level: "not_assessed" | "unknown" | "low" | "moderate" | "high";
        rationale: string;
        context: string | null;
      };
      evidence: {
        level: "not_assessed" | "unknown" | "low" | "moderate" | "high";
        rationale: string;
        context: string | null;
        basis?:
          | "review_of_studies"
          | "controlled_comparison"
          | "measured_observation"
          | "worked_case"
          | "reasoned_argument"
          | "bare_assertion"
          | "our_inference";
      };
      applicability: {
        level: "not_assessed" | "unknown" | "low" | "moderate" | "high";
        rationale: string;
        context: string | null;
      };
    };
    extensions?: {
      functional_facets?: {
        /**
         * @minItems 0
         */
        purpose?: {
          text: string;
          /**
           * The same purpose or mechanism in domain-free words, so records from other fields can match it.
           */
          abstract?: string;
          basis: "source_stated" | "inferred" | "proposed";
          /**
           * @minItems 0
           */
          evidence_refs: (
            | {
                id: string;
                revision: number;
              }
            | {
                local_ref: string;
              }
          )[];
        }[];
        /**
         * @minItems 0
         */
        mechanism?: {
          text: string;
          /**
           * The same purpose or mechanism in domain-free words, so records from other fields can match it.
           */
          abstract?: string;
          basis: "source_stated" | "inferred" | "proposed";
          /**
           * @minItems 0
           */
          evidence_refs: (
            | {
                id: string;
                revision: number;
              }
            | {
                local_ref: string;
              }
          )[];
        }[];
        /**
         * @minItems 0
         */
        preconditions?: {
          text: string;
          /**
           * The same purpose or mechanism in domain-free words, so records from other fields can match it.
           */
          abstract?: string;
          basis: "source_stated" | "inferred" | "proposed";
          /**
           * @minItems 0
           */
          evidence_refs: (
            | {
                id: string;
                revision: number;
              }
            | {
                local_ref: string;
              }
          )[];
        }[];
        /**
         * @minItems 0
         */
        failure_modes?: {
          text: string;
          /**
           * The same purpose or mechanism in domain-free words, so records from other fields can match it.
           */
          abstract?: string;
          basis: "source_stated" | "inferred" | "proposed";
          /**
           * @minItems 0
           */
          evidence_refs: (
            | {
                id: string;
                revision: number;
              }
            | {
                local_ref: string;
              }
          )[];
        }[];
        /**
         * @minItems 0
         */
        evaluation_method?: {
          text: string;
          /**
           * The same purpose or mechanism in domain-free words, so records from other fields can match it.
           */
          abstract?: string;
          basis: "source_stated" | "inferred" | "proposed";
          /**
           * @minItems 0
           */
          evidence_refs: (
            | {
                id: string;
                revision: number;
              }
            | {
                local_ref: string;
              }
          )[];
        }[];
      };
      application_analysis?: {
        /**
         * @minItems 1
         */
        premise_refs: (
          | {
              id: string;
              revision: number;
            }
          | {
              local_ref: string;
            }
        )[];
        proposed_use: string;
        reasoning: string;
        /**
         * @minItems 0
         */
        assumptions: string[];
        /**
         * @minItems 0
         */
        failed_preconditions: string[];
        validation_state: "not_tested" | "source_reported" | "locally_tested" | "failed" | "unresolved";
        /**
         * @minItems 0
         */
        evaluation_refs: (
          | {
              id: string;
              revision: number;
            }
          | {
              local_ref: string;
            }
        )[];
        next_check: string;
        novelty: {
          status: "not_assessed" | "precedent_found" | "not_found_in_search_scope";
          search_scope: string;
          rationale: string;
        };
        feasibility: {
          level: "not_assessed" | "unknown" | "low" | "moderate" | "high";
          rationale: string;
          context: string | null;
        };
        performance: {
          level: "not_assessed" | "unknown" | "low" | "moderate" | "high";
          rationale: string;
          context: string | null;
        };
      };
      navigation?: {
        interface_version: "1.0.0";
        summary: string;
      };
      /**
       * Verbatim quotes from cited passages. The engine checks each quote against the passage text at publication.
       *
       * @minItems 1
       */
      citations?: {
        ref:
          | {
              id: string;
              revision: number;
            }
          | {
              local_ref: string;
            };
        quote: string;
      }[];
    };
  })[];
}

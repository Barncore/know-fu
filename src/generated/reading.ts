/* Generated from the canonical JSON Schema. Do not edit. */

/**
 * This interface was referenced by `ReadingData`'s JSON-Schema
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

export interface ReadingData {
  interface_version: "1.0.0";
  request_id: string;
  kind: "discovery" | "catalogue" | "topic" | "account" | "accounts" | "sections" | "context";
  release_id: string;
  current_release: string;
  purpose: "explain" | "teach" | "apply" | "compare" | "invent" | "synthesize" | "investigate";
  purpose_requirements: string[];
  candidates: Card[];
  necessary_reading: Card[];
  relationships: {
    record_ref: {
      id: string;
      revision: number;
    };
    subject: {
      id: string;
      revision: number;
    };
    object: {
      id: string;
      revision: number;
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
    assessments: {
      fidelity: {
        level: "not_assessed" | "unknown" | "low" | "moderate" | "high";
        rationale: string;
        context: string | null;
      };
      evidence: {
        level: "not_assessed" | "unknown" | "low" | "moderate" | "high";
        rationale: string;
        context: string | null;
      };
      applicability: {
        level: "not_assessed" | "unknown" | "low" | "moderate" | "high";
        rationale: string;
        context: string | null;
      };
    };
    warnings: string[];
  }[];
  traceable_support: {
    id: string;
    revision: number;
  }[];
  topics: {
    topic: string;
    title: string;
    accounts: number;
    primer_count: number;
    primers: Card[];
  }[];
  sections: {
    section_id: string;
    heading: string;
    characters: number;
    sha256: string;
  }[];
  content: {
    record_ref: {
      id: string;
      revision: number;
    };
    body_sha256: string;
    section_id: string | null;
    text: string;
    coverage: "section_only" | "complete_account";
    payload: {
      [k: string]: unknown;
    } | null;
    extensions: {
      functional_facets?: {
        /**
         * @minItems 0
         */
        purpose?: {
          text: string;
          basis: "source_stated" | "inferred" | "proposed";
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
        mechanism?: {
          text: string;
          basis: "source_stated" | "inferred" | "proposed";
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
        preconditions?: {
          text: string;
          basis: "source_stated" | "inferred" | "proposed";
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
        failure_modes?: {
          text: string;
          basis: "source_stated" | "inferred" | "proposed";
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
        evaluation_method?: {
          text: string;
          basis: "source_stated" | "inferred" | "proposed";
          /**
           * @minItems 0
           */
          evidence_refs: {
            id: string;
            revision: number;
          }[];
        }[];
      };
      application_analysis?: {
        /**
         * @minItems 1
         */
        premise_refs: {
          id: string;
          revision: number;
        }[];
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
        evaluation_refs: {
          id: string;
          revision: number;
        }[];
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
    };
    assessments: {
      fidelity: {
        level: "not_assessed" | "unknown" | "low" | "moderate" | "high";
        rationale: string;
        context: string | null;
      };
      evidence: {
        level: "not_assessed" | "unknown" | "low" | "moderate" | "high";
        rationale: string;
        context: string | null;
      };
      applicability: {
        level: "not_assessed" | "unknown" | "low" | "moderate" | "high";
        rationale: string;
        context: string | null;
      };
    };
  } | null;
  route: ("canonical" | "semantic" | "keyword_index" | "graph")[];
  warnings: string[];
  pagination: {
    offset: number;
    limit: number;
    total: number;
    next_offset: number | null;
  };
  material_context: {
    resolved: boolean;
    total_accounts: number;
    total_relationships: number;
    offset: number;
    next_offset: number | null;
  };
  reading_status: "orientation_only" | "section_read" | "account_read";
  completeness: string;
  timings_ms: {
    total: number;
  };
  usage: {
    rendered_characters: number;
    estimated_tokens: number;
    measurement: string;
  };
  contents?: {
    record_ref: {
      id: string;
      revision: number;
    };
    body_sha256: string;
    section_id: string | null;
    text: string;
    coverage: "section_only" | "complete_account";
    payload: {
      [k: string]: unknown;
    } | null;
    extensions: {
      functional_facets?: {
        /**
         * @minItems 0
         */
        purpose?: {
          text: string;
          basis: "source_stated" | "inferred" | "proposed";
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
        mechanism?: {
          text: string;
          basis: "source_stated" | "inferred" | "proposed";
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
        preconditions?: {
          text: string;
          basis: "source_stated" | "inferred" | "proposed";
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
        failure_modes?: {
          text: string;
          basis: "source_stated" | "inferred" | "proposed";
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
        evaluation_method?: {
          text: string;
          basis: "source_stated" | "inferred" | "proposed";
          /**
           * @minItems 0
           */
          evidence_refs: {
            id: string;
            revision: number;
          }[];
        }[];
      };
      application_analysis?: {
        /**
         * @minItems 1
         */
        premise_refs: {
          id: string;
          revision: number;
        }[];
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
        evaluation_refs: {
          id: string;
          revision: number;
        }[];
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
    };
    assessments: {
      fidelity: {
        level: "not_assessed" | "unknown" | "low" | "moderate" | "high";
        rationale: string;
        context: string | null;
      };
      evidence: {
        level: "not_assessed" | "unknown" | "low" | "moderate" | "high";
        rationale: string;
        context: string | null;
      };
      applicability: {
        level: "not_assessed" | "unknown" | "low" | "moderate" | "high";
        rationale: string;
        context: string | null;
      };
    };
  }[];
  graph_candidates?: Card[];
  graph_omitted?: number;
}
/**
 * This interface was referenced by `ReadingData`'s JSON-Schema
 * via the `definition` "card".
 */
export interface Card {
  record_ref: {
    id: string;
    revision: number;
  };
  title: string;
  summary: string | null;
  summary_state: "authored" | "missing";
  record_type: "source" | "passage" | "concept" | "knowledge" | "relationship" | "judgment" | "learning" | "question";
  form: string;
  domains: string[];
  epistemic:
    "source_account" | "synthesis" | "inference" | "hypothesis" | "judgment" | "illustration" | "administrative";
  lifecycle: "active" | "superseded" | "withdrawn";
  archived: boolean;
  body_sha256: string | null;
  read_release: string;
  current_ref: {
    id: string;
    revision: number;
  } | null;
  current_lifecycle: "active" | "superseded" | "withdrawn" | "unavailable";
  current_archived: boolean;
  freshness: "current" | "historical" | "pending_reassessment";
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
  applicability: "true" | "false" | "unknown";
  assessments: {
    fidelity: "not_assessed" | "unknown" | "low" | "moderate" | "high";
    evidence: "not_assessed" | "unknown" | "low" | "moderate" | "high";
    applicability: "not_assessed" | "unknown" | "low" | "moderate" | "high";
  };
  source_refs: {
    id: string;
    revision: number;
  }[];
  support_refs: {
    id: string;
    revision: number;
  }[];
  locator: {
    kind: "lines" | "pages" | "time_ms" | "epub" | "web";
    label: string;
    start: number | null;
    end: number | null;
    anchor: string | null;
    precision: "exact" | "approximate";
  } | null;
  selection_reason: string;
  warnings: string[];
}

/* Generated from the canonical JSON Schema. Do not edit. */

export interface RetrievalData {
  schema_version: "1.1.0";
  request_id: string;
  corpus_id: string;
  release_id: string;
  purpose: "explain" | "teach" | "apply" | "compare" | "invent" | "investigate";
  query: string;
  scope_selection: {
    /**
     * @minItems 1
     */
    allowed_modules: string[];
    /**
     * @minItems 0
     */
    selected_domains: string[];
    /**
     * @minItems 0
     */
    source_refs: {
      id: string;
      revision: number;
    }[];
    rationale: string;
  };
  /**
   * @minItems 1
   */
  route: ("exact" | "semantic" | "wiki" | "graph" | "canonical_fallback")[];
  /**
   * @minItems 0
   */
  items: {
    record_ref: {
      id: string;
      revision: number;
    };
    role: "explanation" | "evidence" | "qualification" | "counterevidence" | "alternative" | "prerequisite";
    excerpt: string;
    generated: boolean;
    locator: {
      kind: "lines" | "pages" | "time_ms" | "epub" | "web";
      label: string;
      start: number | null;
      end: number | null;
      anchor: string | null;
      precision: "exact" | "approximate";
    } | null;
    selection_reason: string;
  }[];
  /**
   * @minItems 0
   */
  relationship_refs: {
    id: string;
    revision: number;
  }[];
  /**
   * @minItems 0
   */
  judgment_refs: {
    id: string;
    revision: number;
  }[];
  /**
   * @minItems 0
   */
  missing_evidence: string[];
  /**
   * @minItems 0
   */
  warnings: string[];
  truncated: boolean;
  freshness: "current" | "pinned_historical" | "degraded";
  fingerprints: {
    [k: string]: string;
  };
  timings_ms: {
    [k: string]: number;
  };
}

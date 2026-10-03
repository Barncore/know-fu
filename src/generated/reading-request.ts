/* Generated from the canonical JSON Schema. Do not edit. */

export type ReadingRequestData = {
  [k: string]: unknown;
} & {
  interface_version?: "1.0.0";
  mode?: "progressive";
  kind?: "catalogue" | "topic" | "account" | "accounts" | "sections" | "context";
  query?: string;
  purpose?: "explain" | "teach" | "apply" | "compare" | "invent" | "synthesize" | "investigate";
  scope?: {
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
  release_id?: string;
  context?: {
    [k: string]: {
      value: unknown;
      unit?: string | null;
    };
  };
  domains?: string[];
  topic?: string;
  record_ref?: {
    id: string;
    revision: number;
  };
  /**
   * @minItems 1
   * @maxItems 40
   */
  record_refs?: {
    id: string;
    revision: number;
  }[];
  section_id?: string;
  offset?: number;
  context_offset?: number;
  limit?: number;
  graph?: boolean;
  graph_required?: boolean;
  semantic?: boolean;
  rerank?: boolean;
};

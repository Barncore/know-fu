/* Generated from the canonical JSON Schema. Do not edit. */

export interface CorpusData {
  schema_version: "1.1.0";
  corpus_id: string;
  title: string;
  /**
   * The agent adapter a library was set up for: mcp when any MCP agent may use it. Informational; project bindings decide access.
   */
  integration: "mcp" | "codex" | "claude";
  /**
   * @minItems 1
   */
  modules: {
    module_id: string;
    title: string;
    description: string;
  }[];
  /**
   * @minItems 1
   */
  domains: {
    domain_id: string;
    title: string;
  }[];
  default_scope: {
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
  project_bindings: {
    project_id: string;
    /**
     * @minItems 1
     */
    read_modules: string[];
    /**
     * @minItems 0
     */
    write_modules: string[];
  }[];
}

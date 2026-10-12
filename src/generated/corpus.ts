/* Generated from the canonical JSON Schema. Do not edit. */

export interface CorpusData {
  schema_version: "1.1.0";
  corpus_id: string;
  title: string;
  /**
   * The agent adapter a library was set up for: mcp when any MCP agent may use it. Informational; project bindings and the access policy decide access.
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
     * Modules this folder may save answers and ideas into and author in (ingest, notes, proposals, jobs). Also the default for administer_modules.
     *
     * @minItems 0
     */
    write_modules: string[];
    /**
     * Optional. Modules this folder may file answers and keep ideas in. When absent, write_modules.
     *
     * @minItems 0
     */
    save_modules?: string[];
    /**
     * Optional. Modules this folder may ingest into, write notes in, and propose, advance and publish jobs for. When absent, write_modules.
     *
     * @minItems 0
     */
    author_modules?: string[];
    /**
     * Optional. Modules this folder may administer: lifecycle changes, imports, and with every module, configuration, whole-library maintenance and evaluation. When absent, write_modules.
     *
     * @minItems 0
     */
    administer_modules?: string[];
  }[];
  /**
   * Optional access policy. Without it, only bound folders may use the library and each binding matches its folder exactly. With it, a binding also covers the folders inside its folder (the closest binding wins), and folders with no binding get any_project.
   */
  access?: {
    /**
     * The library's home folder. It needs its own binding; refusals name it as the place to ingest and administer.
     */
    home_project: string;
    /**
     * What a folder with no binding of its own may do. It never administers.
     */
    any_project?: {
      /**
       * @minItems 0
       */
      read_modules: string[];
      /**
       * @minItems 0
       */
      save_modules: string[];
      /**
       * @minItems 0
       */
      author_modules: string[];
    };
  };
}

/* Generated from the canonical JSON Schema. Do not edit. */

export interface ReleaseData {
  schema_version: "1.1.0";
  release_id: string;
  corpus_id: string;
  parent_release: string | null;
  created_at: string;
  change_reason: string;
  /**
   * @minItems 1
   */
  records: {
    record_ref: {
      id: string;
      revision: number;
    };
    metadata_path: string;
    sha256: string;
  }[];
  /**
   * @minItems 0
   */
  coverage_receipts: string[];
  /**
   * @minItems 0
   */
  validation_receipts: string[];
}

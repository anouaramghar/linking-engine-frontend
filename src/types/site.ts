export interface Site {
  id: number;
  name: string;
  base_url: string;
  platform: "wordpress" | "html" | "pool";
  crawl_frequency: string;
  suggestion_method?: "hybrid_bm25";
  suggestion_slots_available: number;
  /**
   * Whether an account exists that could edit this site's posts. False means
   * publication cannot even be prepared: reading a post for editing is refused
   * anonymously. Optional so an engine that predates the field reads as
   * credentialled rather than showing every site as broken.
   */
  has_wordpress_credentials?: boolean;
  created_at: string;
  last_ingestion_status: string | null;
  /**
   * Why the last crawl failed, in the crawler's own words. Present only for a
   * failed run, and optional so an engine that predates the field simply shows
   * the badge without a reason.
   */
  last_ingestion_error?: string | null;
  // Last finished analysis job — "Indexed" and "Analyzed" are different states.
  last_analysis_status?: string | null;
  last_analysis_at?: string | null;
  last_analysis_error?: string | null;
  article_count?: number;
  internal_link_count?: number;
  last_crawl_at?: string | null;
  pool_source_approved?: boolean;
  pool_source_approved_at?: string | null;
  pool_source_approved_by?: string | null;
  pool_source_consecutive_failures?: number;
  pool_source_quarantined?: boolean;
  pool_source_quarantined_at?: string | null;
  pool_source_quarantine_reason?: string | null;
  pool_source_last_reactivated_at?: string | null;
  pool_source_last_reactivated_by?: string | null;
}

export interface PoolAuditEvent {
  id: number;
  site_id: number;
  site_name: string;
  site_base_url: string;
  action: "approved" | "revoked" | "quarantined" | "reactivated";
  operator_id: string;
  reason: string | null;
  created_at: string;
}

export interface SiteCreate {
  name: string;
  base_url: string;
  platform: "wordpress" | "html" | "pool";
  wp_username?: string;
  wp_app_password?: string;
}

export interface BulkCreated {
  row: number; // 1-based index into the submitted list, not the CSV line
  id: number;
  name: string;
  base_url: string;
}

export interface BulkFailure {
  row: number;
  base_url: string | null;
  reason: string;
}

export interface BulkImportResult {
  created: BulkCreated[];
  skipped: BulkFailure[];
  rejected: BulkFailure[];
}

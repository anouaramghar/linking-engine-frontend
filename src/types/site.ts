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
  /** Static HTML sites can export approved plans, but cannot be written by the engine. */
  can_export?: boolean;
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
  domain_registered_at?: string | null;
  editorial_feedback_enabled?: boolean;
  editorial_min_score_percent?: number;
  editorial_feedback_weight?: number;
  editorial_feedback_min_samples?: number;
}

export interface EditorialRankingPolicy {
  site_id: number;
  enabled: boolean;
  min_score_percent: number;
  feedback_weight: number;
  min_samples: number;
}

export type EditorialRankingPolicyUpdate = Omit<EditorialRankingPolicy, "site_id">;

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
  domain_registered_at?: string;
}

export interface ExternalLinkPolicy {
  site_id: number;
  external_links_enabled: boolean;
  require_https: boolean;
  min_trust_score: number;
  min_domain_age_days: number;
  trusted_tlds: string[];
  allowlist_domains: string[];
  blocklist_domains: string[];
  competitor_domains: string[];
  owned_domain_protection: true;
  expired_suggestions: number;
  updated_by: string | null;
  updated_at: string | null;
}

export type ExternalLinkPolicyUpdate = Pick<
  ExternalLinkPolicy,
  | "external_links_enabled"
  | "require_https"
  | "min_trust_score"
  | "min_domain_age_days"
  | "trusted_tlds"
  | "allowlist_domains"
  | "blocklist_domains"
  | "competitor_domains"
>;

export interface ExternalSourceEvaluation {
  site_id: number;
  site_name: string;
  domain: string;
  trust_score: number;
  eligible: boolean;
  eligible_articles: number;
  blocked_articles: number;
  reasons: string[];
  checks: {
    https: boolean;
    trusted_tld: boolean;
    domain_age_days: number | null;
    allowlisted: boolean;
    blocklisted: boolean;
    competitor: boolean;
    owned_domain: boolean;
    approved_source: boolean;
  };
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

export interface ArticleImportRow {
  url: string;
  title?: string;
  content_text?: string;
  content_html?: string;
  canonical_url?: string;
  status_code?: number;
  indexability?: string;
  discovered_from?: string;
  discovery_depth?: number;
}

export interface ArticleImportFailure {
  row: number;
  url: string | null;
  reason: string;
}

export interface ArticleImportResult {
  ingestion_run_id: number;
  imported: number;
  updated: number;
  links_found: number;
  skipped: ArticleImportFailure[];
  rejected: ArticleImportFailure[];
  diagnostic_summary: Record<string, number>;
}

export interface SiteArticle {
  id: number;
  external_id: string | null;
  url: string;
  title: string;
}

export interface PoolSourceValidationResult {
  base_url: string | null;
  valid: boolean;
  source_type: "wikipedia" | "rss_atom" | null;
  reason: string | null;
}

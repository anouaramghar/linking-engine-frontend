export interface Site {
  id: number;
  name: string;
  base_url: string;
  platform: "wordpress" | "html" | "pool";
  crawl_frequency: string;
  suggestion_method?: "hybrid_bm25";
  suggestion_mode: "experimental";
  suggestion_mode_managed: boolean;
  suggestion_comparison_enabled: boolean;
  suggestion_slots_available: number;
  created_at: string;
  last_ingestion_status: string | null;
  // Last finished analysis job — "Indexed" and "Analyzed" are different states.
  last_analysis_status?: string | null;
  last_analysis_at?: string | null;
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

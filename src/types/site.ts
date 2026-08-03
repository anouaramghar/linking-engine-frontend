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

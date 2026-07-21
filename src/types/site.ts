export interface Site {
  id: number;
  name: string;
  base_url: string;
  platform: "wordpress" | "html";
  crawl_frequency: string;
  created_at: string;
  last_ingestion_status: string | null;
}

export interface SiteCreate {
  name: string;
  base_url: string;
  platform: "wordpress" | "html";
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

export interface SiteStats {
  site_id: number;
  articles: number;
  internal_links: number;
  orphan_articles: number;
  suggestions_by_status: Record<string, number>;
  suggestions_by_method: Record<string, number>;
  approval_rate: number | null;
}

export interface EvaluationResult {
  site_id: number;
  k: number;
  train_links: number;
  test_links: number;
  baseline: { recall_at_k: number; mrr: number };
  gnn: { recall_at_k: number; mrr: number };
  gate_passed: boolean;
  evaluated_at: string;
}

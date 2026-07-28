export interface Site {
  id: number;
  name: string;
  base_url: string;
  platform: "wordpress" | "html";
  crawl_frequency: string;
  created_at: string;
  last_ingestion_status: string | null;
  article_count?: number;
  internal_link_count?: number;
  last_crawl_at?: string | null;
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

import { api } from "./client";

export interface PendingPublicationSite {
  site_id: number;
  awaiting_publication: number;
}

export type LinkOutcome = "inserted" | "block" | "already_present";

export interface PlannedLink {
  suggestion_id: number;
  source_article_id: number;
  source_url: string;
  target_url: string;
  outcome: LinkOutcome;
  anchor_text: string | null;
}

export interface PlannedArticle {
  source_article_id: number;
  source_url: string;
  original_html: string;
  updated_html: string;
  links: PlannedLink[];
}

export interface PublicationPreviewError {
  source_article_id: number;
  source_url: string;
  message: string;
}

export interface PublicationDryRun {
  site_id: number;
  approved: number;
  previewed: number;
  placements_missing: number;
  inserted: number;
  block: number;
  already_present: number;
  planned: PlannedLink[];
  articles: PlannedArticle[];
  errors: PublicationPreviewError[];
  truncated: boolean;
}

export const listPendingPublication = () =>
  api
    .get<PendingPublicationSite[]>("/publish/pending")
    .then((response) => response.data);

export const getPublicationDryRun = (siteId: number, maxArticles = 10) =>
  api
    .get<PublicationDryRun>(`/publish/${siteId}/dry-run`, {
      params: { max_articles: maxArticles },
      // The backend reads live WordPress posts sequentially and may honour a
      // host's Retry-After. This preview is intentionally longer than a normal
      // dashboard request, while still bounded for a dead connection.
      timeout: 180_000,
    })
    .then((response) => response.data);

export interface ArticleBrief {
  id: number;
  title: string;
  url: string;
}

export type SuggestionStatus = "pending" | "approved" | "rejected" | "applied";

export interface Suggestion {
  id: number;
  site_id: number;
  source_article: ArticleBrief;
  target_article: ArticleBrief | null; // null for external suggestions (v3)
  method: string;
  score: number;
  status: SuggestionStatus;
  anchor_text: string | null;
  external_url: string | null;
  external_title: string | null;
  trust_score: number | null;
  context_before: string;
  context_after: string;
  created_at: string;
}

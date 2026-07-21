export interface ArticleBrief {
  id: number;
  title: string;
  url: string;
}

export type SuggestionStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "applying"
  | "applied";
/** Statuses an editor can set directly. 'pending' undoes an earlier decision. */
export type ReviewStatus = "approved" | "rejected" | "pending";

export interface Suggestion {
  id: number;
  site_id: number;
  source_article: ArticleBrief;
  target_article: ArticleBrief;
  method: string;
  score: number;
  status: SuggestionStatus;
  anchor_text: string | null;
  created_at: string;
}

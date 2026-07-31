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
  | "applied"
  | "expired";
/** Statuses an editor can set directly. 'pending' undoes an earlier decision. */
export type ReviewStatus = "approved" | "rejected" | "pending";

/**
 * How a non-cosine ranker chose a row. Only `hybrid_bm25` writes this today; the
 * fields are optional because the engine may add more and older rows have none.
 *
 * `bm25_score` is a raw Okapi BM25 score, not a probability and not a
 * percentage — it must never be rendered as a confidence next to `score`.
 */
export interface SuggestionScoreComponents {
  version?: string;
  /** Which signal produced the delivered order. `bm25_512` for the pilot. */
  final_order?: string;
  score_is?: string;
  recipe?: string;
  bm25_score?: number;
  fusion_rank?: number;
  fusion_score?: number;
  /** Null when only the other retriever proposed this target. */
  dense_rank?: number | null;
  lexical_rank?: number | null;
  semantic?: number;
}

export interface Suggestion {
  id: number;
  site_id: number;
  source_article: ArticleBrief;
  target_article: ArticleBrief;
  method: string;
  /** Cosine semantic similarity, whichever method selected the row. */
  score: number;
  score_components?: SuggestionScoreComponents | null;
  status: SuggestionStatus;
  anchor_text: string | null;
  created_at: string;
}

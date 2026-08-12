export interface ArticleBrief {
  id: number;
  title: string;
  url: string;
}

export interface SuggestionTargetBrief {
  id: number | null;
  title: string;
  url: string;
}

export type SuggestionTargetOrigin = "internal" | "content_pool" | "web_search";

export type SuggestionStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "applying"
  | "applied"
  | "expired"
  /** Quarantined by the worker after repeated publication failures. Returned by
   *  the default queue, so every status map here has to carry it. */
  | "failed";
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
  external_trust?: {
    domain: string;
    score: number;
    eligible: boolean;
    reasons: string[];
    checks: Record<string, boolean | number | string | null>;
  };
  external_safety?: {
    domain: string;
    eligible: boolean;
    reasons: string[];
    checks: Record<string, boolean>;
  };
}

/**
 * Where in the source article the link would go.
 *
 * Not part of `Suggestion`: it costs a model call, so the engine generates it
 * when a suggestion is opened rather than for every row of a queue page.
 *
 * `found: false` is an answer, not a failure — the model read the article and
 * no passage suited the link. Render that; do not retry it.
 */
export interface Placement {
  suggestion_id: number;
  found: boolean;
  /** A passage copied verbatim from the source article. Null when not found. */
  placement_context: string | null;
  /** Guaranteed to be a substring of `placement_context`, so it can be located
   *  by searching rather than by trusting an offset. */
  anchor_text: string | null;
  llm_model: string | null;
  generated_at: string;
}

export interface Suggestion {
  id: number;
  /** Stable correlation key returned by trace-aware engine versions. */
  trace_id?: string;
  site_id: number;
  source_article: ArticleBrief;
  target_article: SuggestionTargetBrief;
  target_origin: SuggestionTargetOrigin;
  target_site_name: string;
  method: string;
  /** Cosine semantic similarity, whichever method selected the row. */
  score: number;
  score_components?: SuggestionScoreComponents | null;
  provider?: string | null;
  provider_request_id?: string | null;
  provider_score?: number | null;
  search_query?: string | null;
  external_snippet?: string | null;
  status: SuggestionStatus;
  anchor_text: string | null;
  publish_outcome?: "inserted" | "block" | "already_present" | null;
  publish_attempts?: number;
  publish_error?: string | null;
  created_at: string;
}

export interface SuggestionEvent {
  id: number;
  suggestion_id: number;
  event_type: string;
  actor: string;
  details: Record<string, unknown>;
  created_at: string;
}

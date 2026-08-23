import { api } from "./client";
import type {
  Placement,
  ReviewStatus,
  Suggestion,
  SuggestionEvent,
  SuggestionStatus,
  SuggestionTargetOrigin,
  RejectionReason,
} from "../types/suggestion";
import type { JobAccepted } from "../types/job";
import { ENGINE_PAGE_LIMIT } from "./engineLimits";

/**
 * Must stay at or below the engine's MAX_PAGE_SIZE (app/api/pagination.py) —
 * the list endpoints reject a larger `limit` outright, so raising this turns
 * every read into a 422. Pinned from the backend side by
 * `test_every_list_endpoint_accepts_exactly_max_page_size`.
 */
export const SUGGESTION_PAGE_SIZE = ENGINE_PAGE_LIMIT;

export interface SuggestionCursor {
  rank_score: number;
  id: number;
}

export interface SuggestionPage {
  items: Suggestion[];
  total: number | null;
  limit: number;
  next_cursor: SuggestionCursor | null;
}

/** Must match MAX_SEARCH_TERM in app/schemas/suggestion.py, which 422s above it. */
export const MAX_SEARCH_TERM = 200;

export interface SuggestionQueueFilters {
  siteId?: number;
  status?: SuggestionStatus;
  minPercent?: number;
  maxPercent?: number;
  q?: string;
  targetOrigin?: SuggestionTargetOrigin;
  excludeReciprocal?: boolean;
}

const queueParams = (filters: SuggestionQueueFilters) => ({
  ...(filters.siteId === undefined ? {} : { site_id: filters.siteId }),
  ...(filters.status === undefined ? {} : { status: filters.status }),
  ...(filters.minPercent === undefined ? {} : { min_percent: filters.minPercent }),
  ...(filters.maxPercent === undefined ? {} : { max_percent: filters.maxPercent }),
  // A blank term is not a filter. Sending it anyway would make every empty
  // keystroke a fresh query key and refetch the whole queue for nothing.
  ...(filters.q ? { q: filters.q } : {}),
  ...(filters.targetOrigin === undefined ? {} : { target_origin: filters.targetOrigin }),
  ...(filters.excludeReciprocal ? { exclude_reciprocal: true } : {}),
});

export const listSuggestionPage = (
  filters: SuggestionQueueFilters,
  cursor: SuggestionCursor | null,
) =>
  api
    .get<SuggestionPage>("/suggestions", {
      params: {
        ...queueParams(filters),
        ...(cursor === null
          ? {}
          : { after_rank_score: cursor.rank_score, after_id: cursor.id }),
        limit: SUGGESTION_PAGE_SIZE,
      },
    })
    .then((response) => response.data);

export interface SuggestionCounts {
  pending: number;
  approved: number;
  rejected: number;
  applying: number;
  applied: number;
  expired: number;
  failed: number;
  total: number;
}

export const countSuggestions = (filters: SuggestionQueueFilters) =>
  api
    .get<SuggestionCounts>("/suggestions/counts", {
      params: queueParams(filters),
    })
    .then((response) => response.data);

export const reviewSuggestion = (
  id: number,
  status: ReviewStatus,
  rejectionReason?: RejectionReason,
) =>
  api
    .put<Suggestion>(`/suggestions/${id}`, {
      status,
      ...(rejectionReason ? { rejection_reason: rejectionReason } : {}),
    })
    .then((r) => r.data);

export const markSuggestionsExposed = (
  suggestionIds: number[],
  surface: "queue" | "preview" = "queue",
) =>
  api
    .post<{ exposed: number }>("/suggestions/exposure", {
      suggestion_ids: suggestionIds,
      surface,
    })
    .then((r) => r.data);

/**
 * The first call for a suggestion runs a model and can take several seconds;
 * the engine stores the result, so every call after it is a plain read.
 *
 * Given the generous timeout this needs, the shared 30s client budget is the
 * one to watch: leave this on the default rather than raising it, and let a
 * genuinely stuck request fail so the drawer can offer a retry.
 */
export const getPlacement = (id: number) =>
  api.get<Placement>(`/suggestions/${id}/placement`).then((r) => r.data);

/** Lifecycle history is loaded only for the open drawer, never for queue rows. */
export const getSuggestionEvents = (id: number) =>
  api
    .get<SuggestionEvent[]>(`/suggestions/${id}/events`, { params: { limit: 50 } })
    .then((response) => response.data);

/**
 * Resolve the complete pending selection behind the current queue filters.
 *
 * The visible list is deliberately incremental, so its mounted rows are not a
 * safe definition of "all filtered". Walk the engine cursor instead and retain
 * only ids; review still uses the bounded, chunked endpoint below.
 */
export const listAllSuggestionIds = async (filters: SuggestionQueueFilters) => {
  const ids: number[] = [];
  const seenCursors = new Set<string>();
  let cursor: SuggestionCursor | null = null;

  do {
    const page = await listSuggestionPage(filters, cursor);
    ids.push(...page.items.map((suggestion) => suggestion.id));
    cursor = page.next_cursor;
    if (cursor) {
      const key = `${cursor.rank_score}:${cursor.id}`;
      if (seenCursors.has(key)) {
        throw new Error("The suggestion cursor repeated while selecting all filtered results.");
      }
      seenCursors.add(key);
    }
  } while (cursor);

  return ids;
};

export interface BulkReviewResult {
  /** Rows that actually moved. */
  reviewed: number[];
  /** Includes legacy engines that confirm a count without returning row ids. */
  reviewedCount: number;
  /**
   * Rows the engine refused to touch: publishing, already published, expired,
   * or bound to an approved publication plan.
   */
  skipped: number[];
  status: ReviewStatus;
}

export interface FilteredBulkReviewResult {
  reviewed: number;
  skipped: number;
  reviewed_ids: number[] | null;
  undo_operation_id: string | null;
  status: Exclude<ReviewStatus, "pending">;
}

export interface FilteredBulkUndoResult {
  restored: number;
  skipped: number;
  status: ReviewStatus;
  already_undone: boolean;
}

export interface FilteredBulkReviewRule {
  siteId?: number;
  status: Exclude<ReviewStatus, "pending">;
  thresholdPercent: number;
  /**
   * The queue's own filters, carried into the rule so it acts on exactly the
   * rows the editor was shown. Omitting any of these would widen the match past
   * the confirmation's own description of it.
   */
  q?: string;
  targetOrigin?: SuggestionTargetOrigin;
  excludeReciprocal?: boolean;
}

export const bulkReviewByFilter = (rule: FilteredBulkReviewRule) =>
  api
    .post<FilteredBulkReviewResult>("/suggestions/bulk-review-by-filter", {
      status: rule.status,
      threshold_percent: rule.thresholdPercent,
      ...(rule.siteId === undefined
        ? { all_sites: true }
        : { site_id: rule.siteId }),
      ...(rule.q ? { q: rule.q } : {}),
      ...(rule.targetOrigin === undefined
        ? {}
        : { target_origin: rule.targetOrigin }),
      ...(rule.excludeReciprocal ? { exclude_reciprocal: true } : {}),
    })
    .then((response) => response.data);

export const undoFilteredBulkReview = (operationId: string) =>
  api
    .post<FilteredBulkUndoResult>(
      `/suggestions/bulk-review-operations/${operationId}/undo`,
    )
    .then((response) => response.data);

interface BulkReviewResponse {
  /** An engine that predates the id list reports a bare count here. */
  reviewed?: number[] | number;
  skipped?: number[];
  status: ReviewStatus;
}

/**
 * A later chunk failed after earlier chunks had already committed. The failed
 * request is separate from ids the client never reached, because those two
 * outcomes need different copy and recovery behavior.
 */
export class BulkReviewChunkError extends Error {
  constructor(
    readonly completed: BulkReviewResult,
    readonly failedIds: number[],
    readonly notAttemptedIds: number[],
    options?: ErrorOptions,
  ) {
    super("Bulk review failed after one or more chunks completed.", options);
    this.name = "BulkReviewChunkError";
  }
}

/**
 * Must stay at or below the engine's MAX_BULK_REVIEW (app/schemas/suggestion.py),
 * which rejects a larger batch outright. The queue is read a page at a time but
 * reviewed in one action, so a bulk review is not bounded by any single read —
 * "approve all" over a real fleet is far larger than a page.
 */
const BULK_REVIEW_CHUNK_SIZE = ENGINE_PAGE_LIMIT;

/**
 * Reviews a batch of any size, a chunk at a time, merging the per-chunk results
 * into the shape a single call would have returned.
 *
 * Sequential on purpose: the publication worker holds a row lock across the
 * WordPress call it makes for each suggestion, so overlapping chunks would pile
 * up on the same rows rather than finish sooner.
 */
export const bulkReview = async (suggestion_ids: number[], status: ReviewStatus) => {
  const merged: BulkReviewResult = {
    reviewed: [],
    reviewedCount: 0,
    skipped: [],
    status,
  };

  for (let start = 0; start < suggestion_ids.length; start += BULK_REVIEW_CHUNK_SIZE) {
    const chunk = suggestion_ids.slice(start, start + BULK_REVIEW_CHUNK_SIZE);
    try {
      const result = await api
        .post<BulkReviewResponse>("/suggestions/bulk-review", {
          suggestion_ids: chunk,
          status,
        })
        .then((r) => r.data);
      if (Array.isArray(result.reviewed)) {
        merged.reviewed.push(...result.reviewed);
        merged.reviewedCount += result.reviewed.length;
      } else {
        merged.reviewedCount += result.reviewed ?? 0;
      }
      merged.skipped.push(...(result.skipped ?? []));
    } catch (cause) {
      throw new BulkReviewChunkError(
        {
          reviewed: [...merged.reviewed],
          reviewedCount: merged.reviewedCount,
          skipped: [...merged.skipped],
          status,
        },
        chunk,
        suggestion_ids.slice(start + chunk.length),
        { cause },
      );
    }
  }

  return merged;
};

export const triggerAnalysis = (siteId: number) =>
  api.post<JobAccepted>(`/suggestions/${siteId}`).then((r) => r.data);

/** Generate the same ranked suggestions for one source article only. */
export const triggerArticleAnalysis = (articleId: number) =>
  api.post<JobAccepted>(`/articles/${articleId}/suggestions`).then((r) => r.data);

export const triggerComparison = (siteId: number) =>
  api.post<JobAccepted>(`/suggestions/${siteId}/compare`).then((r) => r.data);

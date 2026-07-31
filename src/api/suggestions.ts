import { api } from "./client";
import type {
  ReviewStatus,
  Suggestion,
  SuggestionStatus,
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
  score: number;
  id: number;
}

export interface SuggestionPage {
  items: Suggestion[];
  total: number | null;
  limit: number;
  next_cursor: SuggestionCursor | null;
}

export interface SuggestionQueueFilters {
  siteId?: number;
  status?: SuggestionStatus;
  minPercent?: number;
  maxPercent?: number;
}

const queueParams = (filters: SuggestionQueueFilters) => ({
  ...(filters.siteId === undefined ? {} : { site_id: filters.siteId }),
  ...(filters.status === undefined ? {} : { status: filters.status }),
  ...(filters.minPercent === undefined ? {} : { min_percent: filters.minPercent }),
  ...(filters.maxPercent === undefined ? {} : { max_percent: filters.maxPercent }),
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
          : { after_score: cursor.score, after_id: cursor.id }),
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
  total: number;
}

export const countSuggestions = (filters: SuggestionQueueFilters) =>
  api
    .get<SuggestionCounts>("/suggestions/counts", {
      params: queueParams(filters),
    })
    .then((response) => response.data);

export const reviewSuggestion = (id: number, status: ReviewStatus) =>
  api.put<Suggestion>(`/suggestions/${id}`, { status }).then((r) => r.data);

export interface BulkReviewResult {
  /** Rows that actually moved. */
  reviewed: number[];
  /** Includes legacy engines that confirm a count without returning row ids. */
  reviewedCount: number;
  /** Rows already picked up for publishing or expired, left untouched. */
  skipped: number[];
  status: ReviewStatus;
}

export interface FilteredBulkReviewResult {
  reviewed: number;
  skipped: number;
  reviewed_ids: number[] | null;
  status: Exclude<ReviewStatus, "pending">;
}

export interface FilteredBulkReviewRule {
  siteId?: number;
  status: Exclude<ReviewStatus, "pending">;
  thresholdPercent: number;
}

export const bulkReviewByFilter = (rule: FilteredBulkReviewRule) =>
  api
    .post<FilteredBulkReviewResult>("/suggestions/bulk-review-by-filter", {
      status: rule.status,
      threshold_percent: rule.thresholdPercent,
      ...(rule.siteId === undefined
        ? { all_sites: true }
        : { site_id: rule.siteId }),
    })
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

export const triggerComparison = (siteId: number) =>
  api.post<JobAccepted>(`/suggestions/${siteId}/compare`).then((r) => r.data);

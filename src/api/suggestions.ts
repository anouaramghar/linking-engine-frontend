import { api } from "./client";
import type { ReviewStatus, Suggestion } from "../types/suggestion";
import type { JobAccepted } from "../types/job";

/**
 * Must stay at or below the engine's MAX_PAGE_SIZE (app/api/pagination.py) —
 * the list endpoints reject a larger `limit` outright, so raising this turns
 * every read into a 422. Pinned from the backend side by
 * `test_every_list_endpoint_accepts_exactly_max_page_size`.
 */
const SUGGESTION_PAGE_SIZE = 1000;

const listSuggestionsForSite = async (siteId: number) => {
  const suggestions: Suggestion[] = [];
  let page: Suggestion[];

  do {
    page = await api
      .get<Suggestion[]>(`/suggestions/${siteId}`, {
        params: { limit: SUGGESTION_PAGE_SIZE, offset: suggestions.length },
      })
      .then((response) => response.data);
    suggestions.push(...page);
  } while (page.length === SUGGESTION_PAGE_SIZE);

  return suggestions;
};

export const listSuggestionsForSites = async (siteIds: number[]) => {
  const bySite = await Promise.all(siteIds.map(listSuggestionsForSite));
  return bySite.flat().sort((left, right) => right.score - left.score);
};

export const reviewSuggestion = (id: number, status: ReviewStatus) =>
  api.put<Suggestion>(`/suggestions/${id}`, { status }).then((r) => r.data);

export interface BulkReviewResult {
  /** How many rows actually moved. */
  reviewed: number;
  /** Rows the publication worker had already claimed, left untouched. */
  skipped: number[];
  status: ReviewStatus;
}

/**
 * Must stay at or below the engine's MAX_BULK_REVIEW (app/schemas/suggestion.py),
 * which rejects a larger batch outright. The queue is read a page at a time but
 * reviewed in one action, so a bulk review is not bounded by any single read —
 * "approve all" over a real fleet is far larger than a page.
 */
const BULK_REVIEW_CHUNK_SIZE = 1000;

/**
 * Reviews a batch of any size, a chunk at a time, merging the per-chunk results
 * into the shape a single call would have returned.
 *
 * Sequential on purpose: the publication worker holds a row lock across the
 * WordPress call it makes for each suggestion, so overlapping chunks would pile
 * up on the same rows rather than finish sooner.
 */
export const bulkReview = async (suggestion_ids: number[], status: ReviewStatus) => {
  const merged: BulkReviewResult = { reviewed: 0, skipped: [], status };

  for (let start = 0; start < suggestion_ids.length; start += BULK_REVIEW_CHUNK_SIZE) {
    const chunk = suggestion_ids.slice(start, start + BULK_REVIEW_CHUNK_SIZE);
    const result = await api
      .post<BulkReviewResult>("/suggestions/bulk-review", {
        suggestion_ids: chunk,
        status,
      })
      .then((r) => r.data);
    merged.reviewed += result.reviewed;
    merged.skipped.push(...result.skipped);
  }

  return merged;
};

export const triggerAnalysis = (siteId: number) =>
  api.post<JobAccepted>(`/suggestions/${siteId}`).then((r) => r.data);

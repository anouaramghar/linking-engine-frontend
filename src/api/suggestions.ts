import { api } from "./client";
import type { ReviewStatus, Suggestion } from "../types/suggestion";
import type { JobAccepted } from "../types/job";

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

export const bulkReview = (suggestion_ids: number[], status: ReviewStatus) =>
  api.post("/suggestions/bulk-review", { suggestion_ids, status }).then((r) => r.data);

export const triggerAnalysis = (siteId: number) =>
  api.post<JobAccepted>(`/suggestions/${siteId}`).then((r) => r.data);

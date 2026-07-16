import type { Suggestion, SuggestionStatus } from "../types/suggestion";

export type SuggestionMethodFilter = "all" | "baseline_cosine" | "gnn_graphsage";
export type StatusFilter = "all" | SuggestionStatus;
export type StatusOverrides = Record<number, SuggestionStatus>;
export type BulkReviewAction = "approve" | "reject";

export interface SuggestionQueueFilters {
  siteId: number;
  status: StatusFilter;
  method: SuggestionMethodFilter;
}

export interface BulkTargetRule {
  action: BulkReviewAction;
  siteId: number;
  method: SuggestionMethodFilter;
  threshold: number;
}

export const clampThreshold = (value: number) =>
  Math.min(100, Math.max(0, Number.isFinite(value) ? Math.round(value) : 0));

const matchesSite = (suggestion: Suggestion, siteId: number) =>
  siteId === 0 || suggestion.site_id === siteId;

const matchesMethod = (suggestion: Suggestion, method: SuggestionMethodFilter) =>
  method === "all" || suggestion.method === method;

export const resolveSuggestionStatuses = (
  suggestions: Suggestion[],
  overrides: StatusOverrides,
) =>
  suggestions.map((suggestion) => {
    const status = overrides[suggestion.id];
    return status && status !== suggestion.status ? { ...suggestion, status } : suggestion;
  });

export const filterSuggestions = (
  suggestions: Suggestion[],
  filters: SuggestionQueueFilters,
) =>
  suggestions.filter(
    (suggestion) =>
      matchesSite(suggestion, filters.siteId) &&
      matchesMethod(suggestion, filters.method) &&
      (filters.status === "all" || suggestion.status === filters.status),
  );

export const getBulkTargets = (suggestions: Suggestion[], rule: BulkTargetRule) => {
  const threshold = clampThreshold(rule.threshold) / 100;
  return suggestions.filter((suggestion) => {
    if (
      suggestion.status !== "pending" ||
      !matchesSite(suggestion, rule.siteId) ||
      !matchesMethod(suggestion, rule.method)
    ) {
      return false;
    }
    return rule.action === "approve"
      ? suggestion.score >= threshold
      : suggestion.score < threshold;
  });
};

export const adjustedStatusCount = (
  baseCount: number,
  fetchedSuggestions: Suggestion[],
  overrides: StatusOverrides,
  status: SuggestionStatus,
  siteId: number,
) => {
  const adjusted = fetchedSuggestions.reduce((count, suggestion) => {
    if (!matchesSite(suggestion, siteId)) return count;
    const override = overrides[suggestion.id];
    if (!override || override === suggestion.status) return count;
    if (suggestion.status === status) count -= 1;
    if (override === status) count += 1;
    return count;
  }, baseCount);
  return Math.max(0, adjusted);
};

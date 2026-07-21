import type { Suggestion, SuggestionStatus } from "../types/suggestion";

export type StatusFilter = "all" | SuggestionStatus;
export type StatusOverrides = Record<number, SuggestionStatus>;
export type BulkReviewAction = "approve" | "reject";

export interface SuggestionQueueFilters {
  siteId: number;
  status: StatusFilter;
}

export interface BulkTargetRule {
  action: BulkReviewAction;
  siteId: number;
  threshold: number;
}

export const clampThreshold = (value: number) =>
  Math.min(100, Math.max(0, Number.isFinite(value) ? Math.round(value) : 0));

const matchesSite = (suggestion: Suggestion, siteId: number) =>
  siteId === 0 || suggestion.site_id === siteId;

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
      (filters.status === "all" || suggestion.status === filters.status),
  );

export const getBulkTargets = (suggestions: Suggestion[], rule: BulkTargetRule) => {
  const threshold = clampThreshold(rule.threshold) / 100;
  return suggestions.filter((suggestion) => {
    if (suggestion.status !== "pending" || !matchesSite(suggestion, rule.siteId)) {
      return false;
    }
    return rule.action === "approve"
      ? suggestion.score >= threshold
      : suggestion.score < threshold;
  });
};

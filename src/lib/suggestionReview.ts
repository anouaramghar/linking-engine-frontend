import { scorePercent } from "./utils";
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
  status: StatusFilter;
  threshold: number;
}

/** Statuses the publication worker owns; a local override must never mask them. */
const WORKER_OWNED: SuggestionStatus[] = ["applying", "applied"];

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

/**
 * Bulk rules only ever act on suggestions the editor can actually see, so a rule
 * run from the Rejected list can never silently mutate the pending backlog.
 */
export const getBulkTargets = (suggestions: Suggestion[], rule: BulkTargetRule) => {
  if (rule.status !== "all" && rule.status !== "pending") return [];
  const threshold = clampThreshold(rule.threshold);
  return suggestions.filter((suggestion) => {
    if (suggestion.status !== "pending" || !matchesSite(suggestion, rule.siteId)) {
      return false;
    }
    const score = scorePercent(suggestion.score);
    return rule.action === "approve" ? score >= threshold : score < threshold;
  });
};

/**
 * Drop optimistic overrides the server has caught up with, and any override the
 * publication worker has moved past, so publish progress is never masked.
 */
export const pruneStatusOverrides = (
  suggestions: Suggestion[],
  overrides: StatusOverrides,
): StatusOverrides => {
  const next = { ...overrides };
  let changed = false;
  suggestions.forEach((suggestion) => {
    const override = next[suggestion.id];
    if (!override) return;
    if (override === suggestion.status || WORKER_OWNED.includes(suggestion.status)) {
      delete next[suggestion.id];
      changed = true;
    }
  });
  return changed ? next : overrides;
};

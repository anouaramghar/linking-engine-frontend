import type { Suggestion, SuggestionStatus } from "../types/suggestion";

export type StatusFilter = "all" | SuggestionStatus;
export type StatusOverrides = Record<number, SuggestionStatus>;
export type BulkReviewAction = "approve" | "reject";

export interface SuggestionQueueFilters {
  siteId: number;
  status: StatusFilter;
}

/** Statuses the publication worker owns; a local override must never mask them. */
const WORKER_OWNED: SuggestionStatus[] = ["applying", "applied"];

export const clampThreshold = (value: number) =>
  Math.min(100, Math.max(0, Number.isFinite(value) ? Math.round(value) : 0));

const matchesSite = (suggestion: Suggestion, siteId: number) =>
  siteId === 0 || suggestion.site_id === siteId;

/**
 * An override is live only until the server catches up with it, and never
 * outlives a status the publication worker owns — so publish progress is shown
 * the moment it arrives rather than a render later.
 */
const isLive = (suggestion: Suggestion, override: SuggestionStatus | undefined) =>
  !!override &&
  override !== suggestion.status &&
  !WORKER_OWNED.includes(suggestion.status);

export const resolveSuggestionStatuses = (
  suggestions: Suggestion[],
  overrides: StatusOverrides,
) =>
  suggestions.map((suggestion) => {
    const override = overrides[suggestion.id];
    return isLive(suggestion, override)
      ? { ...suggestion, status: override as SuggestionStatus }
      : suggestion;
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
 * Drop overrides that `resolveSuggestionStatuses` would already ignore. Purely
 * housekeeping so the map does not grow without bound across a long session —
 * correctness does not depend on it having run.
 */
export const pruneStatusOverrides = (
  suggestions: Suggestion[],
  overrides: StatusOverrides,
): StatusOverrides => {
  const next = { ...overrides };
  let changed = false;
  suggestions.forEach((suggestion) => {
    const override = next[suggestion.id];
    if (override && !isLive(suggestion, override)) {
      delete next[suggestion.id];
      changed = true;
    }
  });
  return changed ? next : overrides;
};

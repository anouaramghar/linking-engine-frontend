import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";

import { MAX_SEARCH_TERM } from "../api/suggestions";
import { clampThreshold } from "../lib/suggestionReview";
import type { StatusFilter } from "../lib/suggestionReview";
import type { SuggestionTargetOrigin } from "../types/suggestion";

/**
 * The review queue's filters, held in the URL rather than in component state.
 *
 * A queue is something a team talks about — "the pool links above 90% on the
 * blog" is a thing one editor needs to be able to hand to another. Component
 * state cannot be linked to, survives neither a refresh nor a back button, and
 * makes every screenshot ambiguous about what was being shown. The URL is the
 * one place that fixes all three at once.
 *
 * Only non-default values are written, so an untouched queue keeps a clean URL
 * and a shared link carries exactly the filters that were deliberately set.
 */
export interface QueueFilterState {
  status: StatusFilter;
  siteId: number;
  q: string;
  targetOrigin: SuggestionTargetOrigin | "";
  hideReciprocal: boolean;
  /** Lower bound for browsing, as whole percent. 0 means "no bound". */
  minScore: number;
  /** The bulk rule's boundary. Not a view filter — see ValidationPage. */
  threshold: number;
}

export const DEFAULT_FILTERS: QueueFilterState = {
  status: "pending",
  siteId: 0,
  q: "",
  targetOrigin: "",
  hideReciprocal: false,
  minScore: 0,
  threshold: 80,
};

const STATUS_VALUES: StatusFilter[] = [
  "all",
  "pending",
  "approved",
  "rejected",
  "applying",
  "applied",
  "expired",
  "failed",
];

const ORIGIN_VALUES: SuggestionTargetOrigin[] = ["internal", "content_pool"];

/**
 * Every reader below falls back to the default rather than trusting the URL.
 * A hand-edited or stale link is ordinary input here, not an error state — the
 * queue should still render something sensible.
 */
const readStatus = (raw: string | null): StatusFilter =>
  STATUS_VALUES.includes(raw as StatusFilter)
    ? (raw as StatusFilter)
    : DEFAULT_FILTERS.status;

const readOrigin = (raw: string | null): SuggestionTargetOrigin | "" =>
  ORIGIN_VALUES.includes(raw as SuggestionTargetOrigin)
    ? (raw as SuggestionTargetOrigin)
    : "";

const readSiteId = (raw: string | null) => {
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : 0;
};

const readPercent = (raw: string | null, fallback: number) =>
  raw === null || raw === "" || !Number.isFinite(Number(raw))
    ? fallback
    : clampThreshold(Number(raw));

export const useQueueFilters = () => {
  const [params, setParams] = useSearchParams();

  const filters = useMemo<QueueFilterState>(
    () => ({
      status: readStatus(params.get("status")),
      siteId: readSiteId(params.get("site")),
      q: (params.get("q") ?? "").slice(0, MAX_SEARCH_TERM),
      targetOrigin: readOrigin(params.get("origin")),
      hideReciprocal: params.get("unique") === "1",
      minScore: readPercent(params.get("min"), DEFAULT_FILTERS.minScore),
      threshold: readPercent(params.get("threshold"), DEFAULT_FILTERS.threshold),
    }),
    [params],
  );

  const setFilters = useCallback(
    (patch: Partial<QueueFilterState>) => {
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          const merged = { ...filters, ...patch };
          const write = (key: string, value: string, isDefault: boolean) => {
            if (isDefault) next.delete(key);
            else next.set(key, value);
          };
          write("status", merged.status, merged.status === DEFAULT_FILTERS.status);
          write("site", String(merged.siteId), merged.siteId === 0);
          write("q", merged.q, merged.q.trim() === "");
          write("origin", merged.targetOrigin, merged.targetOrigin === "");
          write("unique", "1", !merged.hideReciprocal);
          write("min", String(merged.minScore), merged.minScore === 0);
          write(
            "threshold",
            String(merged.threshold),
            merged.threshold === DEFAULT_FILTERS.threshold,
          );
          return next;
        },
        // Filtering is navigation within one view, not a place in history:
        // replace, so Back leaves the queue instead of stepping through every
        // keystroke of a search term.
        { replace: true },
      );
    },
    [filters, setParams],
  );

  const reset = useCallback(() => {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        ["status", "site", "q", "origin", "unique", "min"].forEach((key) =>
          next.delete(key),
        );
        return next;
      },
      { replace: true },
    );
  }, [setParams]);

  /**
   * Whether anything is narrowing the queue. The threshold is excluded on
   * purpose — it is the bulk rule's boundary, not a filter on what is shown,
   * so it must not light up a "clear filters" affordance that would not
   * change the list.
   */
  const isFiltered =
    filters.status !== DEFAULT_FILTERS.status ||
    filters.siteId !== 0 ||
    filters.q.trim() !== "" ||
    filters.targetOrigin !== "" ||
    filters.hideReciprocal ||
    filters.minScore !== 0;

  return { filters, setFilters, reset, isFiltered };
};

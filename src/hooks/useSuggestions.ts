import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useMemo } from "react";

import {
  bulkReview,
  bulkReviewByFilter,
  countSuggestions,
  getPlacement,
  getSuggestionEvents,
  listAllSuggestionIds,
  listSuggestionPage,
  markSuggestionsExposed,
  reviewSuggestion,
  triggerArticleAnalysis,
  undoFilteredBulkReview,
} from "../api/suggestions";
import type {
  SuggestionCursor,
  SuggestionQueueFilters,
} from "../api/suggestions";
import type { RejectionReason, ReviewStatus } from "../types/suggestion";

export const useSuggestions = (
  filters: SuggestionQueueFilters,
  enabled = true,
) => {
  const query = useInfiniteQuery({
    queryKey: ["suggestions", "queue", filters],
    queryFn: ({ pageParam }) => listSuggestionPage(filters, pageParam),
    initialPageParam: null as SuggestionCursor | null,
    getNextPageParam: (lastPage) => lastPage.next_cursor ?? undefined,
    placeholderData: keepPreviousData,
    enabled,
  });
  const items = useMemo(
    () => query.data?.pages.flatMap((page) => page.items) ?? [],
    [query.data],
  );

  return {
    ...query,
    items,
  };
};

/**
 * `/suggestions/counts` answers with every status at once, so a status is not a
 * bound it accepts. Dropping it here keeps the request honest and, more
 * usefully, keeps two callers asking the same question on one cache entry:
 * SelectedPage asks with `status: "approved"` and reads `.approved` off the
 * same answer the queue's chips are already holding.
 */
const countScope = (filters: SuggestionQueueFilters): SuggestionQueueFilters => {
  const scope = { ...filters };
  delete scope.status;
  return scope;
};

export const useSuggestionCounts = (
  filters: SuggestionQueueFilters,
  enabled = true,
) => {
  const scope = countScope(filters);
  return useQuery({
    queryKey: ["suggestions", "counts", scope],
    queryFn: () => countSuggestions(scope),
    // The threshold rule is part of this key, so every change of it is a new
    // query. Without a placeholder the counts blink to `undefined`, the page
    // reads that as zero, and the bulk buttons those counts label disable
    // themselves under the user's cursor. Holding the last answer keeps the
    // control usable; it is at most one debounce interval stale.
    placeholderData: keepPreviousData,
    // Against the client-wide default, and only here.
    //
    // Nothing else moves these numbers when this browser is idle: a colleague
    // reviewing the same queue does not reach this cache, and React Query stops
    // its intervals in an unfocused window — so a tab left open over lunch came
    // back showing the fleet as it stood an hour ago. Refetch on focus is what
    // the polled queries already do; this one fires once per return rather than
    // on a timer, and it is the cheapest query in the dashboard: one grouped
    // aggregate over an indexed column.
    //
    // Deliberately not extended to `["sites"]` or the paginated queue. Those
    // are the heavy reads the client-wide default exists to protect, and a
    // refetch of every loaded page on every focus is the cost it avoids.
    refetchOnWindowFocus: true,
    enabled,
  });
};

/**
 * The placement for the open suggestion, fetched only while one is open.
 *
 * Deliberately outside the `["suggestions"]` key namespace: reviewing a row
 * invalidates that whole tree, and a placement is unaffected by a decision —
 * sharing the prefix would throw away a generated answer and pay to regenerate
 * it every time the editor approved something.
 *
 * Never stale, because it is not: the engine stores the answer on the row, so a
 * refetch can only return what is already in the cache.
 */
const PLACEMENT_CACHE_MS = 15 * 60 * 1000;

export const usePlacement = (suggestionId: number | null) =>
  useQuery({
    queryKey: ["placement", suggestionId],
    queryFn: () => getPlacement(suggestionId as number),
    enabled: suggestionId !== null,
    staleTime: Infinity,
    gcTime: PLACEMENT_CACHE_MS,
    // A failed generation is worth one automatic retry — but not the default
    // three, which would keep an editor waiting through three model timeouts
    // before the card admits anything is wrong. Beyond that it is their call.
    retry: 1,
  });

/** Lazy audit history for the one suggestion whose detail drawer is open. */
export const useSuggestionEvents = (suggestionId: number | null) =>
  useQuery({
    queryKey: ["suggestion-events", suggestionId],
    queryFn: () => getSuggestionEvents(suggestionId as number),
    enabled: suggestionId !== null,
  });

const useInvalidateQueue = () => {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["suggestions"] }),
      qc.invalidateQueries({ queryKey: ["suggestion-events"] }),
      qc.invalidateQueries({ queryKey: ["publish", "pending"] }),
    ]);
};

/**
 * A single decision is already represented locally by ValidationPage. Mark the
 * paginated rows stale without immediately downloading every loaded page again;
 * refresh only the small counters and publication-inbox summary.
 */
const useInvalidateSingleReview = () => {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({
        queryKey: ["suggestions", "queue"],
        refetchType: "none",
      }),
      qc.invalidateQueries({ queryKey: ["suggestions", "counts"] }),
      qc.invalidateQueries({ queryKey: ["publish", "pending"] }),
    ]);
};

export const useReview = () => {
  const invalidate = useInvalidateSingleReview();
  return useMutation({
    mutationFn: ({
      id,
      status,
      rejectionReason,
    }: {
      id: number;
      status: ReviewStatus;
      rejectionReason?: RejectionReason;
    }) => reviewSuggestion(id, status, rejectionReason),
    onSuccess: invalidate,
  });
};

export const useMarkSuggestionsExposed = () =>
  useMutation({
    mutationFn: ({
      ids,
      surface,
    }: {
      ids: number[];
      surface?: "queue" | "preview";
    }) => markSuggestionsExposed(ids, surface),
  });

export const useBulkReview = () => {
  const invalidate = useInvalidateQueue();
  return useMutation({
    mutationFn: ({ ids, status }: { ids: number[]; status: ReviewStatus }) =>
      bulkReview(ids, status),
    // Earlier chunks may already be committed when a later one fails.
    onSettled: invalidate,
  });
};

export const useFilteredBulkReview = () => {
  const invalidate = useInvalidateQueue();
  return useMutation({
    mutationFn: bulkReviewByFilter,
    onSettled: invalidate,
  });
};

export const useFilteredBulkUndo = () => {
  const invalidate = useInvalidateQueue();
  return useMutation({
    mutationFn: undoFilteredBulkReview,
    onSettled: invalidate,
  });
};

export const useAllFilteredSuggestionIds = () =>
  useMutation({ mutationFn: listAllSuggestionIds });

/** Reuse the site analysis task with one source article as its explicit scope. */
export const useTriggerArticleAnalysis = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (articleId: number) => triggerArticleAnalysis(articleId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["jobs"] });
      qc.invalidateQueries({ queryKey: ["suggestions"] });
    },
  });
};

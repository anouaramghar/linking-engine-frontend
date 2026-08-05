import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import {
  bulkReview,
  bulkReviewByFilter,
  countSuggestions,
  listSuggestionPage,
  reviewSuggestion,
} from "../api/suggestions";
import type {
  SuggestionCursor,
  SuggestionQueueFilters,
} from "../api/suggestions";
import type { ReviewStatus } from "../types/suggestion";

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

  return {
    ...query,
    items: query.data?.pages.flatMap((page) => page.items) ?? [],
  };
};

export const useSuggestionCounts = (
  filters: SuggestionQueueFilters,
  enabled = true,
) =>
  useQuery({
    queryKey: ["suggestions", "counts", filters],
    queryFn: () => countSuggestions(filters),
    // The threshold rule is part of this key, so every change of it is a new
    // query. Without a placeholder the counts blink to `undefined`, the page
    // reads that as zero, and the bulk buttons those counts label disable
    // themselves under the user's cursor. Holding the last answer keeps the
    // control usable; it is at most one debounce interval stale.
    placeholderData: keepPreviousData,
    enabled,
  });

const useInvalidateQueue = () => {
  const qc = useQueryClient();
  return () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["suggestions"] }),
      qc.invalidateQueries({ queryKey: ["publish", "pending"] }),
    ]);
};

export const useReview = () => {
  const invalidate = useInvalidateQueue();
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: ReviewStatus }) =>
      reviewSuggestion(id, status),
    onSuccess: invalidate,
  });
};

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

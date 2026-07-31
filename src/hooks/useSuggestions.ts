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

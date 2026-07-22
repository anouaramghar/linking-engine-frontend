import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { bulkReview, listSuggestionsForSites, reviewSuggestion } from "../api/suggestions";
import type { ReviewStatus } from "../types/suggestion";

export const useSuggestions = (siteIds: number[]) =>
  useQuery({
    queryKey: ["suggestions", siteIds],
    queryFn: () => listSuggestionsForSites(siteIds),
    enabled: siteIds.length > 0,
  });

const useInvalidate = () => {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["suggestions"] });
};

export const useReview = () => {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: ReviewStatus }) =>
      reviewSuggestion(id, status),
    onSuccess: invalidate,
  });
};

export const useBulkReview = () => {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ ids, status }: { ids: number[]; status: ReviewStatus }) =>
      bulkReview(ids, status),
    // Earlier chunks may already be committed when a later one fails.
    onSettled: invalidate,
  });
};

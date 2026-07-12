import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { bulkReview, listSuggestions, reviewSuggestion } from "../api/suggestions";
import type { SuggestionFilters } from "../api/suggestions";
import type { SuggestionStatus } from "../types/suggestion";

export const useSuggestions = (filters: SuggestionFilters) =>
  useQuery({
    queryKey: ["suggestions", filters],
    queryFn: () => listSuggestions(filters),
  });

const useInvalidate = () => {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["suggestions"] });
    qc.invalidateQueries({ queryKey: ["stats"] });
  };
};

export const useReview = () => {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ id, status }: { id: number; status: SuggestionStatus }) =>
      reviewSuggestion(id, status),
    onSuccess: invalidate,
  });
};

export const useBulkReview = () => {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: ({ ids, status }: { ids: number[]; status: SuggestionStatus }) =>
      bulkReview(ids, status),
    onSuccess: invalidate,
  });
};

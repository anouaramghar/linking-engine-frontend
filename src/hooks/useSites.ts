import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  bulkCreateSites,
  createSite,
  deleteSite,
  listSites,
  updateSuggestionMode,
} from "../api/sites";
import type { SuggestionMode } from "../types/site";

export const useSites = () => useQuery({ queryKey: ["sites"], queryFn: listSites });

export const useCreateSite = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createSite,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sites"] }),
  });
};

export const useBulkCreateSites = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: bulkCreateSites,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sites"] }),
  });
};

export const useDeleteSite = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteSite,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sites"] }),
  });
};

export const useUpdateSuggestionMode = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      siteId,
      suggestionMode,
    }: {
      siteId: number;
      suggestionMode: SuggestionMode;
    }) => updateSuggestionMode(siteId, suggestionMode),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sites"] }),
  });
};

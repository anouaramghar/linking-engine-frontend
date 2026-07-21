import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  bulkCreateSites,
  createSite,
  deleteSite,
  fleetStats,
  listSites,
  siteEvaluation,
} from "../api/sites";

export const useSites = () => useQuery({ queryKey: ["sites"], queryFn: listSites });

export const useStats = () =>
  useQuery({ queryKey: ["stats"], queryFn: fleetStats, refetchInterval: 15000 });

export const useEvaluation = (siteId: number | null) =>
  useQuery({
    queryKey: ["evaluation", siteId],
    queryFn: () => siteEvaluation(siteId!),
    enabled: siteId !== null,
    retry: false, // 404 just means "no evaluation run yet"
  });

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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sites"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
    },
  });
};

export const useDeleteSite = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteSite,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["sites"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
    },
  });
};

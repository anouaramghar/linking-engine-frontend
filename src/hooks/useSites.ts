import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  approvePoolSource,
  bulkCreateSites,
  createSite,
  deleteSite,
  listPoolAuditEvents,
  listSites,
  reactivatePoolSource,
  revokePoolSource,
} from "../api/sites";

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

const usePoolMutation = (mutationFn: (id: number) => Promise<unknown>) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sites"] }),
  });
};

export const useApprovePoolSource = () => usePoolMutation(approvePoolSource);
export const useRevokePoolSource = () => usePoolMutation(revokePoolSource);
export const useReactivatePoolSource = () => usePoolMutation(reactivatePoolSource);

export const usePoolAuditEvents = (siteId: number | null) =>
  useQuery({
    queryKey: ["pool-audit", siteId],
    queryFn: () => listPoolAuditEvents(siteId!),
    enabled: siteId !== null,
  });

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  approvePoolSource,
  bulkCreateSites,
  createSite,
  deleteSite,
  listPoolAuditEvents,
  getExternalLinkPolicy,
  getEditorialRankingPolicy,
  listExternalSourceEvaluations,
  listSites,
  reactivatePoolSource,
  revokePoolSource,
  updateExternalLinkPolicy,
  updateEditorialRankingPolicy,
} from "../api/sites";
import type { EditorialRankingPolicyUpdate, ExternalLinkPolicyUpdate } from "../types/site";

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

export const useExternalLinkPolicy = (siteId: number | null) =>
  useQuery({
    queryKey: ["external-link-policy", siteId],
    queryFn: () => getExternalLinkPolicy(siteId!),
    enabled: siteId !== null,
  });

export const useExternalSourceEvaluations = (siteId: number | null) =>
  useQuery({
    queryKey: ["external-link-policy", siteId, "sources"],
    queryFn: () => listExternalSourceEvaluations(siteId!),
    enabled: siteId !== null,
  });

export const useUpdateExternalLinkPolicy = (siteId: number) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (policy: ExternalLinkPolicyUpdate) =>
      updateExternalLinkPolicy({ siteId, policy }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["external-link-policy", siteId] });
      void qc.invalidateQueries({ queryKey: ["suggestions"] });
      void qc.invalidateQueries({ queryKey: ["suggestion-counts"] });
    },
  });
};

export const useEditorialRankingPolicy = (siteId: number | null) =>
  useQuery({
    queryKey: ["editorial-ranking-policy", siteId],
    queryFn: () => getEditorialRankingPolicy(siteId!),
    enabled: siteId !== null,
  });

export const useUpdateEditorialRankingPolicy = (siteId: number) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (policy: EditorialRankingPolicyUpdate) =>
      updateEditorialRankingPolicy({ siteId, policy }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["editorial-ranking-policy", siteId] });
      void qc.invalidateQueries({ queryKey: ["sites"] });
    },
  });
};

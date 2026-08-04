import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  approvePoolSource,
  bulkCreateSites,
  createSite,
  deleteSite,
  listSites,
  reactivatePoolSource,
  revokePoolSourceApproval,
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

export const useApprovePoolSource = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, approvedBy }: { id: number; approvedBy: string }) =>
      approvePoolSource(id, approvedBy),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sites"] }),
  });
};

export const useRevokePoolSourceApproval = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: revokePoolSourceApproval,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sites"] }),
  });
};

export const useReactivatePoolSource = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reactivatedBy }: { id: number; reactivatedBy: string }) =>
      reactivatePoolSource(id, reactivatedBy),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["sites"] }),
  });
};

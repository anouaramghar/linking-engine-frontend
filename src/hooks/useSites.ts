import {
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import {
  approvePoolSource,
  bulkCreateSites,
  createSite,
  deleteSite,
  listPoolAuditEvents,
  POOL_AUDIT_PAGE_SIZE,
  listSites,
  SITE_PAGE_SIZE,
  reactivatePoolSource,
  revokePoolSource,
} from "../api/sites";

export const useSites = (search = "") =>
  useInfiniteQuery({
    queryKey: ["sites", search.trim()],
    queryFn: ({ pageParam }) => listSites(pageParam, search),
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) =>
      lastPage.length === SITE_PAGE_SIZE ? pages.length * SITE_PAGE_SIZE : undefined,
    select: (data) => data.pages.flat(),
  });

const invalidateSiteDependencies = (qc: ReturnType<typeof useQueryClient>) =>
  Promise.all([
    qc.invalidateQueries({ queryKey: ["sites"] }),
    qc.invalidateQueries({ queryKey: ["suggestions"] }),
    qc.invalidateQueries({ queryKey: ["publish", "pending"] }),
    qc.invalidateQueries({ queryKey: ["jobs", "active"] }),
    qc.invalidateQueries({ queryKey: ["pool-audit"] }),
  ]);

export const useCreateSite = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createSite,
    onSuccess: () => invalidateSiteDependencies(qc),
  });
};

export const useBulkCreateSites = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: bulkCreateSites,
    onSuccess: () => invalidateSiteDependencies(qc),
  });
};

export const useDeleteSite = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, confirmName }: { id: number; confirmName: string }) =>
      deleteSite(id, confirmName),
    onSuccess: () => invalidateSiteDependencies(qc),
  });
};

const usePoolMutation = (mutationFn: (id: number) => Promise<unknown>) => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => invalidateSiteDependencies(qc),
  });
};

export const useApprovePoolSource = () => usePoolMutation(approvePoolSource);
export const useRevokePoolSource = () => usePoolMutation(revokePoolSource);
export const useReactivatePoolSource = () => usePoolMutation(reactivatePoolSource);

export const usePoolAuditEvents = (siteId: number | null) => {
  const query = useInfiniteQuery({
    queryKey: ["pool-audit", siteId],
    queryFn: ({ pageParam }) =>
      listPoolAuditEvents(siteId!, POOL_AUDIT_PAGE_SIZE, pageParam),
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) =>
      lastPage.length === POOL_AUDIT_PAGE_SIZE
        ? pages.length * POOL_AUDIT_PAGE_SIZE
        : undefined,
    enabled: siteId !== null,
  });

  return {
    ...query,
    events: query.data?.pages.flatMap((page) => page) ?? [],
  };
};

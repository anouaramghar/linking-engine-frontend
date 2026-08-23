import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import {
  approvePoolSource,
  bulkCreateSites,
  clearWordPressCredentials,
  createSite,
  deleteSite,
  getEditorialRankingPolicy,
  getExternalLinkPolicy,
  importArticleRows,
  ingestPoolSourceBatch,
  listPoolAuditEvents,
  listExternalSourceEvaluations,
  listSiteArticles,
  POOL_AUDIT_PAGE_SIZE,
  listSites,
  setWordPressCredentials,
  SITE_PAGE_SIZE,
  reactivatePoolSource,
  revokePoolSource,
  updateExternalLinkPolicy,
  updateEditorialRankingPolicy,
  validatePoolSources,
} from "../api/sites";
import type {
  ArticleImportRow,
  EditorialRankingPolicyUpdate,
  ExternalLinkPolicyUpdate,
} from "../types/site";

export const useSites = (search = "") =>
  useInfiniteQuery({
    queryKey: ["sites", search.trim()],
    queryFn: ({ pageParam }) => listSites(pageParam, search),
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) =>
      lastPage.length === SITE_PAGE_SIZE ? pages.length * SITE_PAGE_SIZE : undefined,
    select: (data) => data.pages.flat(),
  });

export const useSiteArticles = (siteId: number | null) => {
  const query = useInfiniteQuery({
    queryKey: ["sites", siteId, "articles"],
    queryFn: ({ pageParam }) => listSiteArticles(siteId!, pageParam),
    initialPageParam: 0,
    getNextPageParam: (lastPage, pages) =>
      lastPage.length === SITE_PAGE_SIZE ? pages.length * SITE_PAGE_SIZE : undefined,
    enabled: siteId !== null,
  });
  return {
    ...query,
    articles: query.data?.pages.flatMap((page) => page) ?? [],
  };
};

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

export const useImportArticleRows = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      siteId,
      rows,
      replaceSnapshot,
    }: {
      siteId: number;
      rows: ArticleImportRow[];
      replaceSnapshot?: boolean;
    }) => importArticleRows(siteId, rows, replaceSnapshot),
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

/**
 * Both invalidate `publish/pending` through the shared helper, which is the
 * point: attaching an account is what turns "this site cannot publish" on the
 * queue back into a review button, and clearing one turns it off again.
 */
export const useSetWordPressCredentials = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      credentials,
    }: {
      id: number;
      credentials: { wp_username: string; wp_app_password: string };
    }) => setWordPressCredentials(id, credentials),
    onSuccess: () => invalidateSiteDependencies(qc),
  });
};

export const useClearWordPressCredentials = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => clearWordPressCredentials(id),
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

export const useValidatePoolSources = () =>
  useMutation({
    mutationFn: validatePoolSources,
  });

export const usePoolIngestionBatch = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ingestPoolSourceBatch,
    onSettled: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: ["jobs", "active"] }),
        qc.invalidateQueries({ queryKey: ["sites"] }),
      ]),
  });
};

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

import { api } from "./client";
import type {
  BulkImportResult,
  Site,
  SiteCreate,
  PoolAuditEvent,
  ExternalLinkPolicy,
  ExternalLinkPolicyUpdate,
  ExternalSourceEvaluation,
  EditorialRankingPolicy,
  EditorialRankingPolicyUpdate,
  ArticleImportResult,
  ArticleImportRow,
} from "../types/site";
import type { JobAccepted } from "../types/job";
import { ENGINE_PAGE_LIMIT } from "./engineLimits";

export const SITE_PAGE_SIZE = ENGINE_PAGE_LIMIT;

export const listSites = (offset = 0, search = "") =>
  api
    .get<Site[]>("/sites", {
      params: { limit: SITE_PAGE_SIZE, offset, search: search.trim() || undefined },
    })
    .then((response) => response.data);

export const createSite = (payload: SiteCreate) =>
  api.post<Site>("/sites", payload).then((r) => r.data);

export const bulkCreateSites = (sites: SiteCreate[]) =>
  api.post<BulkImportResult>("/sites/bulk", { sites }).then((r) => r.data);

export const deleteSite = (id: number, confirmName: string) =>
  api.delete(`/sites/${id}`, { params: { confirm_name: confirmName } });

export const ingestSite = (id: number) =>
  api.post<JobAccepted>(`/sites/${id}/ingest`).then((r) => r.data);

export const importArticleRows = (
  siteId: number,
  rows: ArticleImportRow[],
  replaceSnapshot = false,
) =>
  api
    .post<ArticleImportResult>(`/sites/${siteId}/articles/import`, {
      rows,
      replace_snapshot: replaceSnapshot,
    })
    .then((r) => r.data);

// `publishSite` used to live here, and being reachable from the Sites page is
// what made it dangerous: one click published everything selected, with nobody
// having seen the resulting edit. Queueing now lives in api/publish.ts next to
// the preparation and approval it must follow.

/**
 * Attach a WordPress account to a site that already exists, or replace the one
 * it has. Setting and replacing are the same call: WordPress stores only a hash
 * of an application password, so the old value cannot be proven, and it is
 * being replaced precisely because it stopped working.
 */
export const setWordPressCredentials = (
  id: number,
  credentials: { wp_username: string; wp_app_password: string },
) => api.put<Site>(`/sites/${id}/credentials`, credentials).then((r) => r.data);

/** Detach the account. The site keeps crawling; it stops being publishable. */
export const clearWordPressCredentials = (id: number) =>
  api.delete<Site>(`/sites/${id}/credentials`).then((r) => r.data);

export const approvePoolSource = (id: number) =>
  api.post<Site>(`/sites/${id}/pool-source/approval`).then((r) => r.data);

export const revokePoolSource = (id: number) =>
  api.delete<Site>(`/sites/${id}/pool-source/approval`).then((r) => r.data);

export const reactivatePoolSource = (id: number) =>
  api.post<Site>(`/sites/${id}/pool-source/reactivate`).then((r) => r.data);

export const POOL_AUDIT_PAGE_SIZE = 50;

export const listPoolAuditEvents = (
  id: number,
  limit = POOL_AUDIT_PAGE_SIZE,
  offset = 0,
) =>
  api
    .get<PoolAuditEvent[]>(`/sites/${id}/pool-source/audit-events`, {
      params: { limit, offset },
    })
    .then((r) => r.data);

export const getExternalLinkPolicy = (siteId: number) =>
  api.get<ExternalLinkPolicy>(`/sites/${siteId}/external-link-policy`).then((r) => r.data);

export const updateExternalLinkPolicy = ({
  siteId,
  policy,
}: {
  siteId: number;
  policy: ExternalLinkPolicyUpdate;
}) =>
  api
    .put<ExternalLinkPolicy>(`/sites/${siteId}/external-link-policy`, policy)
    .then((r) => r.data);

export const listExternalSourceEvaluations = (siteId: number) =>
  api
    .get<{ items: ExternalSourceEvaluation[] }>(
      `/sites/${siteId}/external-link-policy/sources`,
    )
    .then((r) => r.data.items);

export const getEditorialRankingPolicy = (siteId: number) =>
  api
    .get<EditorialRankingPolicy>(`/sites/${siteId}/editorial-ranking-policy`)
    .then((response) => response.data);

export const updateEditorialRankingPolicy = ({
  siteId,
  policy,
}: {
  siteId: number;
  policy: EditorialRankingPolicyUpdate;
}) =>
  api
    .put<EditorialRankingPolicy>(`/sites/${siteId}/editorial-ranking-policy`, policy)
    .then((response) => response.data);

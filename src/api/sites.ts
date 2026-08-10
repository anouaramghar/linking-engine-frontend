import { api } from "./client";
import type {
  BulkImportResult,
  Site,
  SiteCreate,
  PoolAuditEvent,
  ExternalLinkPolicy,
  ExternalLinkPolicyUpdate,
  ExternalSourceEvaluation,
} from "../types/site";
import type { JobAccepted } from "../types/job";
import { ENGINE_PAGE_LIMIT } from "./engineLimits";

const SITE_PAGE_SIZE = ENGINE_PAGE_LIMIT;
const MAX_SITE_PAGES = 1000;

export const listSites = async () => {
  const sites: Site[] = [];
  const seenIds = new Set<number>();

  for (let pageNumber = 0; pageNumber < MAX_SITE_PAGES; pageNumber += 1) {
    const page = await api
      .get<Site[]>("/sites", { params: { limit: SITE_PAGE_SIZE, offset: sites.length } })
      .then((response) => response.data);

    if (page.length > SITE_PAGE_SIZE) {
      throw new Error("The sites API returned more rows than the requested page size.");
    }
    if (page.some((site) => seenIds.has(site.id))) {
      throw new Error("The sites API repeated a page instead of advancing its offset.");
    }

    page.forEach((site) => seenIds.add(site.id));
    sites.push(...page);
    if (page.length < SITE_PAGE_SIZE) return sites;
  }

  throw new Error(
    `The sites API exceeded the ${MAX_SITE_PAGES * SITE_PAGE_SIZE}-site safety limit.`,
  );
};

export const createSite = (payload: SiteCreate) =>
  api.post<Site>("/sites", payload).then((r) => r.data);

export const bulkCreateSites = (sites: SiteCreate[]) =>
  api.post<BulkImportResult>("/sites/bulk", { sites }).then((r) => r.data);

export const deleteSite = (id: number) => api.delete(`/sites/${id}`);

export const ingestSite = (id: number) =>
  api.post<JobAccepted>(`/sites/${id}/ingest`).then((r) => r.data);

export const publishSite = (id: number) =>
  api.post<JobAccepted>(`/publish/${id}`).then((r) => r.data);

export const approvePoolSource = (id: number) =>
  api.post<Site>(`/sites/${id}/pool-source/approval`).then((r) => r.data);

export const revokePoolSource = (id: number) =>
  api.delete<Site>(`/sites/${id}/pool-source/approval`).then((r) => r.data);

export const reactivatePoolSource = (id: number) =>
  api.post<Site>(`/sites/${id}/pool-source/reactivate`).then((r) => r.data);

export const listPoolAuditEvents = (id: number) =>
  api
    .get<PoolAuditEvent[]>(`/sites/${id}/pool-source/audit-events`, {
      params: { limit: 50, offset: 0 },
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

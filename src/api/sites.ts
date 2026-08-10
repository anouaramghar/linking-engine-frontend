import { api } from "./client";
import type {
  BulkImportResult,
  Site,
  SiteCreate,
  PoolAuditEvent,
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

export const publishSite = (id: number) =>
  api.post<JobAccepted>(`/publish/${id}`).then((r) => r.data);

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

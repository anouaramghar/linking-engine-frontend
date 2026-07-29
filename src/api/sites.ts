import { api } from "./client";
import type {
  BulkImportResult,
  Site,
  SiteCreate,
} from "../types/site";
import type { JobAccepted } from "../types/job";
import { ENGINE_PAGE_LIMIT } from "./engineLimits";

const SITE_PAGE_SIZE = ENGINE_PAGE_LIMIT;

export const listSites = async () => {
  const sites: Site[] = [];
  let page: Site[];

  do {
    page = await api
      .get<Site[]>("/sites", { params: { limit: SITE_PAGE_SIZE, offset: sites.length } })
      .then((response) => response.data);
    sites.push(...page);
  } while (page.length === SITE_PAGE_SIZE);

  return sites;
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

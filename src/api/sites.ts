import { api } from "./client";
import type {
  BulkImportResult,
  EvaluationResult,
  Site,
  SiteCreate,
  SiteStats,
} from "../types/site";
import type { JobAccepted } from "../types/job";

export const listSites = () => api.get<Site[]>("/sites").then((r) => r.data);

export const createSite = (payload: SiteCreate) =>
  api.post<Site>("/sites", payload).then((r) => r.data);

export const bulkCreateSites = (sites: SiteCreate[]) =>
  api.post<BulkImportResult>("/sites/bulk", { sites }).then((r) => r.data);

export const deleteSite = (id: number) => api.delete(`/sites/${id}`);

export const ingestSite = (id: number) =>
  api.post<JobAccepted>(`/sites/${id}/ingest`).then((r) => r.data);

export const publishSite = (id: number) =>
  api.post<JobAccepted>(`/publish/${id}`).then((r) => r.data);

export const fleetIngest = () => api.post("/fleet/ingest").then((r) => r.data);

export const fleetAnalyze = (method: string) =>
  api.post("/fleet/analyze", null, { params: { method } }).then((r) => r.data);

export const fleetStats = () => api.get<SiteStats[]>("/stats").then((r) => r.data);

export const siteEvaluation = (id: number) =>
  api.get<EvaluationResult>(`/stats/${id}/evaluation`).then((r) => r.data);

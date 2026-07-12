import { api } from "./client";
import type { Suggestion, SuggestionStatus } from "../types/suggestion";
import type { JobAccepted } from "../types/job";

export interface SuggestionFilters {
  site_id?: number;
  status?: string;
  method?: string;
  limit?: number;
  offset?: number;
}

export const listSuggestions = (filters: SuggestionFilters) =>
  api.get<Suggestion[]>("/suggestions", { params: filters }).then((r) => r.data);

export const reviewSuggestion = (id: number, status: SuggestionStatus) =>
  api.put<Suggestion>(`/suggestions/${id}`, { status }).then((r) => r.data);

export const bulkReview = (suggestion_ids: number[], status: SuggestionStatus) =>
  api.post("/suggestions/bulk-review", { suggestion_ids, status }).then((r) => r.data);

export const triggerAnalysis = (siteId: number, method: string) =>
  api
    .post<JobAccepted>(`/suggestions/${siteId}`, null, { params: { method } })
    .then((r) => r.data);

export const triggerExternal = (siteId: number) =>
  api.post<JobAccepted>(`/suggestions/${siteId}/external`).then((r) => r.data);

export const triggerAnchors = (siteId: number) =>
  api.post<JobAccepted>(`/suggestions/${siteId}/anchors`).then((r) => r.data);

import { api } from "./client";

export interface TraceEvent {
  id: number;
  suggestion_id: number;
  trace_id: string;
  site_id: number;
  site_name: string;
  source_title: string;
  target_title: string;
  suggestion_status: string;
  event_type: string;
  actor: string;
  details: Record<string, unknown>;
  publish_error: string | null;
  created_at: string;
}

export interface TraceEventPage {
  items: TraceEvent[];
  total: number;
  limit: number;
  offset: number;
}

export interface TraceEventFilters {
  trace_id?: string;
  actor?: string;
  event_type?: string;
  status?: string;
  site_id?: number;
  date_from?: string;
  date_to?: string;
}

export const getTraceEvents = (
  filters: TraceEventFilters,
  limit = 50,
  offset = 0,
) =>
  api
    .get<TraceEventPage>("/suggestion-events", {
      params: { ...filters, limit, offset },
    })
    .then((response) => response.data);

export const getTraceEventsCsv = (filters: TraceEventFilters) =>
  api
    .get<Blob>("/suggestion-events/export.csv", {
      params: filters,
      responseType: "blob",
    })
    .then((response) => response.data);

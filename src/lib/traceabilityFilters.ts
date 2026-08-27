import type { TraceEventFilters } from "../api/traceability";

export interface TraceabilityFilterDraft {
  traceId: string;
  actor: string;
  eventType: string;
  status: string;
  siteId: number;
  dateFrom: string;
  dateTo: string;
}

export const EMPTY_TRACEABILITY_FILTER_DRAFT: TraceabilityFilterDraft = {
  traceId: "",
  actor: "",
  eventType: "",
  status: "",
  siteId: 0,
  dateFrom: "",
  dateTo: "",
};

const isoStart = (value: string) =>
  value ? new Date(`${value}T00:00:00`).toISOString() : undefined;

const isoEnd = (value: string) =>
  value ? new Date(`${value}T23:59:59.999`).toISOString() : undefined;

const isValidDateInput = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
};

const normalizeDateInput = (value: string) =>
  isValidDateInput(value) ? value : "";

export const normalizeTraceabilityDraft = (
  draft: TraceabilityFilterDraft,
): TraceabilityFilterDraft => ({
  traceId: draft.traceId.trim(),
  actor: draft.actor.trim(),
  eventType: draft.eventType,
  status: draft.status,
  siteId: draft.siteId,
  dateFrom: normalizeDateInput(draft.dateFrom),
  dateTo: normalizeDateInput(draft.dateTo),
});

export const traceabilityFiltersFromDraft = (
  draft: TraceabilityFilterDraft,
): TraceEventFilters => {
  const normalized = normalizeTraceabilityDraft(draft);
  return {
    ...(normalized.traceId ? { trace_id: normalized.traceId } : {}),
    ...(normalized.actor ? { actor: normalized.actor } : {}),
    ...(normalized.eventType ? { event_type: normalized.eventType } : {}),
    ...(normalized.status ? { status: normalized.status } : {}),
    ...(normalized.siteId ? { site_id: normalized.siteId } : {}),
    ...(normalized.dateFrom ? { date_from: isoStart(normalized.dateFrom) } : {}),
    ...(normalized.dateTo ? { date_to: isoEnd(normalized.dateTo) } : {}),
  };
};

const setIfPresent = (params: URLSearchParams, key: string, value: string | number) => {
  if (value) params.set(key, String(value));
};

export const traceabilitySearchParams = (
  draft: TraceabilityFilterDraft,
  offset = 0,
) => {
  const normalized = normalizeTraceabilityDraft(draft);
  const params = new URLSearchParams();
  setIfPresent(params, "trace_id", normalized.traceId);
  setIfPresent(params, "actor", normalized.actor);
  setIfPresent(params, "event_type", normalized.eventType);
  setIfPresent(params, "status", normalized.status);
  setIfPresent(params, "site_id", normalized.siteId);
  setIfPresent(params, "date_from", normalized.dateFrom);
  setIfPresent(params, "date_to", normalized.dateTo);
  if (offset > 0) params.set("offset", String(offset));
  return params;
};

const positiveInteger = (value: string | null) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
};

export const traceabilityStateFromSearchParams = (params: URLSearchParams) => {
  const draft = normalizeTraceabilityDraft({
    traceId: params.get("trace_id") ?? "",
    actor: params.get("actor") ?? "",
    eventType: params.get("event_type") ?? "",
    status: params.get("status") ?? "",
    siteId: positiveInteger(params.get("site_id")),
    dateFrom: params.get("date_from") ?? "",
    dateTo: params.get("date_to") ?? "",
  });
  return {
    draft,
    filters: traceabilityFiltersFromDraft(draft),
    offset: positiveInteger(params.get("offset")),
  };
};

export const sameTraceabilityDraft = (
  left: TraceabilityFilterDraft,
  right: TraceabilityFilterDraft,
) => {
  const a = normalizeTraceabilityDraft(left);
  const b = normalizeTraceabilityDraft(right);
  return (
    a.traceId === b.traceId &&
    a.actor === b.actor &&
    a.eventType === b.eventType &&
    a.status === b.status &&
    a.siteId === b.siteId &&
    a.dateFrom === b.dateFrom &&
    a.dateTo === b.dateTo
  );
};

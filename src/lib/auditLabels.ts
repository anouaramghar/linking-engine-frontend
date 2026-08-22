import type { SuggestionStatus } from "../types/suggestion";

import { METHOD_LABEL, STATUS_META } from "./utils";

export const TRACE_EVENT_TYPES = [
  "generated",
  "exposed",
  "external_discovered",
  "imported",
  "reviewed",
  "restored",
  "publishing",
  "publish_attempt_failed",
  "applied",
  "failed",
  "expired",
  "policy_expired",
] as const;

export const TRACE_EVENT_LABELS: Record<string, string> = {
  generated: "Generated",
  exposed: "Shown in review queue",
  external_discovered: "External suggestion found",
  imported: "Imported",
  reviewed: "Reviewed",
  restored: "Restored",
  publishing: "Publishing",
  publish_attempt_failed: "Publishing attempt failed",
  applied: "Published",
  failed: "Publishing failed",
  expired: "Expired",
  policy_expired: "Expired by policy",
  // Retained for readable rendering of historical rows; it is not emitted by
  // the current lifecycle contract and therefore is not a filter option.
  status_changed: "Status changed",
};

export const TRACE_STATUS_VALUES = [
  "pending",
  "approved",
  "rejected",
  "applying",
  "applied",
  "failed",
  "expired",
] as const satisfies readonly SuggestionStatus[];

const fallbackLabel = (value: string) =>
  value.replaceAll("_", " ").replace(/^[a-z]/, (character) => character.toUpperCase());

export const eventLabel = (eventType: string) =>
  TRACE_EVENT_LABELS[eventType] ?? fallbackLabel(eventType);

export const statusLabel = (status: string) =>
  STATUS_META[status as SuggestionStatus]?.label ?? fallbackLabel(status);

export const methodLabel = (method: string) => METHOD_LABEL[method] ?? fallbackLabel(method);

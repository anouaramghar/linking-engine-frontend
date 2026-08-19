import type { EvaluationFilters } from "../api/evaluation";

export type EvaluationRange = "7d" | "30d" | "90d" | "all";

export const EVALUATION_RANGE_OPTIONS: Array<{
  value: EvaluationRange;
  label: string;
  days?: number;
}> = [
  { value: "7d", label: "Last 7 days", days: 7 },
  { value: "30d", label: "Last 30 days", days: 30 },
  { value: "90d", label: "Last 90 days", days: 90 },
  { value: "all", label: "All time" },
];

export const evaluationFiltersFor = (
  range: EvaluationRange,
  siteId: number | undefined,
): EvaluationFilters => {
  const selected = EVALUATION_RANGE_OPTIONS.find((option) => option.value === range)!;
  if (!selected.days) return siteId ? { site_id: siteId } : {};
  const dateTo = new Date();
  const dateFrom = new Date(dateTo.getTime() - selected.days * 24 * 60 * 60 * 1000);
  return {
    ...(siteId ? { site_id: siteId } : {}),
    date_from: dateFrom.toISOString(),
    date_to: dateTo.toISOString(),
  };
};

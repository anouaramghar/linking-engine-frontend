import { api } from "./client";

export interface EvaluationFilters {
  site_id?: number;
  date_from?: string;
  date_to?: string;
}

export type EvaluationMetric =
  | "decided"
  | "accepted"
  | "rejected"
  | "pending"
  | "placement_success"
  | "published"
  | "publish_failed"
  | "orphan_helped";

export interface EditorialMetrics {
  suggestions_total: number;
  pending: number;
  accepted: number;
  rejected: number;
  decisions: number;
  acceptance_rate: number | null;
  rejection_rate: number | null;
  average_decision_hours: number | null;
  median_decision_hours: number | null;
  decision_time_sample: number;
}

export interface PlacementMetrics {
  generated: number;
  successful: number;
  success_rate: number | null;
}

export interface PublicationMetrics {
  completed: number;
  succeeded: number;
  failed: number;
  success_rate: number | null;
  failure_rate: number | null;
}

export interface OrphanMetrics {
  active_articles: number;
  remaining: number;
  reduced_by_linkmesh: number;
}

export interface MethodMetrics {
  method: string;
  suggestions: number;
  pending: number;
  accepted: number;
  rejected: number;
  applied: number;
  acceptance_rate: number | null;
  average_semantic_score: number | null;
}

export interface SiteEvaluationMetrics {
  site_id: number;
  site_name: string;
  suggestions: number;
  pending: number;
  accepted: number;
  rejected: number;
  applied: number;
  acceptance_rate: number | null;
}

export interface EvaluationTrendPoint {
  bucket_start: string;
  generated: number;
  accepted: number;
  rejected: number;
  applied: number;
  acceptance_rate: number | null;
}

export interface OrphanTrendPoint {
  snapshot_date: string;
  active_articles: number;
  remaining: number;
}

export interface EvaluationComparison {
  previous_from: string;
  previous_to: string;
  suggestions_change_rate: number | null;
  acceptance_rate_change: number | null;
  placement_success_rate_change: number | null;
  publication_success_rate_change: number | null;
}

export interface EvaluationMetrics {
  generated_at: string;
  site_id: number | null;
  date_from: string | null;
  date_to: string | null;
  cohort_definition: string;
  editorial: EditorialMetrics;
  placement: PlacementMetrics;
  publication: PublicationMetrics;
  orphans: OrphanMetrics;
  comparison: EvaluationComparison | null;
  trend: EvaluationTrendPoint[];
  orphan_trend: OrphanTrendPoint[];
  methods: MethodMetrics[];
  sites: SiteEvaluationMetrics[];
}

export interface EvaluationSuggestion {
  id: number;
  trace_id: string;
  site_id: number;
  site_name: string;
  source_title: string;
  target_title: string;
  method: string;
  score: number;
  status: string;
  occurred_at: string;
}

export interface EvaluationSuggestionPage {
  total: number;
  limit: number;
  offset: number;
  items: EvaluationSuggestion[];
}

export const getEvaluationMetrics = (filters: EvaluationFilters = {}) =>
  api
    .get<EvaluationMetrics>("/evaluation/metrics", { params: filters })
    .then((response) => response.data);

export const getEvaluationSuggestions = (
  metric: EvaluationMetric,
  filters: EvaluationFilters,
  limit = 50,
  offset = 0,
) =>
  api
    .get<EvaluationSuggestionPage>("/evaluation/suggestions", {
      params: { ...filters, metric, limit, offset },
    })
    .then((response) => response.data);

export const getEvaluationCsv = (filters: EvaluationFilters) =>
  api
    .get<Blob>("/evaluation/export.csv", { params: filters, responseType: "blob" })
    .then((response) => response.data);

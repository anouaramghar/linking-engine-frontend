import { useQuery } from "@tanstack/react-query";

import {
  getEvaluationMetrics,
  getEvaluationSuggestions,
  type EvaluationFilters,
  type EvaluationMetric,
} from "../api/evaluation";

export const useEvaluationMetrics = (filters: EvaluationFilters) =>
  useQuery({
    queryKey: ["evaluation-metrics", filters],
    queryFn: () => getEvaluationMetrics(filters),
    staleTime: 30_000,
  });

export const useEvaluationSuggestions = (
  metric: EvaluationMetric | null,
  filters: EvaluationFilters,
) =>
  useQuery({
    queryKey: ["evaluation-suggestions", metric, filters],
    queryFn: () => getEvaluationSuggestions(metric!, filters),
    enabled: metric !== null,
  });

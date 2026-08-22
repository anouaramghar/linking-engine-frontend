import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { getEvaluationCsv, type EvaluationMetric } from "../api/evaluation";
import EvaluationDashboard, { EvaluationMetricCard } from "../components/evaluation/EvaluationDashboard";
import EvaluationDrilldown from "../components/evaluation/EvaluationDrilldown";
import EvaluationFilterBar from "../components/evaluation/EvaluationFilterBar";
import PageHeader from "../components/PageHeader";
import { useCsvExport } from "../hooks/useCsvExport";
import { useEvaluationMetrics } from "../hooks/useEvaluation";
import { useSites } from "../hooks/useSites";
import {
  EVALUATION_RANGE_OPTIONS,
  evaluationFiltersFor,
  type EvaluationRange,
} from "../lib/evaluationFilters";
import {
  EVALUATION_KPI_LABELS,
  EVALUATION_KPI_ORBS,
} from "../lib/evaluationPresentation";

export default function EvaluationPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedRange = searchParams.get("range");
  const range: EvaluationRange = EVALUATION_RANGE_OPTIONS.some(
    (option) => option.value === requestedRange,
  )
    ? (requestedRange as EvaluationRange)
    : "30d";
  const rawSiteId = Number(searchParams.get("site"));
  const siteId = Number.isInteger(rawSiteId) && rawSiteId > 0 ? rawSiteId : undefined;
  const filters = useMemo(() => evaluationFiltersFor(range, siteId), [range, siteId]);
  const query = useEvaluationMetrics(filters);
  const sitesQuery = useSites();
  const ownedSites = sitesQuery.data?.filter((site) => site.platform !== "pool") ?? [];
  const [drilldown, setDrilldown] = useState<EvaluationMetric | null>(null);
  const exportRequest = useCallback(() => getEvaluationCsv(filters), [filters]);
  const { exportCsv, isExporting, status: exportStatus } = useCsvExport(
    exportRequest,
    `linkmesh-evaluation-${range}.csv`,
  );

  const updateFilter = (key: "range" | "site", value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next, { replace: true });
    setDrilldown(null);
  };

  return (
    <>
      <PageHeader
        title="Evaluation"
        sub="Live editorial, placement and publishing performance"
      />
      <div className="relative min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5 lg:px-8 lg:py-6">
        <EvaluationFilterBar
          range={range}
          siteId={siteId}
          ownedSites={ownedSites}
          isFetching={query.isFetching}
          isExporting={isExporting}
          exportStatus={exportStatus}
          onRangeChange={(value) => updateFilter("range", value)}
          onSiteChange={(value) => updateFilter("site", value)}
          onRefresh={() => void query.refetch()}
          onExport={() => void exportCsv()}
        />

        <div
          className="mb-3 flex flex-wrap items-center justify-between gap-2 text-caption text-muted"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <span>
            {query.data
              ? `Updated ${new Intl.DateTimeFormat(undefined, {
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(new Date(query.data.generated_at))}`
              : "Loading the latest evaluation data…"}
          </span>
        </div>

        {query.isPending && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {EVALUATION_KPI_ORBS.map((orb, index) => (
              <EvaluationMetricCard
                key={orb}
                label={EVALUATION_KPI_LABELS[index]}
                value="—"
                detail="Loading live metrics…"
                definition="Loading metric definition…"
                orb={orb}
                loading
              />
            ))}
          </div>
        )}

        {query.isError && !query.isPending && (
          <div role="alert">
            <div className="card px-5 py-8 text-center text-body-sm text-muted">
              <p>Evaluation metrics could not be loaded.</p>
              <button
                type="button"
                className="btn btn-outline btn-sm mt-3"
                onClick={() => void query.refetch()}
              >
                Try again
              </button>
            </div>
          </div>
        )}

        {query.data && <EvaluationDashboard metrics={query.data} onDrilldown={setDrilldown} />}
      </div>

      {drilldown && (
        <EvaluationDrilldown
          metric={drilldown}
          filters={filters}
          onClose={() => setDrilldown(null)}
        />
      )}
    </>
  );
}

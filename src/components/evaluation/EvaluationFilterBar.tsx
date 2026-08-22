import type { CsvExportStatus } from "../../hooks/useCsvExport";
import {
  EVALUATION_RANGE_OPTIONS,
  type EvaluationRange,
} from "../../lib/evaluationFilters";
import type { Site } from "../../types/site";

export default function EvaluationFilterBar({
  range,
  siteId,
  ownedSites,
  isFetching,
  isExporting,
  exportStatus,
  onRangeChange,
  onSiteChange,
  onRefresh,
  onExport,
}: {
  range: EvaluationRange;
  siteId: number | undefined;
  ownedSites: Site[];
  isFetching: boolean;
  isExporting: boolean;
  exportStatus: CsvExportStatus;
  onRangeChange: (value: string) => void;
  onSiteChange: (value: string) => void;
  onRefresh: () => void;
  onExport: () => void;
}) {
  return (
    <div className="card mb-4 flex flex-wrap items-end gap-3 px-4 py-4 sm:px-5">
      <label className="min-w-40 flex-1 text-caption font-medium text-body sm:flex-none">
        Date range
        <select
          aria-label="Date range"
          name="range"
          autoComplete="off"
          className="field mt-1 w-full min-w-40"
          value={range}
          onChange={(event) => onRangeChange(event.target.value)}
        >
          {EVALUATION_RANGE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className="min-w-48 flex-1 text-caption font-medium text-body">
        Site
        <select
          aria-label="Site"
          name="site_id"
          autoComplete="off"
          className="field mt-1 w-full min-w-48"
          value={siteId ?? ""}
          onChange={(event) => onSiteChange(event.target.value)}
        >
          <option value="">All managed sites</option>
          {ownedSites.map((site) => (
            <option key={site.id} value={site.id}>
              {site.name}
            </option>
          ))}
        </select>
      </label>
      <button type="button" className="btn btn-outline btn-sm" onClick={onRefresh} disabled={isFetching}>
        {isFetching ? "Refreshing…" : "Refresh"}
      </button>
      <button type="button" className="btn btn-primary btn-sm" onClick={onExport} disabled={isExporting}>
        {isExporting ? "Exporting…" : "Export CSV"}
      </button>
      <div className="w-full text-caption" aria-live="polite" aria-atomic="true">
        {exportStatus === "error" && (
          <p role="alert" className="text-error-ink">CSV export failed. Try again.</p>
        )}
        {exportStatus === "success" && <p className="text-body">CSV downloaded.</p>}
      </div>
    </div>
  );
}

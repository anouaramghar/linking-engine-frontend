import { useRef, type Dispatch, type SetStateAction } from "react";

import type { CsvExportStatus } from "../../hooks/useCsvExport";
import type { TraceabilityFilterDraft } from "../../lib/traceabilityFilters";
import { TRACE_EVENT_TYPES, TRACE_STATUS_VALUES, eventLabel, statusLabel } from "../../lib/auditLabels";
import type { Site } from "../../types/site";

export default function TraceabilityFilterForm({
  draft,
  setDraft,
  sites,
  filtersDirty,
  dateRangeError,
  hasAppliedFilters,
  exportStatus,
  exporting,
  onApply,
  onClear,
  onExport,
}: {
  draft: TraceabilityFilterDraft;
  setDraft: Dispatch<SetStateAction<TraceabilityFilterDraft>>;
  sites: Site[];
  filtersDirty: boolean;
  dateRangeError: boolean;
  hasAppliedFilters: boolean;
  exportStatus: CsvExportStatus;
  exporting: boolean;
  onApply: () => void;
  onClear: () => void;
  onExport: () => void;
}) {
  const fromDateRef = useRef<HTMLInputElement>(null);

  const update = <K extends keyof TraceabilityFilterDraft>(
    key: K,
    value: TraceabilityFilterDraft[K],
  ) => setDraft((current) => ({ ...current, [key]: value }));

  return (
    <form
      className="card p-4 sm:p-5"
      aria-label="Traceability filters"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (dateRangeError) fromDateRef.current?.focus();
        onApply();
      }}
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <label className="text-caption text-muted">
          Trace ID
          <input
            className="field mt-1"
            name="trace_id"
            value={draft.traceId}
            onChange={(event) => update("traceId", event.target.value)}
            placeholder="Paste a trace ID…"
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <label className="text-caption text-muted">
          Actor
          <input
            className="field mt-1"
            name="actor"
            value={draft.actor}
            onChange={(event) => update("actor", event.target.value)}
            placeholder="editor@example.com"
            autoComplete="off"
            spellCheck={false}
          />
        </label>
        <label className="text-caption text-muted">
          Event
          <select
            className="field mt-1"
            name="event_type"
            value={draft.eventType}
            onChange={(event) => update("eventType", event.target.value)}
          >
            <option value="">All events</option>
            {TRACE_EVENT_TYPES.map((value) => (
              <option key={value} value={value}>
                {eventLabel(value)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-caption text-muted">
          Current status
          <select
            className="field mt-1"
            name="status"
            value={draft.status}
            onChange={(event) => update("status", event.target.value)}
          >
            <option value="">All statuses</option>
            {TRACE_STATUS_VALUES.map((value) => (
              <option key={value} value={value}>
                {statusLabel(value)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-caption text-muted">
          Site
          <select
            className="field mt-1"
            name="site_id"
            value={draft.siteId}
            onChange={(event) => update("siteId", Number(event.target.value))}
          >
            <option value={0}>All sites</option>
            {sites
              .filter((site) => site.platform !== "pool")
              .map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name}
                </option>
              ))}
          </select>
        </label>
        <label className="text-caption text-muted">
          From
          <input
            ref={fromDateRef}
            className="field mt-1"
            name="date_from"
            type="date"
            value={draft.dateFrom}
            max={draft.dateTo || undefined}
            onChange={(event) => update("dateFrom", event.target.value)}
            aria-invalid={dateRangeError || undefined}
            aria-describedby={dateRangeError ? "traceability-date-error" : undefined}
          />
        </label>
        <label className="text-caption text-muted">
          To
          <input
            className="field mt-1"
            name="date_to"
            type="date"
            value={draft.dateTo}
            min={draft.dateFrom || undefined}
            onChange={(event) => update("dateTo", event.target.value)}
            aria-invalid={dateRangeError || undefined}
            aria-describedby={dateRangeError ? "traceability-date-error" : undefined}
          />
        </label>
      </div>

      {dateRangeError && (
        <p id="traceability-date-error" role="alert" className="mt-3 text-caption text-error-ink">
          From date must be on or before To date.
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="submit" className="btn btn-primary btn-sm">
          Apply filters
        </button>
        <button type="button" className="btn btn-outline btn-sm" onClick={onClear}>
          Clear
        </button>
        <button
          type="button"
          className="btn btn-outline btn-sm"
          disabled={exporting || filtersDirty}
          onClick={onExport}
          title={filtersDirty ? "Apply filters before exporting" : undefined}
        >
          {exporting
            ? "Exporting…"
            : filtersDirty
              ? "Apply filters to export"
              : hasAppliedFilters
                ? "Export filtered CSV"
                : "Export all events CSV"}
        </button>
      </div>

      <div className="mt-3 space-y-1 text-caption" aria-live="polite" aria-atomic="true">
        {filtersDirty && (
          <p id="traceability-filter-state" className="text-muted">
            Changes not applied. Apply filters to update results and exports.
          </p>
        )}
        {exportStatus === "error" && (
          <p role="alert" className="text-error-ink">
            CSV export failed. Try again.
          </p>
        )}
        {exportStatus === "success" && (
          <p className="text-body">CSV downloaded.</p>
        )}
      </div>
    </form>
  );
}

import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { getTraceEventsCsv } from "../api/traceability";
import PageHeader from "../components/PageHeader";
import { EmptyPanel, ErrorPanel, SkeletonRows } from "../components/QueryState";
import TraceabilityFilterForm from "../components/traceability/TraceabilityFilterForm";
import { useCsvExport } from "../hooks/useCsvExport";
import { usePageState } from "../hooks/usePageState";
import { useSites } from "../hooks/useSites";
import { useTraceEvents } from "../hooks/useTraceability";
import {
  EMPTY_TRACEABILITY_FILTER_DRAFT,
  normalizeTraceabilityDraft,
  sameTraceabilityDraft,
  traceabilitySearchParams,
  traceabilityStateFromSearchParams,
  type TraceabilityFilterDraft,
} from "../lib/traceabilityFilters";
import { eventLabel, statusLabel } from "../lib/auditLabels";
import { formatCount } from "../lib/utils";

const PAGE_SIZE = 50;

const eventDateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

function CopyIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CopiedIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m5 12 4 4L19 6" />
    </svg>
  );
}

export default function TraceabilityPage() {
  const sites = useSites().data ?? [];
  const [searchParams, setSearchParams] = useSearchParams();
  const searchKey = searchParams.toString();
  const appliedState = useMemo(
    () => traceabilityStateFromSearchParams(new URLSearchParams(searchKey)),
    [searchKey],
  );
  const { filters, draft: appliedDraft, offset } = appliedState;
  // Draft values survive a route change, while applied filters and pagination
  // live in the URL so a trace investigation can be refreshed or shared.
  const [draft, setDraft] = usePageState<TraceabilityFilterDraft>(
    "traceability.draft",
    appliedDraft,
  );
  const [copied, setCopied] = useState<string | null>(null);
  const [copyError, setCopyError] = useState(false);
  const filtersDirty = !sameTraceabilityDraft(draft, appliedDraft);
  const dateRangeError = Boolean(draft.dateFrom && draft.dateTo && draft.dateFrom > draft.dateTo);
  const exportRequest = useCallback(() => getTraceEventsCsv(filters), [filters]);
  const { exportCsv, isExporting, status: exportStatus } = useCsvExport(
    exportRequest,
    "linkmesh-traceability.csv",
  );
  const query = useTraceEvents(filters, PAGE_SIZE, offset);

  const pageEnd = useMemo(
    () => Math.min((query.data?.total ?? 0), offset + PAGE_SIZE),
    [offset, query.data?.total],
  );

  const applyFilters = () => {
    if (dateRangeError) return;
    const normalized = normalizeTraceabilityDraft(draft);
    setDraft(normalized);
    setSearchParams(traceabilitySearchParams(normalized), { replace: true });
  };

  const clearFilters = () => {
    setDraft(EMPTY_TRACEABILITY_FILTER_DRAFT);
    setSearchParams(new URLSearchParams(), { replace: true });
  };

  const updateOffset = (nextOffset: number) => {
    const next = new URLSearchParams(searchParams);
    if (nextOffset > 0) next.set("offset", String(nextOffset));
    else next.delete("offset");
    setSearchParams(next, { replace: true });
  };

  const copyTrace = async (traceId: string) => {
    setCopyError(false);
    try {
      await navigator.clipboard.writeText(traceId);
      setCopied(traceId);
      window.setTimeout(
        () => setCopied((current) => (current === traceId ? null : current)),
        2000,
      );
    } catch {
      setCopied(null);
      setCopyError(true);
    }
  };

  return (
    <>
      <PageHeader
        title="Suggestion traceability"
        sub="Search suggestion history from generation through publishing"
        badge="Audit"
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5 lg:px-8 lg:py-6">
        <TraceabilityFilterForm
          draft={draft}
          setDraft={setDraft}
          sites={sites}
          filtersDirty={filtersDirty}
          dateRangeError={dateRangeError}
          hasAppliedFilters={Object.keys(filters).length > 0}
          exportStatus={exportStatus}
          exporting={isExporting}
          onApply={applyFilters}
          onClear={clearFilters}
          onExport={() => void exportCsv()}
        />

        <div
          className="mt-4 flex items-center justify-between text-caption text-muted"
          role="status"
          aria-live="polite"
          aria-atomic="true"
        >
          <span>{formatCount(query.data?.total ?? 0)} events</span>
          {query.data && query.data.total > 0 && <span>{offset + 1}–{pageEnd}</span>}
        </div>
        {copyError && (
          <p role="alert" className="mt-2 text-caption text-error-ink">
            Trace ID could not be copied. Select it manually and try again.
          </p>
        )}

        {query.isPending && <div className="mt-3"><SkeletonRows count={6} label="Loading trace events" /></div>}
        {query.isError && <div className="mt-3"><ErrorPanel title="Trace events could not be loaded" description="The requested trace history could not be returned." onRetry={() => void query.refetch()} retrying={query.isFetching} /></div>}
        {!query.isPending && !query.isError && query.data?.items.length === 0 && (
          <div className="mt-3">
            <EmptyPanel>
              No trace events match these filters. Clear a filter or search for a different Trace ID.
            </EmptyPanel>
          </div>
        )}

        <ul className="mt-3 flex flex-col gap-3">
          {query.data?.items.map((event) => (
            <li key={event.id}>
              <article className="card p-4">
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="badge">{eventLabel(event.event_type)}</span>
                    <span className="break-words text-caption text-muted">{event.site_name}</span>
                    <time className="text-caption text-muted" dateTime={event.created_at}>
                      {eventDateFormatter.format(new Date(event.created_at))}
                    </time>
                  </div>
                  <h2 className="mt-2 break-words text-body-sm font-medium text-ink">
                    {event.source_title} <span aria-hidden="true">→</span> {event.target_title}
                  </h2>
                  <p className="mt-1 break-words text-caption text-muted">
                    Actor: <span className="text-body">{event.actor}</span> · Current status:{" "}
                    <span className="text-body">{statusLabel(event.suggestion_status)}</span>
                  </p>
                  {event.publish_error && (
                    <p className="mt-2 break-words rounded-lg bg-error/10 px-3 py-2 text-caption text-error-ink">
                      Publishing error: {event.publish_error}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  className={`btn btn-outline btn-sm ${
                    copied === event.trace_id ? "" : "h-11 w-11 p-0 sm:h-8 sm:w-8"
                  }`}
                  aria-label={copied === event.trace_id ? "Copied" : "Copy trace ID"}
                  title={copied === event.trace_id ? "Copied" : "Copy trace ID"}
                  onClick={() => void copyTrace(event.trace_id)}
                >
                  {copied === event.trace_id ? (
                    <>
                      <CopiedIcon />
                      <span>Copied</span>
                    </>
                  ) : (
                    <CopyIcon />
                  )}
                </button>
              </div>
              <p className="mt-2 break-all text-caption-sm text-muted" translate="no">
                Trace ID: {event.trace_id}
              </p>
              <details className="mt-3 rounded-lg bg-surface-strong px-3 py-2">
                <summary className="cursor-pointer text-caption font-medium text-ink">Full event details</summary>
                <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words text-caption-sm text-body" translate="no">
                  {JSON.stringify(event.details, null, 2)}
                </pre>
              </details>
              </article>
            </li>
          ))}
        </ul>

        {query.data && query.data.total > PAGE_SIZE && (
          <div className="mt-4 flex justify-end gap-2 pb-6">
            <button type="button" className="btn btn-outline btn-sm" disabled={offset === 0} onClick={() => updateOffset(Math.max(0, offset - PAGE_SIZE))}>Previous</button>
            <button type="button" className="btn btn-outline btn-sm" disabled={offset + PAGE_SIZE >= query.data.total} onClick={() => updateOffset(offset + PAGE_SIZE)}>Next</button>
          </div>
        )}
      </div>
    </>
  );
}

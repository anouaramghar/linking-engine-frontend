import { useMemo, useState } from "react";

import { getTraceEventsCsv, type TraceEventFilters } from "../api/traceability";
import PageHeader from "../components/PageHeader";
import { EmptyPanel, ErrorPanel, SkeletonRows } from "../components/QueryState";
import { usePageState } from "../hooks/usePageState";
import { useSites } from "../hooks/useSites";
import { useTraceEvents } from "../hooks/useTraceability";
import { downloadBlob, formatCount } from "../lib/utils";

const PAGE_SIZE = 50;

// The documented lifecycle set, in docs/design/suggestion-traceability.md order.
// `external_discovered` is the provenance event every accepted web-search
// candidate gets in addition to `generated`; leaving it out of this list made
// the one event that explains a paid external suggestion the only one an
// operator could not filter for.
const EVENT_TYPES = [
  "generated",
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
  "status_changed",
];

const STATUSES = ["pending", "approved", "rejected", "applying", "applied", "failed", "expired"];

const EVENT_LABELS: Record<string, string> = {
  generated: "Generated",
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
  status_changed: "Status changed",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending review",
  approved: "Selected for review",
  rejected: "Rejected",
  applying: "Publishing",
  applied: "Published",
  failed: "Publishing failed",
  expired: "Expired",
};

const displayLabel = (value: string, labels: Record<string, string>) =>
  labels[value] ?? value.replaceAll("_", " ").replace(/^[a-z]/, (character) => character.toUpperCase());

const isoStart = (value: string) => value ? new Date(`${value}T00:00:00`).toISOString() : undefined;
const isoEnd = (value: string) => value ? new Date(`${value}T23:59:59.999`).toISOString() : undefined;

export default function TraceabilityPage() {
  const sites = useSites().data ?? [];
  // The draft, what it was last applied as, and where in the results we had got
  // to are one position in an investigation. Following a trace ID onto another
  // page and coming back is part of that investigation, not the end of it.
  const [draft, setDraft] = usePageState("traceability.draft", {
    traceId: "",
    actor: "",
    eventType: "",
    status: "",
    siteId: 0,
    dateFrom: "",
    dateTo: "",
  });
  const [filters, setFilters] = usePageState<TraceEventFilters>("traceability.filters", {});
  const [offset, setOffset] = usePageState("traceability.offset", 0);
  const [exporting, setExporting] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const query = useTraceEvents(filters, PAGE_SIZE, offset);

  const pageEnd = useMemo(
    () => Math.min((query.data?.total ?? 0), offset + PAGE_SIZE),
    [offset, query.data?.total],
  );

  const applyFilters = () => {
    setFilters({
      ...(draft.traceId.trim() ? { trace_id: draft.traceId.trim() } : {}),
      ...(draft.actor.trim() ? { actor: draft.actor.trim() } : {}),
      ...(draft.eventType ? { event_type: draft.eventType } : {}),
      ...(draft.status ? { status: draft.status } : {}),
      ...(draft.siteId ? { site_id: draft.siteId } : {}),
      ...(draft.dateFrom ? { date_from: isoStart(draft.dateFrom) } : {}),
      ...(draft.dateTo ? { date_to: isoEnd(draft.dateTo) } : {}),
    });
    setOffset(0);
  };

  const clearFilters = () => {
    setDraft({ traceId: "", actor: "", eventType: "", status: "", siteId: 0, dateFrom: "", dateTo: "" });
    setFilters({});
    setOffset(0);
  };

  const exportCsv = async () => {
    setExporting(true);
    setActionError(null);
    try {
      const blob = await getTraceEventsCsv(filters);
      downloadBlob(blob, "linkmesh-traceability.csv");
    } catch {
      setActionError("The event CSV could not be exported. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  const copyTrace = async (traceId: string) => {
    setActionError(null);
    setCopied(null);
    try {
      if (!navigator.clipboard) throw new Error("Clipboard unavailable");
      await navigator.clipboard.writeText(traceId);
      setCopied(traceId);
      window.setTimeout(
        () => setCopied((current) => (current === traceId ? null : current)),
        2000,
      );
    } catch {
      setActionError("The trace ID could not be copied. Select it manually and try again.");
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
        <section className="card p-4 sm:p-5" aria-label="Traceability filters">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            <label className="text-caption text-muted">
              Trace ID
              <input className="field mt-1" value={draft.traceId} onChange={(event) => setDraft({ ...draft, traceId: event.target.value })} placeholder="Paste a trace ID…" />
            </label>
            <label className="text-caption text-muted">
              Actor
              <input className="field mt-1" value={draft.actor} onChange={(event) => setDraft({ ...draft, actor: event.target.value })} placeholder="editor@example.com" />
            </label>
            <label className="text-caption text-muted">
              Event
              <select className="field mt-1" value={draft.eventType} onChange={(event) => setDraft({ ...draft, eventType: event.target.value })}>
                <option value="">All events</option>
                {EVENT_TYPES.map((value) => <option key={value} value={value}>{displayLabel(value, EVENT_LABELS)}</option>)}
              </select>
            </label>
            <label className="text-caption text-muted">
              Current status
              <select className="field mt-1" value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })}>
                <option value="">All statuses</option>
                {STATUSES.map((value) => <option key={value} value={value}>{displayLabel(value, STATUS_LABELS)}</option>)}
              </select>
            </label>
            <label className="text-caption text-muted">
              Site
              <select className="field mt-1" value={draft.siteId} onChange={(event) => setDraft({ ...draft, siteId: Number(event.target.value) })}>
                <option value={0}>All sites</option>
                {sites.filter((site) => site.platform !== "pool").map((site) => <option key={site.id} value={site.id}>{site.name}</option>)}
              </select>
            </label>
            <label className="text-caption text-muted">
              From
              <input className="field mt-1" type="date" value={draft.dateFrom} onChange={(event) => setDraft({ ...draft, dateFrom: event.target.value })} />
            </label>
            <label className="text-caption text-muted">
              To
              <input className="field mt-1" type="date" value={draft.dateTo} onChange={(event) => setDraft({ ...draft, dateTo: event.target.value })} />
            </label>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="button" className="btn btn-primary btn-sm" onClick={applyFilters}>Apply filters</button>
            <button type="button" className="btn btn-outline btn-sm" onClick={clearFilters}>Clear</button>
            <button type="button" className="btn btn-outline btn-sm" disabled={exporting} onClick={() => void exportCsv()}>
              {exporting ? "Exporting…" : "Export full event CSV"}
            </button>
          </div>
          {actionError && (
            <p role="alert" className="mt-3 rounded-lg bg-error/10 px-3 py-2 text-caption text-error-ink">
              {actionError}
            </p>
          )}
        </section>

        <div className="mt-4 flex items-center justify-between text-caption text-muted">
          <span>{formatCount(query.data?.total ?? 0)} events</span>
          {query.data && query.data.total > 0 && <span>{offset + 1}–{pageEnd}</span>}
        </div>

        {query.isPending && <div className="mt-3"><SkeletonRows count={6} label="Loading trace events" /></div>}
        {query.isError && <div className="mt-3"><ErrorPanel title="Trace events could not be loaded" description="The requested trace history could not be returned." onRetry={() => void query.refetch()} retrying={query.isFetching} /></div>}
        {!query.isPending && !query.isError && query.data?.items.length === 0 && (
          <div className="mt-3">
            <EmptyPanel>
              No trace events match these filters. Clear a filter or search for a different Trace ID.
            </EmptyPanel>
          </div>
        )}

        <div className="mt-3 flex flex-col gap-3">
          {query.data?.items.map((event) => (
            <article key={event.id} className="card p-4">
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="badge">{displayLabel(event.event_type, EVENT_LABELS)}</span>
                    <span className="text-caption text-muted">{event.site_name}</span>
                    <time className="text-caption text-muted" dateTime={event.created_at}>{new Date(event.created_at).toLocaleString()}</time>
                  </div>
                  <h2 className="mt-2 text-body-sm font-medium text-ink">{event.source_title} → {event.target_title}</h2>
                  <p className="mt-1 text-caption text-muted">Actor: <span className="text-body">{event.actor}</span> · Current status: <span className="text-body">{displayLabel(event.suggestion_status, STATUS_LABELS)}</span></p>
                  {event.publish_error && <p className="mt-2 rounded-lg bg-error/10 px-3 py-2 text-caption text-error-ink">Publishing error: {event.publish_error}</p>}
                </div>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => void copyTrace(event.trace_id)}>
                  {copied === event.trace_id ? "Copied" : "Copy trace ID"}
                </button>
              </div>
              <p className="mt-2 break-all text-caption-sm text-muted">Trace ID: {event.trace_id}</p>
              <details className="mt-3 rounded-lg bg-surface-strong px-3 py-2">
                <summary className="cursor-pointer text-caption font-medium text-ink">Full event details</summary>
                <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words text-caption-sm text-body">{JSON.stringify(event.details, null, 2)}</pre>
              </details>
            </article>
          ))}
        </div>

        {query.data && query.data.total > PAGE_SIZE && (
          <div className="mt-4 flex justify-end gap-2 pb-6">
            <button type="button" className="btn btn-outline btn-sm" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>Previous</button>
            <button type="button" className="btn btn-outline btn-sm" disabled={offset + PAGE_SIZE >= query.data.total} onClick={() => setOffset(offset + PAGE_SIZE)}>Next</button>
          </div>
        )}
      </div>
    </>
  );
}

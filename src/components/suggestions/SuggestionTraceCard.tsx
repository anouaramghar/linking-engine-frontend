import { pct } from "../../lib/utils";
import type { Suggestion, SuggestionEvent } from "../../types/suggestion";

export interface SuggestionTraceState {
  data: SuggestionEvent[] | undefined;
  isLoading: boolean;
  error: unknown;
  onRetry: () => void;
}

interface Props {
  suggestion: Suggestion;
  trace: SuggestionTraceState;
}

const EVENT_LABEL: Record<string, string> = {
  generated: "Generated",
  imported: "Imported",
  reviewed: "Reviewed",
  restored: "Restored to pending",
  publishing: "Publishing started",
  applied: "Published",
  failed: "Publishing failed",
  expired: "Expired",
  status_changed: "Status changed",
};

const eventLabel = (event: SuggestionEvent) => {
  if (event.event_type === "reviewed") {
    if (event.details.to_status === "approved") return "Accepted";
    if (event.details.to_status === "rejected") return "Rejected";
  }
  return EVENT_LABEL[event.event_type] ?? event.event_type.replaceAll("_", " ");
};

const eventDetail = (event: SuggestionEvent) => {
  const outcome = event.details.publish_outcome;
  if (typeof outcome === "string") return `Outcome: ${outcome.replaceAll("_", " ")}`;
  const toStatus = event.details.to_status;
  if (typeof toStatus === "string" && event.event_type === "status_changed") {
    return `Status: ${toStatus.replaceAll("_", " ")}`;
  }
  return null;
};

const eventTime = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
};

const formatDuration = (from: string, to: string | number) => {
  const start = new Date(from).getTime();
  const end = typeof to === "number" ? to : new Date(to).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return "Unknown";

  const minutes = Math.max(0, Math.floor((end - start) / 60_000));
  if (minutes < 1) return "< 1 min";
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
};

const timingStat = (suggestion: Suggestion, events: SuggestionEvent[] | undefined) => {
  const decision = events?.find(
    (event) =>
      event.event_type === "reviewed" && event.details.to_status === suggestion.status,
  );
  if (decision) {
    return {
      label: "Decision time",
      value: formatDuration(suggestion.created_at, decision.created_at),
    };
  }

  const restored = events?.find((event) => event.event_type === "restored");
  return {
    label: "Queue age",
    value: formatDuration(restored?.created_at ?? suggestion.created_at, Date.now()),
  };
};

export default function SuggestionTraceCard({ suggestion, trace }: Props) {
  const bm25 = suggestion.score_components?.bm25_score;
  const timing = timingStat(suggestion, trace.data);

  return (
    <section aria-label="Suggestion traceability" className="card mb-5 mt-5 p-4">
      <div className="eyebrow">Why this suggestion</div>

      <dl
        aria-label="Suggestion statistics"
        role="group"
        className="mt-2 grid grid-cols-2 gap-2"
      >
        <div className="rounded-lg bg-surface-strong px-3 py-2">
          <dt className="text-caption-sm text-muted">Semantic match</dt>
          <dd className="mt-0.5 text-body-sm font-medium text-ink">
            {pct(suggestion.score)}
          </dd>
        </div>
        <div className="rounded-lg bg-surface-strong px-3 py-2">
          <dt className="text-caption-sm text-muted">
            {suggestion.method === "hybrid_bm25" && bm25 !== undefined
              ? "BM25 score"
              : "Ranking"}
          </dt>
          <dd className="mt-0.5 text-body-sm font-medium text-ink">
            {suggestion.method === "hybrid_bm25" && bm25 !== undefined
              ? bm25.toFixed(1)
              : suggestion.method === "baseline_cosine"
                ? "Cosine"
                : "Hybrid"}
          </dd>
        </div>
        <div className="rounded-lg bg-surface-strong px-3 py-2">
          <dt className="text-caption-sm text-muted">{timing.label}</dt>
          <dd className="mt-0.5 text-body-sm font-medium text-ink">{timing.value}</dd>
        </div>
        <div className="rounded-lg bg-surface-strong px-3 py-2">
          <dt className="text-caption-sm text-muted">Activity events</dt>
          <dd className="mt-0.5 text-body-sm font-medium text-ink">
            {trace.data ? trace.data.length : "\u2014"}
          </dd>
        </div>
      </dl>

      {suggestion.trace_id && (
        <p className="mt-2 break-all text-caption-sm text-muted">
          Trace ID: <span className="font-medium text-body">{suggestion.trace_id}</span>
        </p>
      )}

      <div className="mt-4 border-t border-hairline pt-4">
        <div className="eyebrow">Activity</div>
        {trace.isLoading && (
          <p className="mt-2 text-caption text-muted">Loading history...</p>
        )}
        {Boolean(trace.error) && !trace.isLoading && (
          <div className="mt-2 flex items-center justify-between gap-3">
            <p className="text-caption text-error-ink">History could not be loaded.</p>
            <button type="button" onClick={trace.onRetry} className="btn btn-outline btn-sm">
              Retry
            </button>
          </div>
        )}
        {!trace.isLoading && !trace.error && trace.data?.length === 0 && (
          <p className="mt-2 text-caption text-muted">No lifecycle events recorded yet.</p>
        )}
        {!trace.isLoading && !trace.error && trace.data && trace.data.length > 0 && (
          <ol className="mt-3 flex flex-col gap-3">
            {trace.data.map((event) => {
              const detail = eventDetail(event);
              return (
                <li key={event.id} className="flex gap-3 text-caption">
                  <span aria-hidden className="dot mt-2 bg-primary" />
                  <span className="min-w-0">
                    <span className="block font-medium text-ink">{eventLabel(event)}</span>
                    <span className="mt-0.5 block text-caption-sm text-muted">
                      {event.actor} &middot;{" "}
                      <time dateTime={event.created_at}>{eventTime(event.created_at)}</time>
                    </span>
                    {detail && (
                      <span className="mt-0.5 block text-caption-sm text-body">{detail}</span>
                    )}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
}

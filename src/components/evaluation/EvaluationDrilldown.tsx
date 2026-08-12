import { useRef } from "react";

import type { EvaluationFilters, EvaluationMetric } from "../../api/evaluation";
import { useEvaluationSuggestions } from "../../hooks/useEvaluation";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { formatCount, pct } from "../../lib/utils";
import { EmptyPanel, ErrorPanel, SkeletonRows } from "../QueryState";

const METRIC_LABEL: Record<EvaluationMetric, string> = {
  decided: "Reviewed suggestions",
  accepted: "Accepted suggestions",
  rejected: "Rejected suggestions",
  pending: "Pending suggestions",
  placement_success: "Successful placements",
  published: "Published suggestions",
  publish_failed: "Publishing failures",
  orphan_helped: "Orphans helped",
};

export default function EvaluationDrilldown({
  metric,
  filters,
  onClose,
}: {
  metric: EvaluationMetric;
  filters: EvaluationFilters;
  onClose: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const onKeyDown = useFocusTrap(panel, onClose);
  const query = useEvaluationSuggestions(metric, filters);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-canvas-deep/50 p-3 sm:p-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label={METRIC_LABEL[metric]}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className="card flex max-h-[85dvh] w-full max-w-3xl flex-col overflow-hidden bg-canvas-soft shadow-drawer focus:outline-none"
      >
        <div className="flex items-start justify-between gap-4 border-b border-hairline px-4 py-4 sm:px-6">
          <div>
            <h2 className="font-serif text-display-sm text-ink">{METRIC_LABEL[metric]}</h2>
            <p className="mt-1 text-caption text-muted">
              {query.data ? `${formatCount(query.data.total)} matching suggestions` : "Loading details"}
            </p>
          </div>
          <button
            type="button"
            data-modal-dismiss
            className="btn btn-outline btn-sm"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <div className="min-h-0 overflow-y-auto px-4 py-4 sm:px-6">
          {/* The same three panels the rest of the app uses for the same three
              states. This surface used to hand-roll all three, which is how a
              failure here ended up quieter than a failure anywhere else: it was
              reported in `text-muted`, with no `role="alert"` to announce it. */}
          {query.isPending && <SkeletonRows count={4} label="Loading suggestions" />}
          {query.isError && (
            <ErrorPanel
              title="Suggestion details could not be loaded"
              description="The evaluation API did not return the suggestions behind this metric."
              onRetry={() => void query.refetch()}
              retrying={query.isFetching}
            />
          )}
          {query.data?.items.length === 0 && (
            <EmptyPanel>No suggestion matches this metric and these filters.</EmptyPanel>
          )}
          {query.data && query.data.items.length > 0 && (
            <ul className="flex flex-col gap-2">
              {query.data.items.map((suggestion) => (
                <li key={suggestion.id} className="rounded-xl bg-surface-strong px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 text-body-sm text-body">
                      <span className="font-medium text-ink">{suggestion.source_title}</span>
                      <span aria-hidden className="mx-2 text-muted">→</span>
                      <span>{suggestion.target_title}</span>
                    </div>
                    <span className="badge flex-none">{pct(suggestion.score)}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-caption-sm text-muted">
                    <span>{suggestion.site_name}</span>
                    <span>{suggestion.method.replaceAll("_", " ")}</span>
                    <span>{suggestion.status}</span>
                    <time dateTime={suggestion.occurred_at}>
                      {new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(suggestion.occurred_at))}
                    </time>
                  </div>
                  <div className="mt-1 break-all text-caption-sm text-muted">
                    Trace ID: {suggestion.trace_id}
                  </div>
                </li>
              ))}
            </ul>
          )}
          {query.data && query.data.total > query.data.items.length && (
            <p className="mt-3 text-center text-caption-sm text-muted">
              Showing the first {formatCount(query.data.items.length)} results. Export CSV for the full cohort.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

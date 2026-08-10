import { Link } from "react-router-dom";

import type { PipelineBatch, PipelineSiteRun } from "../../types/pipeline";
import type { Site } from "../../types/site";

const STATUS_LABELS: Record<PipelineSiteRun["status"], string> = {
  queued: "Waiting",
  ingestion_running: "Crawling",
  analysis_queued: "Analysis queued",
  analysis_running: "Generating suggestions",
  succeeded: "Completed",
  failed: "Failed",
  cancelled: "Cancelled",
};

const batchLabel = (batch: PipelineBatch) => {
  if (batch.status === "partial_failed") return "Completed with failures";
  if (batch.status === "succeeded") return "Completed";
  if (batch.status === "failed") return "Failed";
  if (batch.status === "cancelled") return "Cancelled";
  return "Running";
};

const etaLabel = (batch: PipelineBatch) => {
  if (["succeeded", "failed", "partial_failed", "cancelled"].includes(batch.status)) {
    return null;
  }
  const completed = batch.succeeded + batch.failed + batch.cancelled;
  if (!batch.started_at || completed === 0) return "ETA calculating";
  const elapsed = Math.max(1, Date.now() - new Date(batch.started_at).getTime());
  const remainingMs = (elapsed / completed) * Math.max(0, batch.total - completed);
  const minutes = Math.max(1, Math.round(remainingMs / 60_000));
  return minutes < 60 ? `ETA ${minutes}m` : `ETA ${Math.floor(minutes / 60)}h ${minutes % 60}m`;
};

export default function BatchPipelinePanel({
  batch,
  sites,
  retryingSiteId,
  onRetry,
  cancelling,
  onCancel,
}: {
  batch: PipelineBatch;
  sites: Site[];
  retryingSiteId: number | null;
  onRetry: (siteId: number) => void;
  cancelling: boolean;
  onCancel: () => void;
}) {
  const names = new Map(sites.map((site) => [site.id, site.name]));
  const completed = batch.succeeded + batch.failed + batch.cancelled;
  const eta = etaLabel(batch);
  const active = !["succeeded", "failed", "partial_failed", "cancelled"].includes(batch.status);

  return (
    <section className="card mb-4 p-4 sm:p-5" aria-label={`Batch ${batch.id} progress`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="eyebrow">Batch pipeline #{batch.id}</div>
          <h2 className="mt-1 text-body-md font-medium text-ink">{batchLabel(batch)}</h2>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 text-caption text-muted" aria-live="polite">
          <span>{completed}/{batch.total} finished · {batch.succeeded} succeeded · {batch.failed} failed{batch.cancelled ? ` · ${batch.cancelled} cancelled` : ""}</span>
          {eta && <span className="badge">{eta}</span>}
          {active && (
            <button type="button" className="btn btn-outline btn-sm" disabled={cancelling} onClick={onCancel}>
              {cancelling ? "Cancelling…" : "Cancel batch"}
            </button>
          )}
        </div>
      </div>

      <div
        className="mt-3 h-2 overflow-hidden rounded-pill bg-hairline-soft"
        role="progressbar"
        aria-label="Batch completion"
        aria-valuemin={0}
        aria-valuemax={batch.total}
        aria-valuenow={completed}
      >
        <div
          className="h-full rounded-pill bg-primary transition-all"
          style={{ width: `${batch.total ? (completed / batch.total) * 100 : 0}%` }}
        />
      </div>

      <div className="mt-4 flex flex-col gap-2">
        {batch.sites.map((run) => (
          <div
            key={run.id}
            className="flex flex-wrap items-center gap-3 rounded-lg border border-hairline px-3 py-2.5"
          >
            <div className="min-w-40 flex-1">
              <div className="text-body-sm font-medium text-ink">
                {names.get(run.site_id) ?? `Site ${run.site_id}`}
              </div>
              <div className="text-caption text-muted">
                {STATUS_LABELS[run.status]}
                {run.retry_count > 0 ? ` · ${run.retry_count} retries` : ""}
              </div>
              {run.error && <div className="mt-1 text-caption text-error-ink">{run.error}</div>}
            </div>
            {run.status === "failed" && (
              <button
                type="button"
                className="btn btn-outline btn-sm"
                disabled={retryingSiteId === run.site_id}
                onClick={() => onRetry(run.site_id)}
              >
                {retryingSiteId === run.site_id ? "Retrying…" : "Retry"}
              </button>
            )}
            {run.status === "succeeded" && (
              <Link className="btn btn-outline btn-sm" to={`/queue?site=${run.site_id}`}>
                View suggestions
              </Link>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import ConfirmDialog from "../ConfirmDialog";
import LogoLoadingAnimation from "../LogoLoadingAnimation";
import { isActiveJobStatus, jobStatusGroup, jobStatusLabel } from "../../lib/jobStatus";
import { errorDetail } from "../../lib/errors";
import { timeAgo } from "../../lib/utils";
import { activityDestination, progressMetric, progressSummary } from "./activity";
import { CANCELLATION_COPY, JOB_KIND_LABELS } from "./jobCancellation";
import type { JobRun } from "../../types/job";
import type { Site } from "../../types/site";

function ActivityIcon() {
  return (
    <svg
      aria-hidden="true"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 12h4l2-6 4 12 2-6h6" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      aria-hidden="true"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
    >
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg
      aria-hidden="true"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="mt-1 flex-none text-muted-soft transition-transform duration-state ease-settle group-hover:translate-x-0.5 group-hover:text-ink"
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}

function PanelMessage({ title, detail }: { title: string; detail: string }) {
  return (
    <div role="status" aria-live="polite" className="flex flex-1 flex-col items-center justify-center px-6 py-12 text-center">
      <span className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-surface-strong text-muted">
        <ActivityIcon />
      </span>
      <p className="text-body-md font-medium text-ink">{title}</p>
      <p className="mt-1 max-w-[28ch] text-caption leading-relaxed text-muted">{detail}</p>
    </div>
  );
}

function ActivityJobRow({
  job,
  site,
  onOpen,
  onStop,
  stopping,
}: {
  job: JobRun;
  site?: Site;
  onOpen: (job: JobRun) => void;
  onStop: (job: JobRun) => void;
  stopping: boolean;
}) {
  const siteName = site?.name ?? `Site ${job.site_id}`;
  const kindLabel = JOB_KIND_LABELS[job.kind];
  const stageLabel = jobStatusLabel(job.kind, job.status, job.progress);
  const progress = progressSummary(job.progress);
  const metric = progressMetric(job.progress);
  const queued = jobStatusGroup(job.status) === "queued";
  const timing = queued
    ? `Queued ${timeAgo(job.enqueued_at)}`
    : `Started ${timeAgo(job.started_at ?? job.enqueued_at)}`;
  const stopPending = job.status === "cancel_requested" || stopping;

  return (
    <li className="animate-rowIn border-b border-hairline last:border-b-0">
      <div className="flex items-start gap-2 px-5 py-4 transition-colors duration-state ease-settle hover:bg-surface-strong">
        <button
          type="button"
          onClick={() => onOpen(job)}
          aria-label={`Open ${siteName} ${kindLabel.toLowerCase()} activity: ${stageLabel}${progress ? `, ${progress}` : ""}`}
          className="group flex min-w-0 flex-1 items-start gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <span className="mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-full bg-surface-strong text-primary">
            <LogoLoadingAnimation size="xs" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-start gap-2">
              <span className="min-w-0 flex-1 truncate text-caption font-medium text-ink">{siteName}</span>
              <span className="badge flex-none">{kindLabel}</span>
            </span>
            <span className="mt-2 flex items-center gap-2 text-caption font-medium text-ink">
              <span aria-hidden="true" className="dot bg-primary" />
              <span>{stageLabel}</span>
            </span>
            {metric ? (
              <span className="mt-2 flex items-center gap-2" role="group" aria-label={`${kindLabel} progress`}>
                <span
                  role="progressbar"
                  aria-label={`${kindLabel} progress`}
                  aria-valuemin={0}
                  aria-valuemax={metric.total}
                  aria-valuenow={metric.current}
                  className="h-meter min-w-0 flex-1 overflow-hidden rounded-pill bg-hairline-soft"
                >
                  <span
                    aria-hidden="true"
                    className="block h-full w-full origin-left rounded-pill bg-primary transition-transform duration-state ease-settle motion-reduce:transition-none"
                    style={{ transform: `scaleX(${metric.percent / 100})` }}
                  />
                </span>
                <span className="flex-none tabular-nums text-caption-sm text-muted">{progress}</span>
              </span>
            ) : (
              progress && <span className="mt-1 block text-caption-sm text-muted">{progress}</span>
            )}
            <span className="mt-1 block text-caption-sm text-muted-soft">{timing}</span>
          </span>
          <ChevronIcon />
        </button>
        {stopPending ? (
          <span
            role="status"
            aria-label={`${kindLabel} cancellation ${job.status === "cancel_requested" ? "requested" : "in progress"}`}
            className="mt-1 flex-none text-caption-sm font-medium text-muted"
          >
            Stopping…
          </span>
        ) : (
          <button
            type="button"
            onClick={() => onStop(job)}
            aria-label={`Stop ${siteName} ${kindLabel.toLowerCase()}`}
            className="touch-target mt-0.5 flex-none rounded-md border border-hairline-strong px-2 py-1 text-caption-sm font-medium text-muted transition-colors duration-state ease-settle hover:border-error/50 hover:bg-error/5 hover:text-error-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            Stop
          </button>
        )}
      </div>
    </li>
  );
}

export interface ActivityPanelProps {
  collapsed: boolean;
  jobs: JobRun[];
  sites: Site[];
  isPending: boolean;
  isError: boolean;
  onCancelJob?: (jobRunId: number) => Promise<unknown>;
}

export default function ActivityPanel({
  collapsed,
  jobs,
  sites,
  isPending,
  isError,
  onCancelJob,
}: ActivityPanelProps) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<JobRun | null>(null);
  const [cancelingJobId, setCancelingJobId] = useState<number | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const panelId = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const activeJobs = useMemo(() => jobs.filter((job) => isActiveJobStatus(job.status)), [jobs]);
  const sitesById = useMemo(() => new Map(sites.map((site) => [site.id, site])), [sites]);
  const activeCount = activeJobs.length;
  const countLabel = activeCount === 1 ? "1 active background task" : `${activeCount} active background tasks`;
  const badge = activeCount > 9 ? "9+" : String(activeCount);

  const close = useCallback((restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) trigger.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (event: PointerEvent) => {
      if (root.current && event.target instanceof Node && !root.current.contains(event.target)) {
        close();
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close(true);
    };

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [close, open]);

  useEffect(() => {
    if (open) closeButton.current?.focus();
  }, [open]);

  const openJob = (job: JobRun) => {
    navigate(activityDestination(job, sitesById.get(job.site_id)));
    close(true);
  };

  const askToCancel = (job: JobRun) => {
    setCancelError(null);
    setCancelTarget(job);
  };

  const confirmCancel = async () => {
    if (!cancelTarget) return;
    if (!onCancelJob) {
      setCancelTarget(null);
      return;
    }
    setCancelingJobId(cancelTarget.id);
    setCancelError(null);
    try {
      await onCancelJob(cancelTarget.id);
      setCancelTarget(null);
    } catch (error) {
      setCancelError(errorDetail(error, "Could not stop this task. It is still running."));
    } finally {
      setCancelingJobId(null);
    }
  };

  return (
    <div ref={root} className="relative z-40 flex-none">
      <button
        ref={trigger}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={activeCount ? `Activity, ${countLabel}` : "Activity"}
        onClick={() => setOpen((current) => !current)}
        className={`touch-target relative flex items-center justify-center rounded-pill text-body transition-colors duration-state ease-settle hover:bg-surface-strong hover:text-ink focus-visible:z-10 ${
          collapsed ? "h-7 w-7 min-h-7" : "h-8 w-8"
        }`}
      >
        <ActivityIcon />
        {activeCount > 0 && (
          <>
            {collapsed ? (
              <span aria-hidden="true" className="dot absolute right-0.5 top-0.5 bg-primary ring-2 ring-canvas-soft" />
            ) : (
              <span aria-hidden="true" className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-pill bg-primary px-1 text-caption-sm font-semibold leading-none text-on-primary">
                {badge}
              </span>
            )}
            <span className="sr-only">{countLabel}</span>
          </>
        )}
      </button>

      {open && (
        <aside
          id={panelId}
          aria-label="Running background tasks"
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget) && event.relatedTarget !== trigger.current) {
              close();
            }
          }}
          className="fixed inset-y-0 right-0 z-50 flex w-[min(24rem,calc(100vw-1rem))] flex-col border-l border-hairline-strong bg-surface-card shadow-drawer"
        >
          <div className="flex-none border-b border-hairline bg-surface-card px-5 py-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="eyebrow">Background work</div>
                <h2 className="mt-1 text-title-md text-ink">Activity</h2>
              </div>
              <button
                ref={closeButton}
                type="button"
                aria-label="Close activity panel"
                onClick={() => close(true)}
                className="touch-target -mr-1 -mt-1 flex h-9 w-9 flex-none items-center justify-center rounded-pill text-muted transition-colors duration-state ease-settle hover:bg-surface-strong hover:text-ink"
              >
                <CloseIcon />
              </button>
            </div>

            <div
              role="status"
              aria-live="polite"
              className={`mt-4 flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 ${
                isError ? "border-error/30 bg-error/5" : "border-hairline bg-surface-strong"
              }`}
            >
              <span className="flex min-w-0 items-center gap-2">
                <span
                  aria-hidden="true"
                  className={`dot ${isError ? "bg-error" : activeCount ? "bg-primary" : "bg-muted-soft"}`}
                />
                <span className={`truncate text-caption font-medium ${isError ? "text-error-ink" : "text-ink"}`}>
                  {isPending ? "Checking active work" : isError ? "Activity unavailable" : activeCount ? "Live monitoring" : "No active work"}
                </span>
              </span>
              <span className="badge flex-none">
                {isPending ? "Syncing" : isError ? "Retrying" : `${activeCount} running`}
              </span>
            </div>
            {cancelError && (
              <p role="alert" className="mt-3 rounded-lg border border-error/30 bg-error/5 px-3 py-2 text-caption text-error-ink">
                {cancelError}
              </p>
            )}
          </div>

          {isPending ? (
            <PanelMessage
              title="Checking active tasks"
              detail="The dashboard is looking for crawls, analyses, and publications in progress."
            />
          ) : isError ? (
            <PanelMessage
              title="Could not load activity"
              detail="The dashboard keeps trying; this list fills in as soon as the engine responds."
            />
          ) : activeJobs.length === 0 ? (
            <PanelMessage
              title="No active background tasks"
              detail="New crawls, analyses, and publications will appear here while they run."
            />
          ) : (
            <ul aria-label="Active background tasks" className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              {activeJobs.map((job) => (
                <ActivityJobRow
                  key={job.id}
                  job={job}
                  site={sitesById.get(job.site_id)}
                  onOpen={openJob}
                  onStop={askToCancel}
                  stopping={cancelingJobId === job.id}
                />
              ))}
            </ul>
          )}
        </aside>
      )}
      {cancelTarget && (
        <ConfirmDialog
          title={CANCELLATION_COPY[cancelTarget.kind].title}
          description={CANCELLATION_COPY[cancelTarget.kind].description}
          confirmLabel="Stop task"
          danger
          pending={cancelingJobId === cancelTarget.id}
          error={cancelError}
          onConfirm={() => void confirmCancel()}
          onCancel={() => {
            if (cancelingJobId === null) setCancelTarget(null);
          }}
        />
      )}
    </div>
  );
}

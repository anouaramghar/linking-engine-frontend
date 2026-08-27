import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { ingestSite, MAX_POOL_INGESTION_BATCH_SOURCES } from "../api/sites";
import ActionMenu from "../components/ActionMenu";
import BatchSelectionTray from "../components/BatchSelectionTray";
import ConfirmDialog from "../components/ConfirmDialog";
import JobStatusBadge from "../components/jobs/JobStatusBadge";
import LogoLoadingAnimation from "../components/LogoLoadingAnimation";
import Notice from "../components/Notice";
import type { NoticeState } from "../components/Notice";
import PageHeader from "../components/PageHeader";
import { EmptyPanel, ErrorPanel, SkeletonRows } from "../components/QueryState";
import SelectionControl from "../components/SelectionControl";
import {
  useApprovePoolSource,
  useDeleteSite,
  usePoolIngestionBatch,
  useReactivatePoolSource,
  useRevokePoolSource,
  useSites,
} from "../hooks/useSites";
import { useActiveJobs } from "../hooks/useJobs";
import { useIncrementalList } from "../hooks/useIncrementalList";
import { usePageState } from "../hooks/usePageState";
import { errorDetail } from "../lib/errors";
import { formatCount, initials, orbPlateClass, sitePlatformLabel, timeAgo } from "../lib/utils";
import type { JobRun } from "../types/job";
import type { Site } from "../types/site";

const AddSiteModal = lazy(() => import("../components/sites/AddSiteModal"));
const BulkImportModal = lazy(() => import("../components/sites/BulkImportModal"));
const PoolAuditModal = lazy(() => import("../components/sites/PoolAuditModal"));

type PoolFilter = "all" | "approved" | "not_approved" | "quarantined";

const status = (site: Site): Exclude<PoolFilter, "all"> =>
  site.pool_source_quarantined
    ? "quarantined"
    : site.pool_source_approved
      ? "approved"
      : "not_approved";

const statusLabel = (site: Site) => {
  if (site.pool_source_quarantined) return "Quarantined";
  return site.pool_source_approved ? "Approved" : "Not approved";
};

// Keep the pool fleet on the same geometry as the Sites page. The wide layout
// gives the action column a stable home, while the narrower version collapses
// the three measurements into one readable details column.
const GRID =
  "grid grid-cols-1 gap-3 lg:grid-cols-[1.6fr_1fr_1fr_1fr_1.8fr] lg:items-center" +
  " xl:grid-cols-[2fr_1.2fr_.65fr_.75fr_.8fr_1fr_1.4fr]";

function SourceDetail({
  label,
  value,
  title,
  dateTime,
}: {
  label?: string;
  value: string;
  title?: string;
  dateTime?: string | null;
}) {
  return (
    <span
      role={label ? "group" : undefined}
      className="text-caption text-muted"
      title={title}
      aria-label={label ? `${label}: ${value}` : undefined}
    >
      {label && <span className="xl:hidden">{label}: </span>}
      <span className="font-medium text-ink">
        {dateTime ? <time dateTime={dateTime}>{value}</time> : value}
      </span>
    </span>
  );
}

function SourceIdentity({ site }: { site: Site }) {
  return (
    <>
      <span
        className={`flex h-8 w-8 flex-none items-center justify-center rounded-full text-caption-upper text-ink ${orbPlateClass(site.id)}`}
      >
        {initials(site.name)}
      </span>
      <div className="min-w-0">
        <div className="truncate font-medium text-ink">{site.name}</div>
        <div className="truncate text-caption text-muted">
          {site.base_url.replace(/^https?:\/\//, "")}
        </div>
        {site.pool_source_quarantine_reason && (
          <div className="mt-1 break-words text-caption text-error-ink">
            {site.pool_source_quarantine_reason}
          </div>
        )}
      </div>
    </>
  );
}

function OpenSourceLink({ site }: { site: Site }) {
  return (
    <a
      href={site.base_url}
      target="_blank"
      rel="noreferrer"
      aria-label={`Open ${site.name} in a new tab`}
      title={`Open ${site.base_url} in a new tab`}
      className="touch-target inline-flex h-8 w-8 flex-none items-center justify-center rounded-pill text-muted transition-colors hover:bg-surface-strong hover:text-ink"
    >
      <svg
        aria-hidden="true"
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M15 3h6v6" />
        <path d="M10 14 21 3" />
        <path d="M20 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h5" />
      </svg>
    </a>
  );
}

function PoolSourceStatus({
  site,
  activeJob,
  trackedJobId,
}: {
  site: Site;
  activeJob?: JobRun;
  trackedJobId?: string;
}) {
  if (activeJob) {
    return (
      <JobStatusBadge
        jobId={activeJob.queue_job_id}
        kind="ingestion"
        snapshot={{
          status: activeJob.status,
          progress: activeJob.progress,
          error: activeJob.error,
        }}
      />
    );
  }

  if (trackedJobId) return <JobStatusBadge jobId={trackedJobId} kind="ingestion" />;

  const label = statusLabel(site);
  const dot = site.pool_source_quarantined
    ? "bg-error"
    : site.pool_source_approved
      ? "bg-success"
      : "bg-muted-soft";

  return (
    <span
      className="badge"
      title={site.pool_source_quarantine_reason ?? undefined}
      aria-label={
        site.pool_source_quarantine_reason
          ? `${label}. ${site.pool_source_quarantine_reason}`
          : label
      }
    >
      <span className={`dot ${dot}`} />
      {label}
    </span>
  );
}

export default function ContentPoolPage() {
  const sitesQuery = useSites();
  const poolSources = useMemo(
    () => (sitesQuery.data ?? []).filter((site) => site.platform === "pool"),
    [sitesQuery.data],
  );
  const approve = useApprovePoolSource();
  const revoke = useRevokePoolSource();
  const reactivate = useReactivatePoolSource();
  const remove = useDeleteSite();
  const poolBatch = usePoolIngestionBatch();
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [auditSite, setAuditSite] = useState<Site | null>(null);
  const [approvalSite, setApprovalSite] = useState<Site | null>(null);
  const [deleteSite, setDeleteSite] = useState<Site | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [filter, setFilter] = usePageState<PoolFilter>("contentPool.filter", "all");
  const search = searchParams.get("q") ?? "";
  const setSearch = (value: string) => {
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (value.trim() === "") next.delete("q");
        else next.set("q", value);
        return next;
      },
      { replace: true },
    );
  };
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedSourceIds, setSelectedSourceIds] = useState<Set<number>>(new Set());
  const selectVisibleRef = useRef<HTMLInputElement>(null);
  const [crawlingId, setCrawlingId] = useState<number | null>(null);
  // The job ids this visit started. They are how a crawl the operator kicked off
  // stays attributable to them after they leave the page and come back — the
  // active-jobs query knows a crawl is running, but not that it is theirs.
  const [crawlJobs, setCrawlJobs] = usePageState<Record<number, string>>(
    "contentPool.crawlJobs",
    {},
  );
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const activeJobsQuery = useActiveJobs();
  const activeJobs = activeJobsQuery.data ?? [];
  const jobStatusUnavailable = activeJobsQuery.isPending || activeJobsQuery.isError;
  const mutationPending =
    approve.isPending || revoke.isPending || reactivate.isPending || remove.isPending;

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return poolSources.filter(
      (site) =>
        (filter === "all" || status(site) === filter) &&
        (!query ||
          [site.name, site.base_url, "content pool"].some((value) =>
            value.toLowerCase().includes(query),
          )),
    );
  }, [filter, poolSources, search]);
  const { visible, hasMore, showMore } = useIncrementalList(
    filtered,
    JSON.stringify([filter, search]),
    50,
    250,
  );
  const visibleEligibleIds = useMemo(
    () =>
      visible
        .filter((site) => site.pool_source_approved && !site.pool_source_quarantined)
        .map((site) => site.id),
    [visible],
  );
  const selectedVisibleCount = visibleEligibleIds.filter((id) =>
    selectedSourceIds.has(id),
  ).length;
  const allVisibleSelected =
    visibleEligibleIds.length > 0 && selectedVisibleCount === visibleEligibleIds.length;
  const someVisibleSelected = selectedVisibleCount > 0 && !allVisibleSelected;
  const selectedOutsideFilterCount = selectedSourceIds.size - selectedVisibleCount;
  const batchLimitReached = selectedSourceIds.size >= MAX_POOL_INGESTION_BATCH_SOURCES;
  const selectedActiveCount = [...selectedSourceIds].filter((id) =>
    activeJobs.some((job) => job.site_id === id && job.kind === "ingestion"),
  ).length;
  const selectedIneligibleCount = [...selectedSourceIds].filter((id) => {
    const source = poolSources.find((site) => site.id === id);
    return !source?.pool_source_approved || source.pool_source_quarantined;
  }).length;
  const batchBlocked =
    jobStatusUnavailable ||
    selectedActiveCount > 0 ||
    selectedIneligibleCount > 0 ||
    selectedSourceIds.size > MAX_POOL_INGESTION_BATCH_SOURCES;

  useEffect(() => {
    if (selectVisibleRef.current) {
      selectVisibleRef.current.indeterminate = someVisibleSelected;
    }
  }, [someVisibleSelected]);

  const toggleSelectedSource = (site: Site) => {
    if (!site.pool_source_approved || site.pool_source_quarantined) return;
    setSelectedSourceIds((current) => {
      const next = new Set(current);
      if (next.has(site.id)) next.delete(site.id);
      else if (next.size < MAX_POOL_INGESTION_BATCH_SOURCES) next.add(site.id);
      return next;
    });
  };

  const toggleAllVisible = () => {
    setSelectedSourceIds((current) => {
      const next = new Set(current);
      if (allVisibleSelected || (batchLimitReached && someVisibleSelected)) {
        visibleEligibleIds.forEach((id) => next.delete(id));
      } else {
        let slots = MAX_POOL_INGESTION_BATCH_SOURCES - next.size;
        visibleEligibleIds.forEach((id) => {
          if (next.has(id) || slots <= 0) return;
          next.add(id);
          slots -= 1;
        });
      }
      return next;
    });
  };

  const cancelSelection = () => {
    setSelectionMode(false);
    setSelectedSourceIds(new Set());
  };

  const launchBatch = async () => {
    if (
      selectedSourceIds.size === 0 ||
      batchBlocked ||
      poolBatch.isPending
    ) {
      return;
    }
    const sourceIds = [...selectedSourceIds];
    setNotice(null);
    const result = await poolBatch.mutateAsync(sourceIds);
    setCrawlJobs((current) => {
      const next = { ...current };
      result.queued.forEach(({ siteId, job }) => {
        next[siteId] = job.job_id;
      });
      return next;
    });
    if (result.queued.length > 0) await activeJobsQuery.refetch();

    if (result.failed.length === 0) {
      setSelectionMode(false);
      setSelectedSourceIds(new Set());
      setNotice({
        message: `${result.queued.length} pool source${result.queued.length === 1 ? "" : "s"} queued for crawl.`,
        tone: "info",
      });
      return;
    }

    setSelectedSourceIds(new Set(result.failed.map(({ siteId }) => siteId)));
    const firstFailure = result.failed[0];
    setNotice({
      message: `${result.queued.length} queued; ${result.failed.length} failed. ${errorDetail(
        firstFailure.error,
        "The failed sources can be retried.",
      )}`,
      tone: "error",
    });
  };

  const runAction = async (label: string, action: () => Promise<unknown>) => {
    setNotice(null);
    try {
      await action();
      setNotice({ message: `${label} completed.`, tone: "info" });
    } catch (error) {
      setNotice({ message: errorDetail(error, `${label} failed. Please try again.`), tone: "error" });
    }
  };

  const crawl = async (site: Site) => {
    const activeJob = activeJobs.find(
      (job) => job.site_id === site.id && job.kind === "ingestion",
    );
    if (crawlingId !== null || activeJob || jobStatusUnavailable) return;
    setCrawlingId(site.id);
    setNotice(null);
    try {
      const job = await ingestSite(site.id);
      setCrawlJobs((current) => ({ ...current, [site.id]: job.job_id }));
      // Hold the pending state until the job list has caught up, so the button
      // is guarded by the running job itself rather than by a wall-clock timer.
      await activeJobsQuery.refetch();
      setNotice({ message: `${site.name} crawl queued.`, tone: "info" });
    } catch (error) {
      setNotice({
        message: errorDetail(error, `${site.name} crawl could not be queued.`),
        tone: "error",
      });
    }
    setCrawlingId(null);
  };

  const confirmDelete = () => {
    if (!deleteSite || remove.isPending) return;
    const target = deleteSite;
    setNotice(null);
    remove.mutate(
      { id: target.id, confirmName: target.name },
      {
        onSuccess: () => {
          setDeleteSite(null);
          setNotice({ message: `${target.name} deleted.`, tone: "info" });
        },
        onError: (error) =>
          setNotice({
            message: errorDetail(error, `${target.name} could not be deleted.`),
            tone: "error",
          }),
      },
    );
  };

  const confirmApproval = async () => {
    if (!approvalSite || approve.isPending) return;
    const target = approvalSite;
    setNotice(null);
    try {
      await approve.mutateAsync(target.id);
      setApprovalSite(null);
      setNotice({ message: `${target.name} approval completed.`, tone: "info" });
    } catch (error) {
      setNotice({
        message: errorDetail(error, `${target.name} approval failed. Please try again.`),
        tone: "error",
      });
    }
  };

  return (
    <>
      <PageHeader
        title="Content Pool"
        sub={`${poolSources.length} external ${poolSources.length === 1 ? "source" : "sources"} available as read-only suggestion targets`}
        actions={
          <>
            <button type="button" className="btn btn-primary" onClick={() => setShowImport(true)}>
              Import CSV
            </button>
            <button type="button" className="btn btn-outline" onClick={() => setShowAdd(true)}>
              Connect pool source
            </button>
            <button
              type="button"
              onClick={() => (selectionMode ? cancelSelection() : setSelectionMode(true))}
              aria-pressed={selectionMode}
              className="btn btn-outline"
            >
              {selectionMode ? "Cancel selection" : "Select sources"}
            </button>
          </>
        }
      />
      <div className="relative overflow-y-auto px-4 py-4 sm:px-6 sm:py-5 lg:px-8 lg:py-6">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <label className="min-w-48 flex-1 sm:max-w-sm">
            <span className="sr-only">Search pool sources</span>
            <input
              className="field"
              type="search"
              name="q"
              placeholder="Search name or URL…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <label className="w-full sm:w-auto">
            <span className="sr-only">Filter pool sources by status</span>
            <select
              className="field sm:min-w-40"
              value={filter}
              onChange={(event) => setFilter(event.target.value as PoolFilter)}
            >
              <option value="all">All statuses</option>
              <option value="approved">Approved</option>
              <option value="not_approved">Not approved</option>
              <option value="quarantined">Quarantined</option>
            </select>
          </label>
          {sitesQuery.dataUpdatedAt > 0 && (
            <span className="text-caption text-muted">
              Updated {timeAgo(new Date(sitesQuery.dataUpdatedAt).toISOString())}
            </span>
          )}
        </div>

        {selectionMode && (
          <div className="card mb-4 flex items-center justify-between gap-3 px-3 py-2.5">
            <label className="flex min-h-11 cursor-pointer items-center gap-3">
              <SelectionControl
                inputRef={selectVisibleRef}
                label="Select all eligible visible pool sources"
                checked={allVisibleSelected}
                indeterminate={someVisibleSelected}
                disabled={
                  visibleEligibleIds.length === 0 ||
                  (batchLimitReached && selectedVisibleCount === 0)
                }
                onChange={toggleAllVisible}
              />
              <span className="text-caption font-medium text-ink">
                Select eligible visible sources
              </span>
            </label>
            <span className="text-caption text-muted">
              {visibleEligibleIds.length} eligible
            </span>
          </div>
        )}

        {notice && <Notice notice={notice} onDismiss={() => setNotice(null)} />}
        {activeJobsQuery.isError && (
          <div
            role="alert"
            className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-error/30 bg-error/5 px-3 py-2 text-caption text-error-ink"
          >
            <span className="min-w-0 flex-1">
              Live job status is unavailable. Refresh it before starting another crawl.
            </span>
            <button
              type="button"
              onClick={() => void activeJobsQuery.refetch()}
              className="btn btn-outline btn-sm border-error/40 bg-surface-card text-error-ink hover:border-error"
            >
              Refresh job status
            </button>
          </div>
        )}
        <div className="mb-4 flex items-start gap-3 rounded-lg border border-hairline bg-canvas-soft px-4 py-3 text-caption leading-relaxed text-muted">
          <span className="dot mt-1.5 bg-muted-soft" aria-hidden="true" />
          <p>
            Pool sources are external, read-only references. Approve a trusted source before
            crawling it; repeated failures quarantine it automatically until an operator
            reactivates it.
          </p>
        </div>

        {sitesQuery.isPending && <SkeletonRows count={3} label="Loading content pool" />}
        {sitesQuery.isError && (
          <ErrorPanel
            title="Content pool could not be loaded"
            description="The engine could not return your external sources."
            onRetry={() => void sitesQuery.refetch()}
            retrying={sitesQuery.isFetching}
          />
        )}
        {!sitesQuery.isPending && !sitesQuery.isError && poolSources.length === 0 && (
          <EmptyPanel>Connect a trusted RSS, Atom, or Wikipedia source to get started.</EmptyPanel>
        )}
        {!sitesQuery.isPending && poolSources.length > 0 && filtered.length === 0 && (
          <EmptyPanel>No sources match these filters.</EmptyPanel>
        )}

        {visible.length > 0 && (
          <div className={`${GRID} eyebrow hidden px-5 pb-3 lg:grid`}>
            <div>Source</div>
            <div>Type</div>
            <div className="xl:hidden">Details</div>
            <div className="hidden xl:block">Articles</div>
            <div className="hidden xl:block">Failures</div>
            <div className="hidden xl:block">Last crawl</div>
            <div>Status</div>
            <div />
          </div>
        )}

        <div className="flex flex-col gap-2.5">
          {visible.map((site) => {
            const activeJob = activeJobs.find(
              (job) => job.site_id === site.id && job.kind === "ingestion",
            );
            const trackedJobId = crawlJobs[site.id];

            return (
              <article
                key={site.id}
                className={`${GRID} card px-4 py-4 text-body-sm transition-shadow hover:shadow-soft sm:px-5 ${
                  selectedSourceIds.has(site.id) ? "border-ink bg-surface-strong" : ""
                }`}
              >
                <div
                  role="group"
                  aria-label={`Pool source ${site.name}`}
                  className="flex min-w-0 items-center gap-3"
                >
                  {selectionMode ? (
                    <label
                      className="touch-target flex min-w-0 flex-1 cursor-pointer items-center gap-3"
                      title={
                        !site.pool_source_approved
                          ? "Approve this source before adding it to a crawl batch."
                          : site.pool_source_quarantined
                            ? "Reactivate this source before adding it to a crawl batch."
                            : undefined
                      }
                    >
                      <SelectionControl
                        label={`Select ${site.name} for batch`}
                        checked={selectedSourceIds.has(site.id)}
                        disabled={
                          !site.pool_source_approved ||
                          Boolean(site.pool_source_quarantined) ||
                          (!selectedSourceIds.has(site.id) && batchLimitReached)
                        }
                        onChange={() => toggleSelectedSource(site)}
                      />
                      <SourceIdentity site={site} />
                    </label>
                  ) : (
                    <SourceIdentity site={site} />
                  )}
                  <OpenSourceLink site={site} />
                </div>
                <div className="text-caption text-muted lg:text-body">
                  <span className="lg:hidden">Type: </span>
                  <span className="font-medium text-ink lg:font-normal lg:text-body">
                    {sitePlatformLabel(site.platform)}
                  </span>
                </div>
                <div className="flex flex-col gap-0.5 xl:hidden">
                  <SourceDetail
                    label="Articles"
                    value={
                      site.article_count === undefined
                        ? "Not available"
                        : formatCount(site.article_count)
                    }
                  />
                  <SourceDetail
                    label="Failures"
                    value={formatCount(site.pool_source_consecutive_failures ?? 0)}
                  />
                  <SourceDetail
                    label="Last crawl"
                    value={site.last_crawl_at ? timeAgo(site.last_crawl_at) : "Never"}
                    title={site.last_crawl_at ?? undefined}
                    dateTime={site.last_crawl_at}
                  />
                </div>
                <div className="hidden xl:block">
                  <SourceDetail
                    value={
                      site.article_count === undefined
                        ? "Not available"
                        : formatCount(site.article_count)
                    }
                  />
                </div>
                <div className="hidden xl:block">
                  <SourceDetail value={formatCount(site.pool_source_consecutive_failures ?? 0)} />
                </div>
                <div className="hidden xl:block">
                  <SourceDetail
                    value={site.last_crawl_at ? timeAgo(site.last_crawl_at) : "Never"}
                    title={site.last_crawl_at ?? undefined}
                    dateTime={site.last_crawl_at}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <PoolSourceStatus
                    site={site}
                    activeJob={activeJob}
                    trackedJobId={trackedJobId}
                  />
                </div>
                <div className="flex flex-wrap items-center justify-start gap-2 lg:justify-end">
                  {!site.pool_source_approved && (
                    <button
                      type="button"
                      aria-label={`Approve ${site.name}`}
                      className="btn btn-primary btn-sm"
                      disabled={mutationPending}
                      onClick={() => setApprovalSite(site)}
                    >
                      Approve
                    </button>
                  )}
                  {site.pool_source_approved && !site.pool_source_quarantined && (
                    <button
                      type="button"
                      aria-label={`Crawl ${site.name}`}
                      className="btn btn-outline btn-sm"
                      disabled={
                        crawlingId === site.id || Boolean(activeJob) || jobStatusUnavailable
                      }
                      onClick={() => void crawl(site)}
                    >
                      {crawlingId === site.id && (
                        <LogoLoadingAnimation size="xs" className="text-primary flex-none" />
                      )}
                      {crawlingId === site.id
                        ? "Queueing…"
                        : activeJob
                          ? "Crawl active"
                          : "Crawl"}
                    </button>
                  )}
                  <ActionMenu
                    label="Actions"
                    ariaLabel={`Actions for ${site.name}`}
                    items={[
                      ...(site.pool_source_quarantined
                        ? [
                            {
                              label: "Reactivate",
                              disabled: mutationPending,
                              onSelect: () =>
                                void runAction(`${site.name} reactivation`, () =>
                                  reactivate.mutateAsync(site.id),
                                ),
                            },
                          ]
                        : []),
                      ...(site.pool_source_approved
                        ? [
                            {
                              label: "Revoke approval",
                              disabled: mutationPending,
                              onSelect: () =>
                                void runAction(`${site.name} approval revocation`, () =>
                                  revoke.mutateAsync(site.id),
                                ),
                            },
                          ]
                        : []),
                      { label: "View history", onSelect: () => setAuditSite(site) },
                      {
                        label: "Delete source",
                        danger: true,
                        disabled: mutationPending,
                        onSelect: () => setDeleteSite(site),
                      },
                    ]}
                  />
                </div>
              </article>
            );
          })}
        </div>
        {hasMore && (
          <div className="flex flex-col items-center gap-2 py-4">
            <button type="button" onClick={showMore} className="btn btn-outline">
              Show more sources
            </button>
            <span className="text-caption text-muted" aria-live="polite">
              Showing {visible.length} of {filtered.length}
            </span>
          </div>
        )}

        {selectionMode && selectedSourceIds.size > 0 && (
          <BatchSelectionTray
            regionLabel="Pool batch selection"
            itemLabel="source"
            itemLabelPlural="sources"
            selectedCount={selectedSourceIds.size}
            status={
              activeJobsQuery.isError
                ? "Live job status is unavailable. Refresh before starting a batch."
                : selectedIneligibleCount > 0
                  ? `${selectedIneligibleCount} selected source${selectedIneligibleCount === 1 ? " is" : "s are"} no longer eligible.`
                  : selectedActiveCount > 0
                    ? `${selectedActiveCount} selected source${selectedActiveCount === 1 ? " is" : "s are"} already crawling.`
                    : batchLimitReached
                      ? `Batch limit reached: ${MAX_POOL_INGESTION_BATCH_SOURCES} sources maximum.`
                      : selectedOutsideFilterCount > 0
                        ? `${selectedOutsideFilterCount} selected outside these filters.`
                        : "Ready to crawl together."
            }
            actionLabel={`Run batch (${selectedSourceIds.size})`}
            pendingActionLabel="Starting batch…"
            actionPending={poolBatch.isPending}
            actionDisabled={batchBlocked}
            onClear={() => setSelectedSourceIds(new Set())}
            onAction={() => void launchBatch()}
          />
        )}
      </div>

      <Suspense fallback={null}>
        {showAdd && (
          <AddSiteModal
            title="Connect a pool source"
            initialPlatform="pool"
            lockPlatform
            onClose={() => setShowAdd(false)}
          />
        )}
        {showImport && <BulkImportModal mode="pool" onClose={() => setShowImport(false)} />}
        {auditSite && <PoolAuditModal site={auditSite} onClose={() => setAuditSite(null)} />}
      </Suspense>
      {approvalSite && (
        <ConfirmDialog
          title={`Approve ${approvalSite.name}?`}
          description={`Trust ${approvalSite.base_url} as a read-only content-pool source. After approval, it can be crawled and its articles can become external-link targets.`}
          confirmLabel="Approve source"
          pending={approve.isPending}
          onConfirm={() => void confirmApproval()}
          onCancel={() => setApprovalSite(null)}
        />
      )}
      {deleteSite && (
        <ConfirmDialog
          title={`Delete ${deleteSite.name}?`}
          description="This removes the source and its imported articles. Its immutable audit history is retained."
          confirmLabel="Delete source"
          confirmPhrase={deleteSite.name}
          confirmPhraseLabel="Type the source name to confirm:"
          danger
          pending={remove.isPending}
          onConfirm={confirmDelete}
          onCancel={() => setDeleteSite(null)}
        />
      )}
    </>
  );
}

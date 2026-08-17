import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { MAX_PIPELINE_BATCH_SITES } from "../api/pipelines";
import { ingestSite } from "../api/sites";
import { triggerAnalysis } from "../api/suggestions";
import ActionMenu from "../components/ActionMenu";
import ConfirmDialog from "../components/ConfirmDialog";
import JobStatusBadge from "../components/jobs/JobStatusBadge";
import LogoLoadingAnimation from "../components/LogoLoadingAnimation";
import Notice from "../components/Notice";
import type { NoticeState } from "../components/Notice";
import PageHeader from "../components/PageHeader";
import { EmptyPanel, ErrorPanel, SkeletonRows } from "../components/QueryState";
import SelectionControl from "../components/SelectionControl";
import SiteStatusBadge from "../components/sites/SiteStatusBadge";
import { useActiveJobs } from "../hooks/useJobs";
import { useIncrementalList } from "../hooks/useIncrementalList";
import { usePageState } from "../hooks/usePageState";
import {
  useCancelPipelineBatch,
  useCreatePipelineBatch,
  usePipelineBatch,
  useRetryPipelineSite,
} from "../hooks/usePipeline";
import { useDeleteSite, useSites } from "../hooks/useSites";

import { errorDetail } from "../lib/errors";
import {
  formatCount,
  initials,
  orbPlateClass,
  sitePlatformLabel,
  timeAgo,
} from "../lib/utils";
import type { JobKind, JobRun } from "../types/job";
import type { Site } from "../types/site";

// Shared by the header and the rows so they cannot drift apart. The narrow
// template buys the action column back from the three text columns: at 1024px
// the wide one leaves it about 142px, and "Queueing…" beside the Actions menu
// needs more than that. Name and URL already truncate, so they give it up best.
const GRID =
  "grid grid-cols-1 gap-3 lg:grid-cols-[1.6fr_1fr_1fr_1fr_1.8fr] lg:items-center" +
  " xl:grid-cols-[2fr_1.2fr_.65fr_.75fr_.8fr_1fr_1.4fr]";

const batchIdFromParams = (params: URLSearchParams) => {
  const value = Number(params.get("batch"));
  return Number.isInteger(value) && value > 0 ? value : null;
};

function SiteDetail({
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

interface TrackedJob {
  siteId: number;
  label: string;
  kind: JobKind;
  jobId: string;
}

const AddSiteModal = lazy(() => import("../components/sites/AddSiteModal"));
const ArticleImportModal = lazy(() => import("../components/sites/ArticleImportModal"));
const BulkImportModal = lazy(() => import("../components/sites/BulkImportModal"));
const BatchPipelinePanel = lazy(() => import("../components/sites/BatchPipelinePanel"));
const EditorialRankingPolicyModal = lazy(
  () => import("../components/sites/EditorialRankingPolicyModal"),
);
const ExternalLinkPolicyModal = lazy(
  () => import("../components/sites/ExternalLinkPolicyModal"),
);
const SiteCredentialsModal = lazy(() => import("../components/sites/SiteCredentialsModal"));

const activeJobKey = (siteId: number, kind: JobKind) => `${siteId}:${kind}`;

function CurrentSiteStatus({
  site,
  activeJobsBySite,
  trackedJobsBySite,
}: {
  site: Site;
  activeJobsBySite: Map<number, JobRun>;
  trackedJobsBySite: Map<number, TrackedJob>;
}) {
  const siteId = site.id;
  const active = activeJobsBySite.get(siteId);
  if (active) {
    return (
      <JobStatusBadge
        jobId={active.queue_job_id}
        kind={active.kind}
        snapshot={{
          status: active.status,
          progress: active.progress,
          error: active.error,
        }}
      />
    );
  }

  const tracked = trackedJobsBySite.get(siteId);
  if (tracked) {
    return <JobStatusBadge jobId={tracked.jobId} kind={tracked.kind} />;
  }

  return (
    <SiteStatusBadge
      status={site.last_ingestion_status}
      lastCrawlAt={site.last_crawl_at}
      ingestionError={site.last_ingestion_error}
      analysisStatus={site.last_analysis_status}
      lastAnalysisAt={site.last_analysis_at}
      analysisError={site.last_analysis_error}
    />
  );
}

/**
 * Hybrid is the managed standard for every non-pool source, so this states the
 * site's configuration rather than reading any one row. The title says so out
 * loud: a queue card reports how that particular suggestion was produced, which
 * for an older row can still be the cosine baseline, and the two are not in
 * disagreement when it happens.
 */
function SuggestionMethodBadge() {
  return (
    <span
      className="badge"
      title="Combines semantic and keyword matching for new suggestions"
    >
      <span className="dot bg-primary" />
      Hybrid
    </span>
  );
}

/**
 * Open the live site in a new tab.
 *
 * Sits outside the selection label on purpose: inside it, every click meant to
 * open the site would tick the batch checkbox instead. `noreferrer` because a
 * customer's site has no business learning where the operator came from.
 */
function OpenSiteLink({ site }: { site: Site }) {
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

function SiteIdentity({ site }: { site: Site }) {
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
      </div>
    </>
  );
}

export default function SitesPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
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
  const sitesQuery = useSites(search);
  const sites = useMemo(
    () => sitesQuery.data?.filter((site) => site.platform !== "pool"),
    [sitesQuery.data],
  );
  const totalArticles =
    sites?.every((site) => site.article_count !== undefined)
      ? sites.reduce((total, site) => total + (site.article_count ?? 0), 0)
      : null;
  const activeJobsQuery = useActiveJobs();
  const activeJobs = useMemo(() => activeJobsQuery.data ?? [], [activeJobsQuery.data]);
  const jobStatusUnavailable = activeJobsQuery.isPending || activeJobsQuery.isError;
  const activeJobsBySite = useMemo(() => {
    const index = new Map<number, JobRun>();
    for (const job of activeJobs) {
      if (!index.has(job.site_id)) index.set(job.site_id, job);
    }
    return index;
  }, [activeJobs]);
  const activeJobsBySiteKind = useMemo(() => {
    const index = new Map<string, JobRun>();
    for (const job of activeJobs) {
      const key = activeJobKey(job.site_id, job.kind);
      if (!index.has(key)) index.set(key, job);
    }
    return index;
  }, [activeJobs]);
  const hasActiveJob = (siteId: number, kind: JobKind) =>
    activeJobsBySiteKind.has(activeJobKey(siteId, kind));
  const deleteSite = useDeleteSite();
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [articleImportFor, setArticleImportFor] = useState<Site | null>(null);
  // Crawls and pipeline runs outlive the visit that started them, so the list of
  // the ones this operator started has to as well. Dropped on navigation, a job
  // someone kicked off two minutes ago becomes indistinguishable from one a
  // colleague started, and the only way back to its progress was to start
  // another.
  const [jobs, setJobs] = usePageState<TrackedJob[]>("sites.jobs", []);
  const trackedJobsBySite = useMemo(() => {
    const index = new Map<number, TrackedJob>();
    // Assignment order preserves the previous reverse().find behavior: the
    // newest tracked entry for a site wins.
    for (const job of jobs) index.set(job.siteId, job);
    return index;
  }, [jobs]);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ id: number; name: string } | null>(null);
  const [credentialsFor, setCredentialsFor] = useState<Site | null>(null);
  const [policySite, setPolicySite] = useState<Site | null>(null);
  const [rankingPolicySite, setRankingPolicySite] = useState<Site | null>(null);
  // A batch is assembled by hand across a long list. Leaving to check one site's
  // credentials before running the rest is part of assembling it, and used to
  // throw the whole selection away.
  const [selectionMode, setSelectionMode] = usePageState("sites.selectionMode", false);
  const [selectedSiteIds, setSelectedSiteIds] = usePageState<Set<number>>(
    "sites.selectedIds",
    () => new Set(),
  );
  const selectVisibleRef = useRef<HTMLInputElement>(null);
  const selectVisibleMobileRef = useRef<HTMLInputElement>(null);
  const batchId = batchIdFromParams(searchParams);
  const [confirmCancelBatch, setConfirmCancelBatch] = useState(false);
  const createBatch = useCreatePipelineBatch();
  const batchQuery = usePipelineBatch(batchId);
  const retryPipelineSite = useRetryPipelineSite();
  const cancelBatch = useCancelPipelineBatch();

  const filteredSites = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return sites;
    return sites?.filter((site) =>
      [site.name, site.base_url, site.platform, sitePlatformLabel(site.platform)].some((value) =>
        value.toLowerCase().includes(query),
      ),
    );
  }, [search, sites]);
  const {
    visible: visibleSites,
    hasMore: hasMoreLoadedSites,
    showMore: showMoreLoadedSites,
  } = useIncrementalList(filteredSites ?? [], search, 50, 250);
  const hasMoreSites = hasMoreLoadedSites || Boolean(sitesQuery.hasNextPage);
  const showMoreSites = () => {
    if (hasMoreLoadedSites) showMoreLoadedSites();
    else void sitesQuery.fetchNextPage();
  };

  const busyKey = (siteId: number, label: string) => `${siteId}:${label}`;
  const visibleSiteIds = useMemo(() => visibleSites?.map((site) => site.id) ?? [], [visibleSites]);
  const selectedVisibleCount = visibleSiteIds.filter((id) => selectedSiteIds.has(id)).length;
  const allVisibleSelected =
    visibleSiteIds.length > 0 && selectedVisibleCount === visibleSiteIds.length;
  const someVisibleSelected = selectedVisibleCount > 0 && !allVisibleSelected;
  const selectedOutsideSearchCount = selectedSiteIds.size - selectedVisibleCount;
  const batchLimitReached = selectedSiteIds.size >= MAX_PIPELINE_BATCH_SITES;
  const selectedActiveCount = [...selectedSiteIds].filter((id) =>
    hasActiveJob(id, "ingestion") ||
    hasActiveJob(id, "analysis") ||
    busy[busyKey(id, "Crawl")] ||
    busy[busyKey(id, "Generate suggestions")],
  ).length;
  const batchBlocked =
    jobStatusUnavailable || selectedActiveCount > 0 || selectedSiteIds.size > MAX_PIPELINE_BATCH_SITES;

  useEffect(() => {
    if (selectVisibleRef.current) selectVisibleRef.current.indeterminate = someVisibleSelected;
    if (selectVisibleMobileRef.current) {
      selectVisibleMobileRef.current.indeterminate = someVisibleSelected;
    }
  }, [someVisibleSelected]);

  const toggleSelectedSite = (siteId: number) => {
    setSelectedSiteIds((current) => {
      const next = new Set(current);
      if (next.has(siteId)) next.delete(siteId);
      else next.add(siteId);
      return next;
    });
  };

  const toggleAllVisible = () => {
    setSelectedSiteIds((current) => {
      const next = new Set(current);
      if (allVisibleSelected || (batchLimitReached && someVisibleSelected)) {
        visibleSiteIds.forEach((id) => next.delete(id));
      }
      else {
        let slots = MAX_PIPELINE_BATCH_SITES - next.size;
        visibleSiteIds.forEach((id) => {
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
    setSelectedSiteIds(new Set());
  };

  const showBatch = (nextBatchId: number) => {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set("batch", String(nextBatchId));
      return next;
    });
  };

  const launchBatch = async () => {
    if (
      selectedSiteIds.size === 0 ||
      selectedSiteIds.size > MAX_PIPELINE_BATCH_SITES ||
      jobStatusUnavailable ||
      selectedActiveCount > 0 ||
      createBatch.isPending
    ) {
      return;
    }
    const batchSiteIds = [...selectedSiteIds];
    setNotice(null);
    try {
      const batch = await createBatch.mutateAsync(batchSiteIds);
      showBatch(batch.id);
      setSelectionMode(false);
      setSelectedSiteIds(new Set());
      setNotice({ message: `Batch #${batch.id} started for ${batch.total} sites.`, tone: "info" });
    } catch (error) {
      setNotice({
        message: errorDetail(error, "The batch pipeline could not be started. Please try again."),
        tone: "error",
      });
    }
  };

  const retryBatchSite = async (siteId: number) => {
    if (batchId === null || retryPipelineSite.isPending) return;
    setNotice(null);
    try {
      await retryPipelineSite.mutateAsync({ batchId, siteId });
      setNotice({ message: "The failed stage was queued again.", tone: "info" });
    } catch (error) {
      setNotice({
        message: errorDetail(error, "The failed stage could not be retried."),
        tone: "error",
      });
    }
  };

  const run = async (
    siteId: number,
    label: string,
    kind: JobKind,
    action: (id: number) => Promise<{ job_id: string }>,
    queuedMessage?: string,
  ) => {
    const key = busyKey(siteId, label);
    if (busy[key] || jobStatusUnavailable || hasActiveJob(siteId, kind)) return;
    setBusy((current) => ({ ...current, [key]: true }));
    setNotice(null);
    try {
      const { job_id } = await action(siteId);
      // Keyed by site and action so a crawl badge survives a later publish.
      setJobs((current) => [
        ...current.filter((job) => !(job.siteId === siteId && job.label === label)),
        { siteId, label, kind, jobId: job_id },
      ]);
      // Stay busy until the job list has caught up, so `hasActiveJob` — not a
      // wall-clock guess — is what takes over guarding the button. A job that
      // has already finished by then is legitimately runnable again.
      await activeJobsQuery.refetch();
      setNotice({ message: queuedMessage ?? `${label} job queued.`, tone: "info" });
    } catch (error) {
      setNotice({
        message: errorDetail(error, `${label} could not be queued. Please try again.`),
        tone: "error",
      });
    } finally {
      setBusy((current) => ({ ...current, [key]: false }));
    }
  };

  const remove = () => {
    if (!pendingDelete) return;
    const { id, name } = pendingDelete;
    setPendingDelete(null);
    setNotice(null);
    deleteSite.mutate(
      { id, confirmName: name },
      {
        onSuccess: () => {
          setSelectedSiteIds((current) => {
            if (!current.has(id)) return current;
            const next = new Set(current);
            next.delete(id);
            return next;
          });
          setNotice({ message: `${name} was deleted.`, tone: "info" });
        },
        onError: (error) =>
          setNotice({
            message: errorDetail(error, `${name} could not be deleted. Please try again.`),
            tone: "error",
          }),
      },
    );
  };

  const cancelActiveBatch = async () => {
    if (batchId === null || cancelBatch.isPending) return;
    setNotice(null);
    try {
      await cancelBatch.mutateAsync(batchId);
      setConfirmCancelBatch(false);
      setNotice({ message: `Batch #${batchId} cancelled safely.`, tone: "info" });
    } catch (error) {
      setNotice({
        message: errorDetail(error, "The batch could not be cancelled."),
        tone: "error",
      });
    }
  };

  return (
    <>
      <PageHeader
        title="Sites"
        sub={`${sites?.length ?? 0} connected ${
          (sites?.length ?? 0) === 1 ? "site" : "sites"
        } · ${
          totalArticles === null ? "Article count unavailable" : formatCount(totalArticles)
        } active articles`}
        actions={
          <>
            <button type="button" onClick={() => setShowImport(true)} className="btn btn-primary">
              Import CSV
            </button>
            <button type="button" onClick={() => setShowAdd(true)} className="btn btn-outline">
              Connect site
            </button>
            <button
              type="button"
              onClick={() => (selectionMode ? cancelSelection() : setSelectionMode(true))}
              aria-pressed={selectionMode}
              className="btn btn-outline"
            >
              {selectionMode ? "Cancel selection" : "Select sites"}
            </button>
          </>
        }
      />
      <div className="relative overflow-y-auto px-4 py-4 sm:px-6 sm:py-5 lg:px-8 lg:py-6">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <label className="min-w-52 flex-1 sm:max-w-sm">
            <span className="sr-only">Search sources</span>
            <input
              type="search"
              name="q"
              className="field"
              placeholder="Search name, URL or connector…"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          {sitesQuery.dataUpdatedAt > 0 && (
            <span className="text-caption text-muted">
              Updated {timeAgo(new Date(sitesQuery.dataUpdatedAt).toISOString())}
            </span>
          )}
        </div>

        {selectionMode && (
          <div className="card mb-4 flex items-center justify-between gap-3 px-3 py-2.5 lg:hidden">
            <label className="flex min-h-11 cursor-pointer items-center gap-3">
              <SelectionControl
                inputRef={selectVisibleMobileRef}
                label="Select all visible sites"
                checked={allVisibleSelected}
                indeterminate={someVisibleSelected}
                disabled={
                  visibleSiteIds.length === 0 ||
                  (batchLimitReached && selectedVisibleCount === 0)
                }
                onChange={toggleAllVisible}
              />
              <span className="text-caption font-medium text-ink">Select visible sites</span>
            </label>
            <span className="text-caption text-muted">
              {visibleSiteIds.length} visible
            </span>
          </div>
        )}

        {activeJobsQuery.isError && (
          <div
            role="alert"
            className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-error/30 bg-error/5 px-3 py-2 text-caption text-error-ink"
          >
            <span className="min-w-0 flex-1">
              Live job status is unavailable. Refresh it before starting another crawl or analysis.
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

        {notice && <Notice notice={notice} onDismiss={() => setNotice(null)} />}

        {batchQuery.data && (
          <Suspense fallback={null}>
            <BatchPipelinePanel
              batch={batchQuery.data}
              sites={sites ?? []}
              retryingSiteId={
                retryPipelineSite.isPending ? (retryPipelineSite.variables?.siteId ?? null) : null
              }
              onRetry={(siteId) => void retryBatchSite(siteId)}
              cancelling={cancelBatch.isPending}
              onCancel={() => setConfirmCancelBatch(true)}
            />
          </Suspense>
        )}

        {batchId !== null && batchQuery.isError && (
          <div className="mb-4">
            <ErrorPanel
              title={`Batch #${batchId} could not be loaded`}
              description="The engine could not return the latest pipeline progress."
              onRetry={() => void batchQuery.refetch()}
              retrying={batchQuery.isFetching}
            />
          </div>
        )}

        <div className={`${GRID} eyebrow hidden px-5 pb-3 lg:grid`}>
          <div className="flex items-center gap-3">
            {selectionMode && (
              <label className="touch-target inline-flex cursor-pointer items-center justify-center">
                <SelectionControl
                  inputRef={selectVisibleRef}
                  label="Select all visible sites"
                  checked={allVisibleSelected}
                  indeterminate={someVisibleSelected}
                  disabled={
                    visibleSiteIds.length === 0 ||
                    (batchLimitReached && selectedVisibleCount === 0)
                  }
                  onChange={toggleAllVisible}
                />
              </label>
            )}
            <span>Site</span>
          </div>
          <div>Platform</div>
          <div className="xl:hidden">Details</div>
          <div className="hidden xl:block">Articles</div>
          <div className="hidden xl:block">Internal links</div>
          <div className="hidden xl:block">Last crawl</div>
          <div>Status</div>
          <div />
        </div>

        {sitesQuery.isPending && <SkeletonRows count={3} label="Loading sites" />}

        {!sitesQuery.isPending && sitesQuery.isError && (
          <ErrorPanel
            title="Your sites could not be loaded"
            description="LinkMesh could not reach the engine, so this list is not showing your connected sites."
            onRetry={() => void sitesQuery.refetch()}
            retrying={sitesQuery.isFetching}
          />
        )}

        {!sitesQuery.isPending && !sitesQuery.isError && sites?.length === 0 && (
          <EmptyPanel>
            No sites are connected yet. Import a CSV or connect your first site to start
            crawling.
          </EmptyPanel>
        )}

        <div className="flex flex-col gap-2.5">
          {visibleSites?.map((site) => (
            <div
              key={site.id}
              className={`${GRID} card px-4 py-4 text-body-sm transition-shadow hover:shadow-soft sm:px-5 ${
                selectedSiteIds.has(site.id) ? "border-ink bg-surface-strong" : ""
              }`}
            >
              <div
                role="group"
                aria-label={`Site ${site.name}`}
                className="flex min-w-0 items-center gap-3"
              >
                {selectionMode ? (
                  <label className="touch-target flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                    <SelectionControl
                      label={`Select ${site.name} for batch`}
                      checked={selectedSiteIds.has(site.id)}
                      disabled={!selectedSiteIds.has(site.id) && batchLimitReached}
                      onChange={() => toggleSelectedSite(site.id)}
                    />
                    <SiteIdentity site={site} />
                  </label>
                ) : (
                  <SiteIdentity site={site} />
                )}
                <OpenSiteLink site={site} />
              </div>
              <div className="text-caption text-muted lg:text-body">
                <span className="lg:hidden">Platform: </span>
                <span className="font-medium text-ink lg:font-normal lg:text-body">
                  {sitePlatformLabel(site.platform)}
                </span>
              </div>
              <div className="flex flex-col gap-0.5 xl:hidden">
                <SiteDetail
                  label="Articles"
                  value={
                    site.article_count === undefined ? "Not available" : formatCount(site.article_count)
                  }
                />
                <SiteDetail
                  label="Internal links"
                  value={
                    site.internal_link_count === undefined
                      ? "Not available"
                      : formatCount(site.internal_link_count)
                  }
                />
                <SiteDetail
                  label="Last crawl"
                  value={site.last_crawl_at ? timeAgo(site.last_crawl_at) : "Never"}
                  title={site.last_crawl_at ?? undefined}
                  dateTime={site.last_crawl_at}
                />
              </div>
              <div className="hidden xl:block">
                <SiteDetail
                  label="Articles"
                  value={
                    site.article_count === undefined ? "Not available" : formatCount(site.article_count)
                  }
                />
              </div>
              <div className="hidden xl:block">
                <SiteDetail
                  label="Internal links"
                  value={
                    site.internal_link_count === undefined
                      ? "Not available"
                      : formatCount(site.internal_link_count)
                  }
                />
              </div>
              <div className="hidden xl:block">
                <SiteDetail
                  label="Last crawl"
                  value={site.last_crawl_at ? timeAgo(site.last_crawl_at) : "Never"}
                  title={site.last_crawl_at ?? undefined}
                  dateTime={site.last_crawl_at}
                />
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <CurrentSiteStatus
                  site={site}
                  activeJobsBySite={activeJobsBySite}
                  trackedJobsBySite={trackedJobsBySite}
                />
                {site.platform !== "pool" && <SuggestionMethodBadge />}
              </div>
              <div className="flex flex-wrap items-center justify-start gap-2 lg:justify-end">
                <button
                  type="button"
                  onClick={() => void run(site.id, "Crawl", "ingestion", ingestSite)}
                  aria-label={`Crawl ${site.name}`}
                  disabled={
                    busy[busyKey(site.id, "Crawl")] ||
                    jobStatusUnavailable ||
                    hasActiveJob(site.id, "ingestion")
                  }
                  className="btn btn-outline btn-sm"
                >
                  {busy[busyKey(site.id, "Crawl")] && (
                    <LogoLoadingAnimation size="xs" className="text-primary flex-none" />
                  )}
                  {busy[busyKey(site.id, "Crawl")]
                    ? "Queueing…"
                    : hasActiveJob(site.id, "ingestion")
                      ? "Crawl active"
                      : "Crawl"}
                </button>
                <ActionMenu
                  label="Actions"
                  ariaLabel={`Actions for ${site.name}`}
                  items={[
                    ...(site.platform === "pool"
                      ? []
                      : [
                          {
                            label:
                              site.suggestion_slots_available === 0
                                ? "Generate suggestions — queue full"
                                : "Generate suggestions",
                            disabled:
                              site.suggestion_slots_available === 0 ||
                              busy[busyKey(site.id, "Generate suggestions")] ||
                              jobStatusUnavailable ||
                              hasActiveJob(site.id, "analysis"),
                            onSelect: () =>
                              void run(
                                site.id,
                                "Generate suggestions",
                                "analysis",
                                triggerAnalysis,
                                "Suggestion generation queued.",
                              ),
                          },
                          {
                            label: "External link policy",
                            onSelect: () => setPolicySite(site),
                          },
                          {
                            label: "Editorial ranking policy",
                            onSelect: () => setRankingPolicySite(site),
                          },
                          {
                            // Was "Publish approved", and it published every
                            // selected suggestion for the site with nobody
                            // having seen the resulting edit. Publication is now
                            // reachable only through the review that shows the
                            // exact HTML and takes an explicit approval.
                            label: "Review publication changes",
                            disabled: false,
                            onSelect: () =>
                              navigate(`/queue?site=${site.id}&status=approved`),
                          },
                          {
                            // The label carries the state, so the menu says
                            // whether this site can publish at all without the
                            // row needing another badge.
                            label: site.has_wordpress_credentials
                              ? "Replace WordPress account"
                              : "Add WordPress account",
                            disabled: false,
                            onSelect: () => setCredentialsFor(site),
                          },
                          {
                            label: "Import article CSV",
                            onSelect: () => setArticleImportFor(site),
                          },
                        ]),
                    {
                      label: "Delete site",
                      danger: true,
                      disabled: deleteSite.isPending,
                      onSelect: () => setPendingDelete({ id: site.id, name: site.name }),
                    },
                  ]}
                />
              </div>
            </div>
          ))}
        </div>

        {hasMoreSites && (
          <div className="flex flex-col items-center gap-2 py-4">
            <button
              type="button"
              onClick={showMoreSites}
              disabled={sitesQuery.isFetchingNextPage}
              className="btn btn-outline"
            >
              {sitesQuery.isFetchingNextPage ? "Loading…" : "Show more sites"}
            </button>
            <span className="text-caption text-muted" aria-live="polite">
              Showing {visibleSites.length} of {filteredSites?.length ?? 0}
            </span>
          </div>
        )}

        {!sitesQuery.isPending &&
          !sitesQuery.isError &&
          sites?.length !== 0 &&
          visibleSites?.length === 0 && (
            <EmptyPanel>No connected site matches “{search}”.</EmptyPanel>
          )}

        {selectionMode && selectedSiteIds.size > 0 && (
          <div
            role="region"
            aria-label="Batch selection"
            className="sticky bottom-3 z-10 mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-hairline-strong bg-surface-card px-4 py-3 shadow-lift sm:px-5"
          >
            <div className="min-w-0 flex-1">
              <div className="text-body-sm font-medium text-ink" aria-live="polite">
                {selectedSiteIds.size} site{selectedSiteIds.size === 1 ? "" : "s"} selected
              </div>
              <div className="mt-1 text-caption text-muted">
                {activeJobsQuery.isError
                  ? "Live job status is unavailable. Refresh before starting a batch."
                  : selectedActiveCount > 0
                    ? `${selectedActiveCount} selected site${selectedActiveCount === 1 ? " is" : "s are"} already busy.`
                    : batchLimitReached
                      ? `Batch limit reached: ${MAX_PIPELINE_BATCH_SITES} sites maximum.`
                      : selectedOutsideSearchCount > 0
                  ? `${selectedOutsideSearchCount} selected outside this search.`
                  : "Ready to run together."}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSelectedSiteIds(new Set())}
              className="btn btn-outline btn-sm"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => void launchBatch()}
              disabled={createBatch.isPending || batchBlocked}
              className="btn btn-primary btn-sm sm:min-w-[10rem]"
            >
              {createBatch.isPending ? "Starting batch…" : `Run batch (${selectedSiteIds.size})`}
            </button>
          </div>
        )}
      </div>
      <Suspense fallback={null}>
        {showAdd && <AddSiteModal onClose={() => setShowAdd(false)} />}
        {showImport && <BulkImportModal onClose={() => setShowImport(false)} />}
        {articleImportFor && (
          <ArticleImportModal
            site={articleImportFor}
            onClose={() => setArticleImportFor(null)}
          />
        )}
        {credentialsFor && (
          <SiteCredentialsModal
            site={credentialsFor}
            onClose={() => setCredentialsFor(null)}
            onDone={(message) => setNotice({ message, tone: "info" })}
          />
        )}
        {policySite && (
          <ExternalLinkPolicyModal
            site={policySite}
            onClose={() => setPolicySite(null)}
            onSaved={(message) => setNotice({ message, tone: "info" })}
          />
        )}
        {rankingPolicySite && (
          <EditorialRankingPolicyModal
            site={rankingPolicySite}
            onClose={() => setRankingPolicySite(null)}
            onSaved={(message) => setNotice({ message, tone: "info" })}
          />
        )}
      </Suspense>
      {pendingDelete && (
        <ConfirmDialog
          title={`Delete ${pendingDelete.name}?`}
          description="This removes the site along with its articles, embeddings and suggestions. Links already published to the live site are not removed."
          confirmLabel="Delete site"
          confirmPhrase={pendingDelete.name}
          danger
          pending={deleteSite.isPending}
          onConfirm={remove}
          onCancel={() => setPendingDelete(null)}
        />
      )}
      {confirmCancelBatch && batchId !== null && (
        <ConfirmDialog
          title={`Cancel batch #${batchId}?`}
          description="Queued work will be removed and running stages will be stopped. Completed sites stay completed; unfinished sites are marked cancelled."
          confirmLabel="Cancel batch"
          danger
          pending={cancelBatch.isPending}
          onConfirm={() => void cancelActiveBatch()}
          onCancel={() => setConfirmCancelBatch(false)}
        />
      )}
    </>
  );
}

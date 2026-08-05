import { useEffect, useMemo, useRef, useState } from "react";
import type { Ref } from "react";

import { ingestSite, publishSite } from "../api/sites";
import { triggerAnalysis } from "../api/suggestions";
import ActionMenu from "../components/ActionMenu";
import ConfirmDialog from "../components/ConfirmDialog";
import JobStatusBadge from "../components/jobs/JobStatusBadge";
import Notice from "../components/Notice";
import type { NoticeState } from "../components/Notice";
import PageHeader from "../components/PageHeader";
import { EmptyPanel, ErrorPanel, SkeletonRows } from "../components/QueryState";
import AddSiteModal from "../components/sites/AddSiteModal";
import BulkImportModal from "../components/sites/BulkImportModal";
import BatchPipelinePanel from "../components/sites/BatchPipelinePanel";
import SiteStatusBadge from "../components/sites/SiteStatusBadge";
import { useActiveJobs } from "../hooks/useJobs";
import {
  useCreatePipelineBatch,
  usePipelineBatch,
  useRetryPipelineSite,
} from "../hooks/usePipeline";
import { useDeleteSite, useSites } from "../hooks/useSites";
import { errorDetail } from "../lib/errors";
import {
  RQ_SCHEDULING_COPY,
  formatCount,
  initials,
  orbPlateClass,
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

const batchIdFromUrl = () => {
  const value = Number(new URLSearchParams(window.location.search).get("batch"));
  return Number.isInteger(value) && value > 0 ? value : null;
};

function SiteDetail({
  label,
  value,
  title,
}: {
  label?: string;
  value: string;
  title?: string;
}) {
  return (
    <span className="text-caption text-muted" title={title}>
      {label && <span className="xl:hidden">{label}: </span>}
      <span className="font-medium text-ink">{value}</span>
    </span>
  );
}

interface TrackedJob {
  siteId: number;
  label: string;
  kind: JobKind;
  jobId: string;
}

function CurrentSiteStatus({
  site,
  activeJobs,
  trackedJobs,
}: {
  site: Site;
  activeJobs: JobRun[];
  trackedJobs: TrackedJob[];
}) {
  const siteId = site.id;
  const active = activeJobs.find((job) => job.site_id === siteId);
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

  const tracked = [...trackedJobs].reverse().find((job) => job.siteId === siteId);
  if (tracked) {
    return <JobStatusBadge jobId={tracked.jobId} kind={tracked.kind} />;
  }

  return (
    <SiteStatusBadge
      status={site.last_ingestion_status}
      lastCrawlAt={site.last_crawl_at}
      analysisStatus={site.last_analysis_status}
      lastAnalysisAt={site.last_analysis_at}
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
      title="Generation method for new suggestions: hybrid candidate retrieval with BM25-512 ordering and up to three suggestions per source"
    >
      <span className="dot bg-primary" />
      Hybrid
    </span>
  );
}

function SelectionControl({
  label,
  checked,
  indeterminate = false,
  disabled = false,
  inputRef,
  onChange,
}: {
  label: string;
  checked: boolean;
  indeterminate?: boolean;
  disabled?: boolean;
  inputRef?: Ref<HTMLInputElement>;
  onChange: () => void;
}) {
  const active = checked || indeterminate;

  return (
    <>
      <input
        ref={inputRef}
        type="checkbox"
        className="peer sr-only"
        aria-label={label}
        aria-checked={indeterminate ? "mixed" : checked}
        checked={checked}
        disabled={disabled}
        onChange={onChange}
      />
      <span
        aria-hidden="true"
        className={`pointer-events-none flex h-5 w-5 flex-none items-center justify-center rounded-md border transition-colors peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink peer-disabled:opacity-50 ${
          active
            ? "border-primary bg-primary text-on-primary"
            : "border-hairline-control bg-surface-card"
        }`}
      >
        {indeterminate ? (
          <span className="h-0.5 w-2.5 rounded-pill bg-on-primary" />
        ) : checked ? (
          <svg aria-hidden="true" className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none">
            <path
              d="m3 8 3 3 7-7"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : null}
      </span>
    </>
  );
}

function SiteIdentity({ site, index }: { site: Site; index: number }) {
  return (
    <>
      <span
        className={`flex h-8 w-8 flex-none items-center justify-center rounded-full text-caption-upper text-ink ${orbPlateClass(index)}`}
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
  const sitesQuery = useSites();
  const sites = useMemo(
    () => sitesQuery.data?.filter((site) => site.platform !== "pool"),
    [sitesQuery.data],
  );
  const totalArticles =
    sites?.every((site) => site.article_count !== undefined)
      ? sites.reduce((total, site) => total + (site.article_count ?? 0), 0)
      : null;
  const activeJobs = useActiveJobs().data ?? [];
  const deleteSite = useDeleteSite();
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [jobs, setJobs] = useState<TrackedJob[]>([]);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ id: number; name: string } | null>(null);
  const [search, setSearch] = useState("");
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedSiteIds, setSelectedSiteIds] = useState<Set<number>>(new Set());
  const selectVisibleRef = useRef<HTMLInputElement>(null);
  const selectVisibleMobileRef = useRef<HTMLInputElement>(null);
  const [batchId, setBatchId] = useState<number | null>(batchIdFromUrl);
  const createBatch = useCreatePipelineBatch();
  const batchQuery = usePipelineBatch(batchId);
  const retryPipelineSite = useRetryPipelineSite();

  useEffect(() => {
    const syncBatchFromUrl = () => setBatchId(batchIdFromUrl());
    window.addEventListener("popstate", syncBatchFromUrl);
    return () => window.removeEventListener("popstate", syncBatchFromUrl);
  }, []);
  const visibleSites = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return sites;
    return sites?.filter((site) =>
      [site.name, site.base_url, site.platform].some((value) => value.toLowerCase().includes(query)),
    );
  }, [search, sites]);

  const visibleSiteIds = useMemo(() => visibleSites?.map((site) => site.id) ?? [], [visibleSites]);
  const selectedVisibleCount = visibleSiteIds.filter((id) => selectedSiteIds.has(id)).length;
  const allVisibleSelected =
    visibleSiteIds.length > 0 && selectedVisibleCount === visibleSiteIds.length;
  const someVisibleSelected = selectedVisibleCount > 0 && !allVisibleSelected;
  const selectedOutsideSearchCount = selectedSiteIds.size - selectedVisibleCount;

  useEffect(() => {
    if (selectVisibleRef.current) selectVisibleRef.current.indeterminate = someVisibleSelected;
    if (selectVisibleMobileRef.current) {
      selectVisibleMobileRef.current.indeterminate = someVisibleSelected;
    }
  }, [someVisibleSelected]);

  const busyKey = (siteId: number, label: string) => `${siteId}:${label}`;

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
      if (allVisibleSelected) visibleSiteIds.forEach((id) => next.delete(id));
      else visibleSiteIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const cancelSelection = () => {
    setSelectionMode(false);
    setSelectedSiteIds(new Set());
  };

  const showBatch = (nextBatchId: number) => {
    const url = new URL(window.location.href);
    url.searchParams.set("batch", String(nextBatchId));
    window.history.pushState({}, "", url);
    setBatchId(nextBatchId);
  };

  const launchBatch = async () => {
    if (selectedSiteIds.size === 0 || createBatch.isPending) return;
    setNotice(null);
    try {
      const batch = await createBatch.mutateAsync([...selectedSiteIds]);
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
    if (busy[key]) return;
    setBusy((current) => ({ ...current, [key]: true }));
    setNotice(null);
    try {
      const { job_id } = await action(siteId);
      // Keyed by site and action so a crawl badge survives a later publish.
      setJobs((current) => [
        ...current.filter((job) => !(job.siteId === siteId && job.label === label)),
        { siteId, label, kind, jobId: job_id },
      ]);
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
        onSuccess: () => setNotice({ message: `${name} was deleted.`, tone: "info" }),
        onError: (error) =>
          setNotice({
            message: errorDetail(error, `${name} could not be deleted. Please try again.`),
            tone: "error",
          }),
      },
    );
  };

  return (
    <>
      <PageHeader
        title="Sites"
        sub={`${sites?.length ?? 0} connected ${
          (sites?.length ?? 0) === 1 ? "source" : "sources"
        } · ${
          totalArticles === null ? "Soon" : formatCount(totalArticles)
        } active articles normalized via ContentConnector`}
      />
      <div className="relative overflow-y-auto px-4 py-4 sm:px-6 sm:py-5 lg:px-8 lg:py-6">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <button onClick={() => setShowImport(true)} className="btn btn-primary">
            Import CSV
          </button>
          <button onClick={() => setShowAdd(true)} className="btn btn-outline">
            + Connect source
          </button>
          <button
            type="button"
            onClick={() => (selectionMode ? cancelSelection() : setSelectionMode(true))}
            aria-pressed={selectionMode}
            className="btn btn-outline"
          >
            {selectionMode ? "Cancel selection" : "Select sites"}
          </button>
          <label className="min-w-52 flex-1 sm:max-w-sm">
            <span className="sr-only">Search sources</span>
            <input
              type="search"
              className="field"
              placeholder="Search name, URL or connector"
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
                disabled={visibleSiteIds.length === 0}
                onChange={toggleAllVisible}
              />
              <span className="text-caption font-medium text-ink">Select visible sites</span>
            </label>
            <span className="text-caption text-muted">
              {visibleSiteIds.length} visible
            </span>
          </div>
        )}

        {notice && <Notice notice={notice} onDismiss={() => setNotice(null)} />}

        {batchQuery.data && (
          <BatchPipelinePanel
            batch={batchQuery.data}
            sites={sites ?? []}
            retryingSiteId={
              retryPipelineSite.isPending ? (retryPipelineSite.variables?.siteId ?? null) : null
            }
            onRetry={(siteId) => void retryBatchSite(siteId)}
          />
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
                  disabled={visibleSiteIds.length === 0}
                  onChange={toggleAllVisible}
                />
              </label>
            )}
            <span>Site</span>
          </div>
          <div>Connector</div>
          <div className="xl:hidden">Details</div>
          <div className="hidden xl:block">Articles</div>
          <div className="hidden xl:block">Int. links</div>
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
          {visibleSites?.map((site, index) => (
            <div
              key={site.id}
              className={`${GRID} card px-4 py-4 text-body-sm transition-shadow hover:shadow-soft sm:px-5 ${
                selectedSiteIds.has(site.id) ? "border-ink bg-surface-strong" : ""
              }`}
            >
              <div className="flex min-w-0 items-center gap-3">
                {selectionMode ? (
                  <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                    <SelectionControl
                      label={`Select ${site.name} for batch`}
                      checked={selectedSiteIds.has(site.id)}
                      onChange={() => toggleSelectedSite(site.id)}
                    />
                    <SiteIdentity site={site} index={index} />
                  </label>
                ) : (
                  <SiteIdentity site={site} index={index} />
                )}
              </div>
              <div className="text-caption text-muted lg:text-body">
                <span className="lg:hidden">Connector: </span>
                <span className="font-medium text-ink lg:font-normal lg:text-body">
                  {site.platform === "wordpress"
                    ? "WP REST API"
                    : site.platform === "pool"
                      ? "Content pool"
                      : "Sitemap crawl"}
                </span>
              </div>
              <div className="flex flex-col gap-0.5 xl:hidden">
                <SiteDetail
                  label="Articles"
                  value={
                    site.article_count === undefined ? "Soon" : formatCount(site.article_count)
                  }
                />
                <SiteDetail
                  label="Int. links"
                  value={
                    site.internal_link_count === undefined
                      ? "Soon"
                      : formatCount(site.internal_link_count)
                  }
                />
                <SiteDetail
                  label="Last crawl"
                  value={site.last_crawl_at ? timeAgo(site.last_crawl_at) : "Soon"}
                  title={site.last_crawl_at ?? undefined}
                />
              </div>
              <div className="hidden xl:block">
                <SiteDetail
                  value={
                    site.article_count === undefined ? "Soon" : formatCount(site.article_count)
                  }
                />
              </div>
              <div className="hidden xl:block">
                <SiteDetail
                  value={
                    site.internal_link_count === undefined
                      ? "Soon"
                      : formatCount(site.internal_link_count)
                  }
                />
              </div>
              <div className="hidden xl:block">
                <SiteDetail
                  value={site.last_crawl_at ? timeAgo(site.last_crawl_at) : "Soon"}
                  title={site.last_crawl_at ?? undefined}
                />
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <CurrentSiteStatus
                  site={site}
                  activeJobs={activeJobs}
                  trackedJobs={jobs}
                />
                {site.platform !== "pool" && <SuggestionMethodBadge />}
              </div>
              <div className="flex flex-wrap items-center justify-start gap-2 lg:justify-end">
                <button
                  type="button"
                  onClick={() => void run(site.id, "Crawl", "ingestion", ingestSite)}
                  disabled={busy[busyKey(site.id, "Crawl")]}
                  className="btn btn-outline btn-sm"
                >
                  {busy[busyKey(site.id, "Crawl")] ? "Queueing…" : "Crawl"}
                </button>
                <ActionMenu
                  label="Actions"
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
                              activeJobs.some(
                                (job) => job.site_id === site.id && job.kind === "analysis",
                              ),
                            onSelect: () =>
                              void run(
                                site.id,
                                "Generate suggestions",
                                "analysis",
                                triggerAnalysis,
                                "Hybrid suggestion generation queued.",
                              ),
                          },
                          {
                            label: "Publish approved",
                            disabled: busy[busyKey(site.id, "Publish approved")],
                            onSelect: () =>
                              void run(
                                site.id,
                                "Publish approved",
                                "publication",
                                publishSite,
                              ),
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

        {!sitesQuery.isPending &&
          !sitesQuery.isError &&
          sites?.length !== 0 &&
          visibleSites?.length === 0 && (
            <EmptyPanel>No connected source matches “{search}”.</EmptyPanel>
          )}

        <div className="mt-5 text-caption leading-relaxed text-muted">
          Connectors normalize every platform into the same{" "}
          <span className="rounded-pill bg-surface-strong px-2.5 py-0.5 text-caption text-ink">
            Article
          </span>{" "}
          object before suggestion analysis. {RQ_SCHEDULING_COPY}
        </div>

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
                {selectedOutsideSearchCount > 0
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
              disabled={createBatch.isPending}
              className="btn btn-primary btn-sm sm:min-w-[10rem]"
            >
              {createBatch.isPending ? "Starting batch…" : `Run batch (${selectedSiteIds.size})`}
            </button>
          </div>
        )}
      </div>
      {showAdd && <AddSiteModal onClose={() => setShowAdd(false)} />}
      {showImport && <BulkImportModal onClose={() => setShowImport(false)} />}
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
    </>
  );
}

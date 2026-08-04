import { useMemo, useState } from "react";

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
import PoolSourceReviewModal, {
  type PoolSourceReviewAction,
} from "../components/sites/PoolSourceReviewModal";
import PoolSourceStatusBadge from "../components/sites/PoolSourceStatusBadge";
import SiteStatusBadge from "../components/sites/SiteStatusBadge";
import { useActiveJobs } from "../hooks/useJobs";
import {
  useApprovePoolSource,
  useDeleteSite,
  useReactivatePoolSource,
  useRevokePoolSourceApproval,
  useSites,
} from "../hooks/useSites";
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

function poolCrawlBlockedReason(site: Site) {
  if (site.platform !== "pool") return undefined;
  if (site.pool_source_quarantined) {
    return site.pool_source_approved
      ? "Reactivate this quarantined source before crawling."
      : "Approve this source, then reactivate it before crawling.";
  }
  if (!site.pool_source_approved) return "Approve this source before crawling.";
  return undefined;
}

export default function SitesPage() {
  const sitesQuery = useSites();
  const sites = sitesQuery.data;
  const totalArticles =
    sites?.every((site) => site.article_count !== undefined)
      ? sites.reduce((total, site) => total + (site.article_count ?? 0), 0)
      : null;
  const activeJobs = useActiveJobs().data ?? [];
  const deleteSite = useDeleteSite();
  const approvePool = useApprovePoolSource();
  const revokePool = useRevokePoolSourceApproval();
  const reactivatePool = useReactivatePoolSource();
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [jobs, setJobs] = useState<TrackedJob[]>([]);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ id: number; name: string } | null>(null);
  const [pendingRevoke, setPendingRevoke] = useState<{ id: number; name: string } | null>(null);
  const [poolReview, setPoolReview] = useState<{
    action: PoolSourceReviewAction;
    site: Pick<Site, "id" | "name" | "base_url">;
  } | null>(null);
  const [search, setSearch] = useState("");
  const visibleSites = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return sites;
    return sites?.filter((site) =>
      [site.name, site.base_url, site.platform].some((value) => value.toLowerCase().includes(query)),
    );
  }, [search, sites]);

  const busyKey = (siteId: number, label: string) => `${siteId}:${label}`;

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
    deleteSite.mutate(id, {
      onSuccess: () => setNotice({ message: `${name} was deleted.`, tone: "info" }),
      onError: (error) =>
        setNotice({
          message: errorDetail(error, `${name} could not be deleted. Please try again.`),
          tone: "error",
        }),
    });
  };

  const openPoolReview = (action: PoolSourceReviewAction, site: Site) => {
    if (action === "approve") approvePool.reset();
    else reactivatePool.reset();
    setNotice(null);
    setPoolReview({ action, site: { id: site.id, name: site.name, base_url: site.base_url } });
  };

  const submitPoolReview = (reviewer: string) => {
    if (!poolReview) return;
    const { action, site } = poolReview;
    const onSuccess = () => {
      setPoolReview(null);
      setNotice({
        message: `${site.name} was ${action === "approve" ? "approved" : "reactivated"}.`,
        tone: "info",
      });
    };

    if (action === "approve") {
      approvePool.mutate({ id: site.id, approvedBy: reviewer }, { onSuccess });
    } else {
      reactivatePool.mutate({ id: site.id, reactivatedBy: reviewer }, { onSuccess });
    }
  };

  const revoke = () => {
    if (!pendingRevoke) return;
    const { id, name } = pendingRevoke;
    setPendingRevoke(null);
    setNotice(null);
    revokePool.mutate(id, {
      onSuccess: () => setNotice({ message: `${name} approval was revoked.`, tone: "info" }),
      onError: (error) =>
        setNotice({
          message: errorDetail(error, `${name} approval could not be revoked. Please try again.`),
          tone: "error",
        }),
    });
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

        {notice && <Notice notice={notice} onDismiss={() => setNotice(null)} />}

        <div className={`${GRID} eyebrow hidden px-5 pb-3 lg:grid`}>
          <div>Site</div>
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
          {visibleSites?.map((site, index) => {
            const blockedReason = poolCrawlBlockedReason(site);
            const crawlBusy = busy[busyKey(site.id, "Crawl")];
            const poolActions =
              site.platform === "pool"
                ? [
                    ...(!site.pool_source_approved
                      ? [
                          {
                            label: "Approve source",
                            disabled: approvePool.isPending,
                            onSelect: () => openPoolReview("approve", site),
                          },
                        ]
                      : []),
                    ...(site.pool_source_quarantined
                      ? [
                          {
                            label: "Reactivate source",
                            disabled: !site.pool_source_approved || reactivatePool.isPending,
                            onSelect: () => openPoolReview("reactivate", site),
                          },
                        ]
                      : []),
                    ...(site.pool_source_approved
                      ? [
                          {
                            label: "Revoke approval",
                            disabled: revokePool.isPending,
                            onSelect: () => setPendingRevoke({ id: site.id, name: site.name }),
                          },
                        ]
                      : []),
                  ]
                : [];

            return (
            <div
              key={site.id}
              className={`${GRID} card px-4 py-4 text-body-sm transition-shadow hover:shadow-soft sm:px-5`}
            >
              <div className="flex items-center gap-3">
                {/* {component.voice-icon-circular}, wearing one of the five
                    atmospheric stops — the row's only colour. */}
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
                {site.platform === "pool" && <PoolSourceStatusBadge site={site} />}
                {site.platform !== "pool" && <SuggestionMethodBadge />}
              </div>
              <div className="flex flex-wrap items-center justify-start gap-2 lg:justify-end">
                <button
                  type="button"
                  onClick={() => void run(site.id, "Crawl", "ingestion", ingestSite)}
                  disabled={crawlBusy || Boolean(blockedReason)}
                  title={blockedReason}
                  className="btn btn-outline btn-sm"
                >
                  {crawlBusy ? "Queueing…" : "Crawl"}
                </button>
                <ActionMenu
                  label="Actions"
                  items={[
                    ...poolActions,
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
            );
          })}
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
      </div>
      {showAdd && <AddSiteModal onClose={() => setShowAdd(false)} />}
      {showImport && <BulkImportModal onClose={() => setShowImport(false)} />}
      {pendingDelete && (
        <ConfirmDialog
          title={`Delete ${pendingDelete.name}?`}
          description="This removes the site along with its articles, embeddings and suggestions. Links already published to the live site are not removed."
          confirmLabel="Delete site"
          danger
          pending={deleteSite.isPending}
          onConfirm={remove}
          onCancel={() => setPendingDelete(null)}
        />
      )}
      {pendingRevoke && (
        <ConfirmDialog
          title={`Revoke ${pendingRevoke.name}?`}
          description="This stops manual and scheduled crawls for the content pool. Existing imported articles are not deleted by revoking approval."
          confirmLabel="Revoke approval"
          pending={revokePool.isPending}
          onConfirm={revoke}
          onCancel={() => setPendingRevoke(null)}
        />
      )}
      {poolReview && (
        <PoolSourceReviewModal
          key={`${poolReview.site.id}:${poolReview.action}`}
          site={poolReview.site}
          action={poolReview.action}
          pending={poolReview.action === "approve" ? approvePool.isPending : reactivatePool.isPending}
          error={poolReview.action === "approve" ? approvePool.error : reactivatePool.error}
          onSubmit={submitPoolReview}
          onClose={() => setPoolReview(null)}
        />
      )}
    </>
  );
}

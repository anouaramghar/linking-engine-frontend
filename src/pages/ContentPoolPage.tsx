import { lazy, Suspense, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { ingestSite } from "../api/sites";
import ActionMenu from "../components/ActionMenu";
import ConfirmDialog from "../components/ConfirmDialog";
import JobStatusBadge from "../components/jobs/JobStatusBadge";
import LogoLoadingAnimation from "../components/LogoLoadingAnimation";
import Notice from "../components/Notice";
import type { NoticeState } from "../components/Notice";
import PageHeader from "../components/PageHeader";
import { EmptyPanel, ErrorPanel, SkeletonRows } from "../components/QueryState";
import {
  useApprovePoolSource,
  useDeleteSite,
  useReactivatePoolSource,
  useRevokePoolSource,
  useSites,
} from "../hooks/useSites";
import { useActiveJobs } from "../hooks/useJobs";
import { useIncrementalList } from "../hooks/useIncrementalList";
import { usePageState } from "../hooks/usePageState";
import { errorDetail } from "../lib/errors";
import { formatCount, timeAgo } from "../lib/utils";
import type { Site } from "../types/site";

const AddSiteModal = lazy(() => import("../components/sites/AddSiteModal"));
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
  const [showAdd, setShowAdd] = useState(false);
  const [auditSite, setAuditSite] = useState<Site | null>(null);
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

  return (
    <>
      <PageHeader
        title="Content Pool"
        sub={`${poolSources.length} external ${poolSources.length === 1 ? "source" : "sources"} available as read-only suggestion targets`}
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setShowAdd(true)}>
            Connect pool source
          </button>
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
          <label>
            <span className="sr-only">Filter pool sources by status</span>
            <select
              className="field"
              value={filter}
              onChange={(event) => setFilter(event.target.value as PoolFilter)}
            >
              <option value="all">All statuses</option>
              <option value="approved">Approved</option>
              <option value="not_approved">Not approved</option>
              <option value="quarantined">Quarantined</option>
            </select>
          </label>
        </div>

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
        <div className="mb-4 rounded-lg border border-hairline bg-canvas-soft p-4 text-caption leading-relaxed text-muted">
          Pool sources are external, read-only references. Approve a trusted source before crawling
          it; repeated failures quarantine it automatically until an operator reactivates it.
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

        <div className="flex flex-col gap-2.5">
          {visible.map((site) => (
            <article key={site.id} className="card p-4 sm:p-5">
              {(() => {
                const activeJob = activeJobs.find(
                  (job) => job.site_id === site.id && job.kind === "ingestion",
                );
                const trackedJobId = crawlJobs[site.id];
                return (
              <div className="flex flex-wrap items-start gap-4">
                <div className="min-w-56 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2
                      id={`pool-source-${site.id}`}
                      className="text-body-md font-medium text-ink"
                    >
                      {site.name}
                    </h2>
                    <span className="badge">
                      <span
                        className={`dot ${
                          site.pool_source_quarantined
                            ? "bg-error"
                            : site.pool_source_approved
                              ? "bg-success"
                              : "bg-muted-soft"
                        }`}
                      />
                      {statusLabel(site)}
                    </span>
                    {activeJob?.queue_job_id ? (
                      <JobStatusBadge
                        jobId={activeJob.queue_job_id}
                        kind="ingestion"
                        snapshot={{
                          status: activeJob.status,
                          progress: activeJob.progress,
                          error: activeJob.error,
                        }}
                      />
                    ) : trackedJobId ? (
                      <JobStatusBadge jobId={trackedJobId} kind="ingestion" />
                    ) : null}
                  </div>
                  {/* A source you cannot open is a source you cannot check.
                      Same reason as the icon on the Sites page: nobody should
                      have to copy a URL out of a table by hand. */}
                  <a
                    href={site.base_url}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={`Open ${site.name} in a new tab`}
                    className="mt-1 block break-all text-caption text-muted underline underline-offset-2 hover:text-ink"
                  >
                    {site.base_url}
                  </a>
                  {site.pool_source_quarantine_reason && (
                    <div className="mt-2 text-caption text-error-ink">
                      {site.pool_source_quarantine_reason}
                    </div>
                  )}
                </div>
                <dl className="grid grid-cols-3 gap-4 text-caption text-muted">
                  <div>
                    <dt className="sr-only">Articles</dt>
                    <dd className="block text-ink">{formatCount(site.article_count ?? 0)}</dd>
                    <span aria-hidden="true">Articles</span>
                  </div>
                  <div>
                    <dt className="sr-only">Failures</dt>
                    <dd className="block text-ink">
                      {site.pool_source_consecutive_failures ?? 0}
                    </dd>
                    <span aria-hidden="true">Failures</span>
                  </div>
                  <div title={site.last_crawl_at ?? undefined}>
                    <dt className="sr-only">Last crawl</dt>
                    <dd className="block text-ink">
                      {site.last_crawl_at ? (
                        <time dateTime={site.last_crawl_at}>{timeAgo(site.last_crawl_at)}</time>
                      ) : (
                        "Never"
                      )}
                    </dd>
                    <span aria-hidden="true">Last crawl</span>
                  </div>
                </dl>
                <div className="flex flex-wrap gap-2">
                  {site.pool_source_approved && !site.pool_source_quarantined && (
                    <button
                      type="button"
                      aria-label={`Crawl ${site.name}`}
                      className="btn btn-outline btn-sm"
                      disabled={
                        crawlingId === site.id ||
                        Boolean(activeJob) ||
                        jobStatusUnavailable
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
                      ...(!site.pool_source_approved
                        ? [
                            {
                              label: "Approve",
                              disabled: mutationPending,
                              onSelect: () =>
                                void runAction(`${site.name} approval`, () =>
                                  approve.mutateAsync(site.id),
                                ),
                            },
                          ]
                        : []),
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
              </div>
                );
              })()}
            </article>
          ))}
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
        {auditSite && <PoolAuditModal site={auditSite} onClose={() => setAuditSite(null)} />}
      </Suspense>
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

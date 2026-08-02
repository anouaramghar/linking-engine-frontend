import { useState } from "react";

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
import SiteStatusBadge from "../components/sites/SiteStatusBadge";
import { useActiveJobs } from "../hooks/useJobs";
import { useDeleteSite, useSites } from "../hooks/useSites";
import { errorDetail } from "../lib/errors";
import { RQ_SCHEDULING_COPY, initials, orbPlateClass, timeAgo } from "../lib/utils";
import type { JobKind, JobRun } from "../types/job";

// Shared by the header and the rows so they cannot drift apart. The narrow
// template buys the action column back from the three text columns: at 1024px
// the wide one leaves it about 142px, and "Queueing…" beside the Actions menu
// needs more than that. Name and URL already truncate, so they give it up best.
const GRID =
  "grid grid-cols-[1.6fr_1fr_1fr_1fr_1.8fr] items-center gap-3" +
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
  siteId,
  siteStatus,
  activeJobs,
  trackedJobs,
}: {
  siteId: number;
  siteStatus: string | null;
  activeJobs: JobRun[];
  trackedJobs: TrackedJob[];
}) {
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

  return <SiteStatusBadge status={siteStatus} />;
}

function SuggestionMethodBadge() {
  return (
    <span
      className="badge"
      title="Hybrid candidate retrieval with BM25-512 ordering and up to three suggestions per source"
    >
      <span className="dot bg-primary" />
      Hybrid
    </span>
  );
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
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [jobs, setJobs] = useState<TrackedJob[]>([]);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ id: number; name: string } | null>(null);

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

  return (
    <>
      <PageHeader
        title="Sites"
        sub={`${sites?.length ?? 0} connected sites · ${
          totalArticles === null ? "Soon" : totalArticles.toLocaleString()
        } active articles normalized via ContentConnector`}
      />
      <div className="relative overflow-y-auto px-8 py-6">
        <div className="mb-4 flex flex-wrap gap-2">
          <button onClick={() => setShowImport(true)} className="btn btn-primary">
            Import CSV
          </button>
          <button onClick={() => setShowAdd(true)} className="btn btn-outline">
            + Connect site
          </button>
        </div>

        {notice && <Notice notice={notice} onDismiss={() => setNotice(null)} />}

        <div className={`${GRID} eyebrow px-5 pb-3`}>
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
          {sites?.map((site, index) => (
            <div
              key={site.id}
              className={`${GRID} card px-5 py-4 text-body-sm transition-shadow hover:shadow-soft`}
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
              <div className="text-body">
                {site.platform === "wordpress" ? "WP REST API" : "Sitemap crawl"}
              </div>
              <div className="flex flex-col gap-0.5 xl:hidden">
                <SiteDetail
                  label="Articles"
                  value={site.article_count?.toLocaleString() ?? "Soon"}
                />
                <SiteDetail
                  label="Int. links"
                  value={site.internal_link_count?.toLocaleString() ?? "Soon"}
                />
                <SiteDetail
                  label="Last crawl"
                  value={site.last_crawl_at ? timeAgo(site.last_crawl_at) : "Soon"}
                  title={site.last_crawl_at ?? undefined}
                />
              </div>
              <div className="hidden xl:block">
                <SiteDetail value={site.article_count?.toLocaleString() ?? "Soon"} />
              </div>
              <div className="hidden xl:block">
                <SiteDetail value={site.internal_link_count?.toLocaleString() ?? "Soon"} />
              </div>
              <div className="hidden xl:block">
                <SiteDetail
                  value={site.last_crawl_at ? timeAgo(site.last_crawl_at) : "Soon"}
                  title={site.last_crawl_at ?? undefined}
                />
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <CurrentSiteStatus
                  siteId={site.id}
                  siteStatus={site.last_ingestion_status}
                  activeJobs={activeJobs}
                  trackedJobs={jobs}
                />
                <SuggestionMethodBadge />
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => void run(site.id, "Crawl", "ingestion", ingestSite)}
                  disabled={busy[busyKey(site.id, "Crawl")]}
                  className="btn btn-outline btn-sm"
                >
                  {busy[busyKey(site.id, "Crawl")] ? "Queueing…" : "Crawl"}
                </button>
                <ActionMenu
                  label="Actions"
                  items={[
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
    </>
  );
}

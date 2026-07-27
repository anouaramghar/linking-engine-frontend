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
import { useDeleteSite, useSites } from "../hooks/useSites";
import { errorDetail } from "../lib/errors";
import { ORBS, RQ_SCHEDULING_COPY, initials, timeAgo } from "../lib/utils";

// Shared by the header and the rows so they cannot drift apart. The narrow
// template buys the action column back from the three text columns: at 1024px
// the wide one leaves it about 142px, and "Queueing…" beside the Actions menu
// needs more than that. Name and URL already truncate, so they give it up best.
const GRID =
  "grid grid-cols-[1.6fr_1fr_.7fr_1fr_1.8fr] items-center gap-3" +
  " xl:grid-cols-[2fr_1.2fr_.8fr_1fr_1.4fr]";

interface TrackedJob {
  siteId: number;
  label: string;
  jobId: string;
}

export default function SitesPage() {
  const sitesQuery = useSites();
  const sites = sitesQuery.data;
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
    action: (id: number) => Promise<{ job_id: string }>,
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
        { siteId, label, jobId: job_id },
      ]);
      setNotice({ message: `${label} job queued.`, tone: "info" });
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

  const actions: [string, (id: number) => Promise<{ job_id: string }>][] = [
    ["Suggest (baseline)", triggerAnalysis],
    ["Publish approved", publishSite],
  ];

  return (
    <>
      <PageHeader
        title="Sites"
        sub={`${sites?.length ?? 0} connected sites · current LinkMesh connectors`}
      />
      <div className="relative overflow-y-auto px-8 py-6">
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            onClick={() => setShowImport(true)}
            className="rounded-full border border-stone-800 bg-stone-800 px-4 py-2 text-sm font-medium text-white hover:bg-stone-950"
          >
            Import CSV
          </button>
          <button
            onClick={() => setShowAdd(true)}
            className="rounded-full border border-stone-300 px-4 py-2 text-sm font-medium hover:border-stone-950"
          >
            + Connect site
          </button>
        </div>

        {notice && <Notice notice={notice} onDismiss={() => setNotice(null)} />}

        <div
          className={`${GRID} px-5 pb-3 text-[11px] font-semibold uppercase tracking-widest text-stone-600`}
        >
          <div>Site</div>
          <div>Connector</div>
          <div>Added</div>
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
              className={`${GRID} rounded-2xl border border-stone-200 bg-white px-5 py-4 text-[14.5px] hover:shadow-[0_4px_16px_rgba(0,0,0,.04)]`}
            >
              <div className="flex items-center gap-3">
                <span
                  className="flex h-8 w-8 flex-none items-center justify-center rounded-full text-[11px] font-semibold text-stone-800"
                  style={{
                    background: `radial-gradient(circle at 30% 30%, ${ORBS[index % ORBS.length]}, #f0efed)`,
                  }}
                >
                  {initials(site.name)}
                </span>
                <div className="min-w-0">
                  <div className="truncate font-medium text-stone-950">{site.name}</div>
                  <div className="truncate text-[12.5px] text-stone-600">
                    {site.base_url.replace(/^https?:\/\//, "")}
                  </div>
                </div>
              </div>
              <div className="text-stone-600">
                {site.platform === "wordpress" ? "WP REST API" : "Sitemap crawl"}
              </div>
              <div className="text-stone-600" title={site.created_at ?? undefined}>
                {timeAgo(site.created_at)}
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                <SiteStatusBadge status={site.last_ingestion_status} />
                {jobs
                  .filter((job) => job.siteId === site.id)
                  .map((job) => (
                    <JobStatusBadge key={job.jobId} jobId={job.jobId} label={job.label} />
                  ))}
              </div>
              <div className="flex items-center justify-end gap-1.5">
                <button
                  onClick={() => void run(site.id, "Crawl", ingestSite)}
                  disabled={busy[busyKey(site.id, "Crawl")]}
                  className="flex-none whitespace-nowrap rounded-full border border-stone-300 px-3 py-1.5 text-[13px] font-medium hover:border-stone-950 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy[busyKey(site.id, "Crawl")] ? "Queueing…" : "Crawl"}
                </button>
                <ActionMenu
                  label="Actions"
                  items={[
                    ...actions.map(([label, action]) => ({
                      label,
                      disabled: busy[busyKey(site.id, label)],
                      onSelect: () => void run(site.id, label, action),
                    })),
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

        <div className="mt-4 text-[13.5px] leading-relaxed text-stone-600">
          Connectors normalize every platform into the same{" "}
          <span className="rounded-full bg-chip px-2.5 py-0.5 text-[12.5px] text-stone-800">
            Article
          </span>{" "}
          object before baseline analysis. {RQ_SCHEDULING_COPY}
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

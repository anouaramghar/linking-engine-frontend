import { useState } from "react";

import PageHeader from "../components/PageHeader";
import AddSiteModal from "../components/sites/AddSiteModal";
import SiteStatusBadge from "../components/sites/SiteStatusBadge";
import JobStatusBadge from "../components/jobs/JobStatusBadge";
import { ingestSite, publishSite, fleetIngest, fleetAnalyze } from "../api/sites";
import { triggerAnalysis, triggerAnchors, triggerExternal } from "../api/suggestions";
import { useDeleteSite, useSites, useStats } from "../hooks/useSites";
import { ORBS, initials, timeAgo } from "../lib/utils";

const GRID = "grid grid-cols-[2fr_1.3fr_.7fr_.9fr_1fr_.9fr_1.4fr] items-center gap-3";

export default function SitesPage() {
  const { data: sites } = useSites();
  const { data: stats } = useStats();
  const deleteSite = useDeleteSite();
  const [showAdd, setShowAdd] = useState(false);
  const [jobs, setJobs] = useState<Record<number, string>>({}); // site id -> last job id

  const statFor = (id: number) => stats?.find((s) => s.site_id === id);
  const totalArticles = stats?.reduce((n, s) => n + s.articles, 0) ?? 0;

  const run = (siteId: number, fn: (id: number) => Promise<{ job_id: string }>) =>
    fn(siteId).then(({ job_id }) => setJobs((j) => ({ ...j, [siteId]: job_id })));

  const actions: [string, (id: number) => Promise<{ job_id: string }>][] = [
    ["Crawl", ingestSite],
    ["Suggest (baseline)", (id) => triggerAnalysis(id, "baseline_cosine")],
    ["Suggest (GNN)", (id) => triggerAnalysis(id, "gnn_graphsage")],
    ["External links", triggerExternal],
    ["Generate anchors", triggerAnchors],
    ["Publish approved", publishSite],
  ];

  return (
    <>
      <PageHeader
        title="Sites"
        sub={`${sites?.length ?? 0} connected sites · ${totalArticles.toLocaleString()} articles normalized via ContentConnector`}
      />
      <div className="relative overflow-y-auto px-8 py-6">
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            onClick={() => setShowAdd(true)}
            className="rounded-full border border-stone-800 bg-stone-800 px-4 py-2 text-sm font-medium text-white hover:bg-stone-950"
          >
            + Connect site
          </button>
          <div className="flex-1" />
          <button
            onClick={() => fleetIngest()}
            className="rounded-full border border-stone-300 px-4 py-2 text-sm font-medium hover:border-stone-950"
          >
            Crawl all
          </button>
          <button
            onClick={() => fleetAnalyze("baseline_cosine")}
            className="rounded-full border border-stone-300 px-4 py-2 text-sm font-medium hover:border-stone-950"
          >
            Analyze all
          </button>
        </div>

        <div className={`${GRID} px-5 pb-3 text-[11px] font-semibold uppercase tracking-widest text-stone-400`}>
          <div>Site</div>
          <div>Connector</div>
          <div>Articles</div>
          <div>Int. links</div>
          <div>Added</div>
          <div>Status</div>
          <div />
        </div>

        <div className="flex flex-col gap-2.5">
          {sites?.map((site, i) => {
            const st = statFor(site.id);
            return (
              <div
                key={site.id}
                className={`${GRID} rounded-2xl border border-stone-200 bg-white px-5 py-4 text-[14.5px] hover:shadow-[0_4px_16px_rgba(0,0,0,.04)]`}
              >
                <div className="flex items-center gap-3">
                  <span
                    className="flex h-8 w-8 flex-none items-center justify-center rounded-full text-[11px] font-semibold text-stone-800"
                    style={{
                      background: `radial-gradient(circle at 30% 30%, ${ORBS[i % ORBS.length]}, #f0efed)`,
                    }}
                  >
                    {initials(site.name)}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate font-medium text-stone-950">{site.name}</div>
                    <div className="truncate text-[12.5px] text-stone-400">
                      {site.base_url.replace(/^https?:\/\//, "")}
                    </div>
                  </div>
                </div>
                <div className="text-stone-600">
                  {site.platform === "wordpress" ? "WP REST API" : "Sitemap crawl"}
                </div>
                <div className="font-medium">{st?.articles.toLocaleString() ?? "—"}</div>
                <div className="font-medium">{st?.internal_links.toLocaleString() ?? "—"}</div>
                <div className="text-stone-500">{timeAgo(site.created_at)}</div>
                <div className="flex items-center gap-1.5">
                  <SiteStatusBadge status={site.last_ingestion_status} />
                  <JobStatusBadge jobId={jobs[site.id] ?? null} />
                </div>
                <div className="flex items-center justify-end gap-1.5">
                  <button
                    onClick={() => run(site.id, ingestSite)}
                    className="rounded-full border border-stone-300 px-3 py-1.5 text-[13px] font-medium hover:border-stone-950"
                  >
                    Crawl
                  </button>
                  <details className="relative">
                    <summary className="cursor-pointer list-none rounded-full border border-stone-300 px-3 py-1.5 text-[13px] font-medium hover:border-stone-950">
                      Actions ▾
                    </summary>
                    <div className="absolute right-0 z-10 mt-1 w-48 rounded-2xl border border-stone-200 bg-white py-1.5 shadow-[0_8px_24px_rgba(0,0,0,.08)]">
                      {actions.map(([label, fn]) => (
                        <button
                          key={label}
                          onClick={(e) => {
                            run(site.id, fn);
                            (e.currentTarget.closest("details") as HTMLDetailsElement).open = false;
                          }}
                          className="block w-full px-4 py-2 text-left text-[13px] hover:bg-chip"
                        >
                          {label}
                        </button>
                      ))}
                      <button
                        onClick={() => {
                          if (confirm(`Delete ${site.name} and all its data?`))
                            deleteSite.mutate(site.id);
                        }}
                        className="block w-full px-4 py-2 text-left text-[13px] text-red-600 hover:bg-chip"
                      >
                        Delete site
                      </button>
                    </div>
                  </details>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-4 text-[13.5px] leading-relaxed text-stone-500">
          Connectors normalize every platform into the same{" "}
          <span className="rounded-full bg-chip px-2.5 py-0.5 text-[12.5px] text-stone-800">
            Article
          </span>{" "}
          object before embedding. Re-crawl runs on the site's schedule via rq-scheduler.
        </div>
      </div>
      {showAdd && <AddSiteModal onClose={() => setShowAdd(false)} />}
    </>
  );
}

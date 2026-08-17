import { useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { getActiveJobs, getJob } from "../api/jobs";
import type { JobRun, JobStatusValue } from "../types/job";

const TERMINAL_STATUSES = new Set<JobStatusValue>([
  "succeeded",
  "finished",
  "failed",
  "stopped",
  "canceled",
  "cancelled",
]);

export const isTerminalJobStatus = (status?: JobStatusValue) =>
  status !== undefined && TERMINAL_STATUSES.has(status);

export const didActiveJobsFinish = (before: JobRun[], after: JobRun[]) => {
  const currentIds = new Set(after.map((job) => job.id));
  return before.some((job) => !currentIds.has(job.id));
};

const refreshJobOutputs = (qc: ReturnType<typeof useQueryClient>) => {
  void qc.invalidateQueries({ queryKey: ["suggestions"] });
  void qc.invalidateQueries({ queryKey: ["sites"] });
  void qc.invalidateQueries({ queryKey: ["publish", "pending"] });
};

/**
 * Poll a job until it settles, then refresh whatever it produced.
 *
 * The caller that started the job is the only one that knows what its worker
 * returns, so it may name that shape: `useJob<PublicationPreparation>(id)`.
 * Callers that only watch the status keep the untyped default.
 */
export const useJob = <TResult = Record<string, unknown>>(jobId: string | null) => {
  const qc = useQueryClient();
  return useQuery({
    queryKey: ["job", jobId],
    queryFn: async () => {
      const job = await getJob<TResult>(jobId!);
      if (isTerminalJobStatus(job.status)) refreshJobOutputs(qc);
      return job;
    },
    enabled: jobId !== null,
    refetchInterval: (query) => {
      const s = query.state.data?.status;
      return isTerminalJobStatus(s) ? false : 1500;
    },
  });
};

/** How often to look while something is running, and while nothing is. */
const ACTIVE_POLL_MS = 1500;
const IDLE_POLL_MS = 15_000;

/**
 * How often a crawl in flight refreshes the numbers it is changing.
 *
 * A crawl writes articles the whole time it runs, so a Sites page watching one
 * showed a stale article count until the job left the active feed — the lag
 * Amir reported on 2026-08-11. Refreshing on every 1.5s poll instead would
 * refetch a page of up to 250 sites forty times a minute, which is a heavier
 * price than the staleness it buys off.
 */
const RUNNING_CRAWL_REFRESH_MS = 10_000;

/**
 * What one poll of the active feed makes stale.
 *
 * `"outputs"` is a finished job: everything it could have produced. `"sites"`
 * is a crawl still running, which has only moved the counts on the site rows.
 */
export type ActiveJobsRefresh = "outputs" | "sites" | "none";

export const activeJobsRefresh = (
  before: JobRun[],
  after: JobRun[],
  sinceLastSiteRefreshMs: number,
): ActiveJobsRefresh => {
  if (didActiveJobsFinish(before, after)) return "outputs";
  const crawling = after.some((job) => job.kind === "ingestion");
  return crawling && sinceLastSiteRefreshMs >= RUNNING_CRAWL_REFRESH_MS ? "sites" : "none";
};

/** Restore scheduled/background jobs after refresh and keep their stage current. */
export const useActiveJobs = () => {
  const qc = useQueryClient();
  const previous = useRef<JobRun[]>([]);
  const lastSiteRefresh = useRef(0);

  return useQuery({
    queryKey: ["jobs", "active"],
    queryFn: async () => {
      const active = await getActiveJobs();
      const refresh = activeJobsRefresh(
        previous.current,
        active,
        Date.now() - lastSiteRefresh.current,
      );
      if (refresh === "outputs") refreshJobOutputs(qc);
      // Only the site rows: a crawl produces articles, not suggestions or
      // publication work, so nothing else has moved yet.
      else if (refresh === "sites") void qc.invalidateQueries({ queryKey: ["sites"] });
      if (refresh !== "none") lastSiteRefresh.current = Date.now();
      previous.current = active;
      return active;
    },
    // 1.5s is the cadence a running crawl's progress deserves; an idle fleet
    // does not, and the Sites page stays open for hours. Backing off turns a
    // permanent 40 req/min into 4 until there is something to watch. A job the
    // user just queued is already tracked by its own `useJob` poll, so nothing
    // waits on the idle interval to show progress.
    refetchInterval: (query) =>
      query.state.data?.length ? ACTIVE_POLL_MS : IDLE_POLL_MS,
  });
};

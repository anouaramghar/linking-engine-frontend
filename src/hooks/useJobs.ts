import { useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { getActiveJobs, getJob } from "../api/jobs";
import type { JobKind, JobRun, JobStatusValue } from "../types/job";

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

/** Everything a finished job could have produced. */
const JOB_OUTPUT_KEYS = [
  ["suggestions"],
  ["sites"],
  ["publish", "pending"],
] as const;

const refreshJobOutputs = (qc: ReturnType<typeof useQueryClient>) => {
  for (const queryKey of JOB_OUTPUT_KEYS) void qc.invalidateQueries({ queryKey });
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
 * How often a job in flight refreshes the numbers it is changing.
 *
 * A long job writes the whole time it runs, so a page watching one showed
 * stale numbers until the job left the active feed — the lag Amir reported on
 * 2026-08-11. Refreshing on every 1.5s poll instead would refetch a page of up
 * to 250 sites forty times a minute, which is a heavier price than the
 * staleness it buys off.
 */
const RUNNING_JOB_REFRESH_MS = 10_000;

/**
 * What each kind of job has already moved while it is still running.
 *
 * A crawl was the only kind that reported anything before it finished, so an
 * analysis — the longest of the four — left the pending count frozen for its
 * whole run and then made it jump. It commits suggestions after every source
 * article, so those rows are in the database the moment they are written and
 * there is nothing to wait for.
 *
 * The paginated queue is deliberately absent from `analysis`. It is the
 * expensive half of the `["suggestions"]` key space, and an editor reading a
 * card does not want the list re-sorted under them six times a minute. The
 * counts are the part they are watching, and they are one small aggregate.
 */
const RUNNING_JOB_TOUCHES: Record<JobKind, readonly (readonly string[])[]> = {
  ingestion: [["sites"]],
  analysis: [["sites"], ["suggestions", "counts"]],
  publication_preparation: [["publish", "pending"]],
  publication: [["sites"], ["suggestions", "counts"], ["publish", "pending"]],
};

/**
 * What one poll of the active feed makes stale, as key prefixes to invalidate.
 *
 * Empty means nothing has moved, or the throttle has not elapsed. A job that
 * has just left the feed answers with everything it could have produced,
 * whatever the throttle says — that answer arrives once.
 */
export const activeJobsRefresh = (
  before: JobRun[],
  after: JobRun[],
  sinceLastRefreshMs: number,
): readonly (readonly string[])[] => {
  if (didActiveJobsFinish(before, after)) return JOB_OUTPUT_KEYS;
  if (sinceLastRefreshMs < RUNNING_JOB_REFRESH_MS) return [];
  // Two running jobs often move the same rows. Deduplicated by the key itself,
  // so a fleet mid-crawl and mid-analysis pays for one refresh of the sites.
  const keys = new Map<string, readonly string[]>();
  for (const job of after) {
    for (const key of RUNNING_JOB_TOUCHES[job.kind] ?? []) keys.set(key.join(" "), key);
  }
  return [...keys.values()];
};

/** Restore scheduled/background jobs after refresh and keep their stage current. */
export const useActiveJobs = () => {
  const qc = useQueryClient();
  const previous = useRef<JobRun[]>([]);
  const lastRefresh = useRef(0);

  return useQuery({
    queryKey: ["jobs", "active"],
    queryFn: async () => {
      const active = await getActiveJobs();
      const stale = activeJobsRefresh(
        previous.current,
        active,
        Date.now() - lastRefresh.current,
      );
      for (const queryKey of stale) void qc.invalidateQueries({ queryKey });
      if (stale.length) lastRefresh.current = Date.now();
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

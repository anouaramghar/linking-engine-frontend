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
};

/** Poll a job until it settles, then refresh whatever it produced. */
export const useJob = (jobId: string | null) => {
  const qc = useQueryClient();
  return useQuery({
    queryKey: ["job", jobId],
    queryFn: async () => {
      const job = await getJob(jobId!);
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

/** Restore scheduled/background jobs after refresh and keep their stage current. */
export const useActiveJobs = () => {
  const qc = useQueryClient();
  const previous = useRef<JobRun[]>([]);

  return useQuery({
    queryKey: ["jobs", "active"],
    queryFn: async () => {
      const active = await getActiveJobs();
      if (didActiveJobsFinish(previous.current, active)) refreshJobOutputs(qc);
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

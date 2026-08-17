import { useEffect, useRef, useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  approvePublicationPlans,
  getPendingPublicationSite,
  listPendingPublication,
  preparePublicationPlans,
  queueApprovedPlans,
  type PublicationPreparation,
} from "../api/publish";
import { useJob, isTerminalJobStatus } from "./useJobs";

export const usePendingPublication = (enabled = true, search = "") => {
  const query = useInfiniteQuery({
    queryKey: ["publish", "pending", search.trim()],
    queryFn: ({ pageParam }) => listPendingPublication(pageParam, search),
    enabled,
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (page) => page.next_cursor ?? undefined,
  });
  const first = query.data?.pages[0];
  return {
    ...query,
    data: query.data?.pages.flatMap((page) => page.items),
    totalSites: first?.total_sites ?? 0,
    totalSelectedSuggestions: first?.total_selected_suggestions ?? 0,
    totalApprovedPlans: first?.total_approved_plans ?? 0,
  };
};

export const usePendingPublicationSite = (siteId: number | null) =>
  useQuery({
    queryKey: ["publish", "pending", "site", siteId],
    queryFn: () => getPendingPublicationSite(siteId as number),
    enabled: siteId !== null,
  });

/**
 * Read the live articles and store the exact edits, only when the operator asks.
 * A mutation prevents focus/remount refetches from repeating live requests or
 * paid placement work. Retry remains an explicit button click.
 */
interface PrepareCallbacks {
  onQueued?: (jobId: string) => void;
  onSuccess?: (preparation: PublicationPreparation) => void;
  onError?: (error: Error) => void;
}

export const usePreparePublicationPlans = (initialJobId: string | null = null) => {
  const [jobId, setJobId] = useState<string | null>(initialJobId);
  const callbacks = useRef<PrepareCallbacks | undefined>(undefined);
  const delivered = useRef<string | null>(null);
  const job = useJob(jobId);
  const enqueue = useMutation({
    mutationFn: (siteId: number) => preparePublicationPlans(siteId),
  });

  useEffect(() => {
    if (!jobId || !job.data || !isTerminalJobStatus(job.data.status)) return;
    if (delivered.current === jobId) return;
    delivered.current = jobId;
    if (job.data.status === "succeeded" && job.data.result) {
      const preparation = job.data.result as unknown as PublicationPreparation;
      callbacks.current?.onSuccess?.(preparation);
      return;
    }
    const error = new Error(job.data.error ?? "The exact edits could not be prepared.");
    callbacks.current?.onError?.(error);
  }, [job.data, jobId]);

  const mutate = (siteId: number, options: PrepareCallbacks = {}) => {
    callbacks.current = options;
    delivered.current = null;
    setJobId(null);
    enqueue.reset();
    enqueue.mutate(siteId, {
      onSuccess: (accepted) => {
        setJobId(accepted.job_id);
        options.onQueued?.(accepted.job_id);
      },
      onError: (error) => {
        options.onError?.(error);
      },
    });
  };

  const reset = () => {
    enqueue.reset();
    delivered.current = null;
    setJobId(null);
  };

  const succeeded = job.data?.status === "succeeded" && job.data.result;
  const data = succeeded
    ? (job.data?.result as unknown as PublicationPreparation)
    : undefined;
  const terminalError =
    job.data && isTerminalJobStatus(job.data.status) && job.data.status !== "succeeded"
      ? new Error(job.data.error ?? "The exact edits could not be prepared.")
      : undefined;

  return {
    mutate,
    reset,
    data,
    jobId,
    progress: job.data?.progress,
    isPending:
      enqueue.isPending || Boolean(jobId && !isTerminalJobStatus(job.data?.status)),
    isError: enqueue.isError || job.isError || Boolean(terminalError),
    error: enqueue.error ?? job.error ?? terminalError,
  };
};

/**
 * Approve exactly the plans on screen, named by id *and* hash.
 *
 * Deliberately separate from queueing. Approval is the human decision and must
 * be recorded before any job exists; queueing is a retryable no-decision step.
 * Fusing them would mean a failed enqueue looked like a failed approval, and
 * the operator would be asked to agree to the same edits twice.
 */
export const useApprovePlans = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      siteId,
      plans,
    }: {
      siteId: number;
      plans: { id: number; plan_hash: string }[];
    }) => approvePublicationPlans(siteId, plans),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["suggestions"] });
      qc.invalidateQueries({ queryKey: ["publish", "pending"] });
    },
  });
};

/** Start the job for a site's already-approved plans. Decides nothing. */
export const useQueueApprovedPlans = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ siteId, planIds }: { siteId: number; planIds?: number[] }) =>
      queueApprovedPlans(siteId, planIds),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["suggestions"] });
      qc.invalidateQueries({ queryKey: ["publish", "pending"] });
      qc.invalidateQueries({ queryKey: ["sites"] });
      qc.invalidateQueries({ queryKey: ["jobs"] });
    },
  });
};

import { useEffect, useRef, useState } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryKey,
} from "@tanstack/react-query";

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
 * The work is started by an explicit call, never by a query, so focus and
 * remount refetches cannot repeat live requests or paid placement work. Retry
 * remains an explicit button click.
 */
interface PrepareCallbacks {
  onQueued?: (jobId: string) => void;
  onSuccess?: (preparation: PublicationPreparation) => void;
  onError?: (error: Error) => void;
}

export const usePreparePublicationPlans = (
  initialJobId: string | null = null,
  scopeKey: string | null = null,
) => {
  const qc = useQueryClient();
  const [jobId, setJobId] = useState<string | null>(initialJobId);
  const callbacks = useRef<PrepareCallbacks | undefined>(undefined);
  const delivered = useRef<string | null>(null);
  const lastRequestKey = useRef<QueryKey | null>(null);
  /**
   * The enqueue is imperative rather than `useMutation`: it can start from
   * the page's guarded arrival effect, and the QueryClient cache keeps the
   * accepted job available when that page remounts. A mutation observer that
   * loses its last listener can lose the result; this request cache cannot.
   */
  const [enqueue, setEnqueue] = useState<{ pending: boolean; error: Error | null }>({
    pending: false,
    error: null,
  });
  /** Which enqueue owns the state: a reset or a newer attempt retires the last. */
  const attempt = useRef(0);
  // The job this hook starts is the publication-preparation worker, whose
  // result the backend now builds from a named Pydantic model. Naming the same
  // shape here is what replaced two `as unknown as` casts: a contract change
  // fails to compile instead of failing in front of an operator.
  const job = useJob<PublicationPreparation>(jobId);

  useEffect(() => {
    // The job id is route state; navigation must replace the hook's local poll.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setJobId(initialJobId);
    delivered.current = null;
  }, [initialJobId, scopeKey]);

  useEffect(() => {
    if (!jobId || delivered.current === jobId) return;
    if (job.isError) {
      delivered.current = jobId;
      callbacks.current?.onError?.(
        job.error instanceof Error ? job.error : new Error("The preparation status could not be read."),
      );
      return;
    }
    if (!job.data || !isTerminalJobStatus(job.data.status)) return;
    delivered.current = jobId;
    if (job.data.status === "succeeded" && job.data.result) {
      callbacks.current?.onSuccess?.(job.data.result);
      return;
    }
    const error = new Error(job.data.error ?? "The exact edits could not be prepared.");
    callbacks.current?.onError?.(error);
  }, [job.data, job.error, job.isError, jobId]);

  /**
   * `suggestionIds` narrows the batch to those links, for a review that opened
   * one row rather than a site. The engine renders the artifact, so the scope
   * has to travel with the request: an artifact covering three links cannot be
   * narrowed to one after the fact, whatever the screen shows.
   */
  const mutate = (
    siteId: number,
    options: PrepareCallbacks & { suggestionIds?: number[] } = {},
  ) => {
    const requestKey = [
      "publish",
      "preparation",
      "enqueue",
      scopeKey ?? `${siteId}:${options.suggestionIds?.join(",") ?? "all"}`,
    ] as const;
    lastRequestKey.current = requestKey;
    callbacks.current = options;
    delivered.current = null;
    const ticket = ++attempt.current;
    setJobId(null);
    setEnqueue({ pending: true, error: null });
    // QueryClient.fetchQuery deduplicates the POST across component remounts
    // and keeps the accepted job id for the rest of this browser session. The
    // page may still call this from its guarded arrival effect, but a refetch
    // or remount cannot spend another live preparation request. Explicit reset
    // removes this cache entry before a deliberate retry or changed scope.
    void qc
      .fetchQuery({
        queryKey: requestKey,
        queryFn: () => preparePublicationPlans(siteId, undefined, options.suggestionIds),
        staleTime: Infinity,
        retry: false,
      })
      .then(
        (accepted) => {
          if (ticket !== attempt.current) return;
          setEnqueue({ pending: false, error: null });
          setJobId(accepted.job_id);
          options.onQueued?.(accepted.job_id);
        },
        (failure: unknown) => {
          if (ticket !== attempt.current) return;
          const error =
            failure instanceof Error
              ? failure
              : new Error("The exact edits could not be prepared.");
          setEnqueue({ pending: false, error });
          options.onError?.(error);
        },
      );
  };

  const reset = () => {
    attempt.current += 1;
    if (lastRequestKey.current) {
      qc.removeQueries({ queryKey: lastRequestKey.current, exact: true });
      lastRequestKey.current = null;
    }
    setEnqueue({ pending: false, error: null });
    delivered.current = null;
    setJobId(null);
  };

  const data =
    job.data?.status === "succeeded" ? (job.data.result ?? undefined) : undefined;
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
      enqueue.pending ||
      Boolean(jobId && !job.isError && !isTerminalJobStatus(job.data?.status)),
    isError: enqueue.error !== null || job.isError || Boolean(terminalError),
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

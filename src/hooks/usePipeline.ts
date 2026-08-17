import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  cancelPipelineBatch,
  createPipelineBatch,
  getPipelineBatch,
  retryPipelineSite,
  streamPipelineBatch,
} from "../api/pipelines";
import type { PipelineBatchStatus } from "../types/pipeline";

const TERMINAL_BATCH_STATUSES = new Set<PipelineBatchStatus>([
  "succeeded",
  "failed",
  "partial_failed",
  "cancelled",
]);

export const isTerminalBatchStatus = (status?: PipelineBatchStatus) =>
  status !== undefined && TERMINAL_BATCH_STATUSES.has(status);

export const usePipelineBatch = (batchId: number | null) => {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["pipeline-batch", batchId],
    queryFn: async () => {
      const batch = await getPipelineBatch(batchId!);
      if (isTerminalBatchStatus(batch.status)) {
        void queryClient.invalidateQueries({ queryKey: ["sites"] });
        void queryClient.invalidateQueries({ queryKey: ["suggestions"] });
        void queryClient.invalidateQueries({ queryKey: ["jobs", "active"] });
      }
      return batch;
    },
    enabled: batchId !== null,
    // SSE is primary; this slower poll is the fallback for proxies that buffer
    // or interrupt streams.
    refetchInterval: (query) =>
      isTerminalBatchStatus(query.state.data?.status) ? false : 15_000,
  });
  useEffect(() => {
    if (batchId === null || isTerminalBatchStatus(query.data?.status)) return;
    const controller = new AbortController();
    void streamPipelineBatch(batchId, controller.signal, (batch) => {
      queryClient.setQueryData(["pipeline-batch", batchId], batch);
      if (isTerminalBatchStatus(batch.status)) {
        void queryClient.invalidateQueries({ queryKey: ["sites"] });
        void queryClient.invalidateQueries({ queryKey: ["suggestions"] });
      }
    }).catch(() => {
      // The REST query remains active as a fallback; a transient stream error
      // must not turn a healthy batch into a page-level failure.
    });
    return () => controller.abort();
  }, [batchId, query.data?.status, queryClient]);
  return query;
};

export const useCreatePipelineBatch = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createPipelineBatch,
    // Returned, not fired and forgotten: `mutateAsync` waits on this, so the
    // caller's pending state covers the window where the batch exists but the
    // job list has not caught up and would still report the sites as idle.
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ["jobs", "active"] }),
        queryClient.invalidateQueries({ queryKey: ["sites"] }),
      ]),
  });
};

export const useRetryPipelineSite = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ batchId, siteId }: { batchId: number; siteId: number }) =>
      retryPipelineSite(batchId, siteId),
    onSuccess: (batch) => {
      queryClient.setQueryData(["pipeline-batch", batch.id], batch);
      void queryClient.invalidateQueries({ queryKey: ["jobs", "active"] });
      void queryClient.invalidateQueries({ queryKey: ["sites"] });
    },
  });
};

export const useCancelPipelineBatch = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: cancelPipelineBatch,
    onSuccess: (batch) =>
      queryClient.setQueryData(["pipeline-batch", batch.id], batch),
  });
};

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

export const useCreatePipelineBatch = () =>
  useMutation({ mutationFn: createPipelineBatch });

export const useRetryPipelineSite = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ batchId, siteId }: { batchId: number; siteId: number }) =>
      retryPipelineSite(batchId, siteId),
    onSuccess: (batch) =>
      queryClient.setQueryData(["pipeline-batch", batch.id], batch),
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

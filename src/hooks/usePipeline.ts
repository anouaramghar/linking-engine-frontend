import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  createPipelineBatch,
  getPipelineBatch,
  retryPipelineSite,
} from "../api/pipelines";
import type { PipelineBatchStatus } from "../types/pipeline";

const TERMINAL_BATCH_STATUSES = new Set<PipelineBatchStatus>([
  "succeeded",
  "failed",
  "partial_failed",
]);

export const isTerminalBatchStatus = (status?: PipelineBatchStatus) =>
  status !== undefined && TERMINAL_BATCH_STATUSES.has(status);

export const usePipelineBatch = (batchId: number | null) => {
  const queryClient = useQueryClient();
  return useQuery({
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
    refetchInterval: (query) =>
      isTerminalBatchStatus(query.state.data?.status) ? false : 3000,
  });
};

export const useCreatePipelineBatch = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createPipelineBatch,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["jobs", "active"] });
      void queryClient.invalidateQueries({ queryKey: ["sites"] });
    },
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

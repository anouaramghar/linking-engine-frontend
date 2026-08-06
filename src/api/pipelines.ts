import { api } from "./client";
import type { PipelineBatch } from "../types/pipeline";

/** Mirrors PipelineBatchCreate.site_ids max_length in the engine schema. */
export const MAX_PIPELINE_BATCH_SITES = 100;

export const createPipelineBatch = (siteIds: number[]) =>
  api
    .post<PipelineBatch>("/pipelines/batches", { site_ids: siteIds })
    .then((response) => response.data);

export const getPipelineBatch = (batchId: number) =>
  api
    .get<PipelineBatch>(`/pipelines/batches/${batchId}`)
    .then((response) => response.data);

export const retryPipelineSite = (batchId: number, siteId: number) =>
  api
    .post<PipelineBatch>(`/pipelines/batches/${batchId}/sites/${siteId}/retry`)
    .then((response) => response.data);

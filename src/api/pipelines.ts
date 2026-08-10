import { api } from "./client";
import type { PipelineBatch } from "../types/pipeline";

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

export const cancelPipelineBatch = (batchId: number) =>
  api
    .post<PipelineBatch>(`/pipelines/batches/${batchId}/cancel`)
    .then((response) => response.data);

/** Stream live batch snapshots through the same reverse proxy as the REST API. */
export const streamPipelineBatch = async (
  batchId: number,
  signal: AbortSignal,
  onBatch: (batch: PipelineBatch) => void,
) => {
  const base = String(api.defaults.baseURL ?? "/api/v1").replace(/\/$/, "");
  const response = await fetch(`${base}/pipelines/batches/${batchId}/events`, {
    headers: { Accept: "text/event-stream" },
    signal,
  });
  if (!response.ok || !response.body) {
    throw new Error(`Batch stream failed with HTTP ${response.status}.`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) return;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    frames.forEach((frame) => {
      const event = frame.split("\n").find((line) => line.startsWith("event:"))?.slice(6).trim();
      const data = frame.split("\n").find((line) => line.startsWith("data:"))?.slice(5).trim();
      if (event === "batch" && data) onBatch(JSON.parse(data) as PipelineBatch);
    });
  }
};

export type PipelineBatchStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "partial_failed"
  | "cancelled";

export type PipelineSiteStatus =
  | "queued"
  | "ingestion_running"
  | "analysis_queued"
  | "analysis_running"
  | "succeeded"
  | "failed"
  | "cancelled";

export interface PipelineSiteRun {
  id: number;
  site_id: number;
  status: PipelineSiteStatus;
  stage: "ingestion" | "analysis" | "completed";
  ingestion_job_run_id: number | null;
  analysis_job_run_id: number | null;
  retry_count: number;
  error: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface PipelineBatch {
  id: number;
  status: PipelineBatchStatus;
  total: number;
  active: number;
  succeeded: number;
  failed: number;
  cancelled: number;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  sites: PipelineSiteRun[];
}

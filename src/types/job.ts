export type JobKind = "ingestion" | "analysis" | "publication";

export type JobStatusValue =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  // Accepted temporarily so the UI remains correct during rolling deploys.
  | "started"
  | "finished"
  | "deferred"
  | "scheduled"
  | "stopped"
  | "canceled"
  | "cancelled";

export interface JobProgress {
  stage?: string;
  [key: string]: unknown;
}

export interface JobAccepted {
  job_id: string;
  job_run_id?: number | null;
}

export interface JobStatus {
  job_id: string;
  status: JobStatusValue;
  result: Record<string, unknown> | null;
  progress: JobProgress | null;
  progress_at: string | null;
  error: string | null;
}

export interface JobRun {
  id: number;
  site_id: number;
  kind: JobKind;
  status: JobStatusValue;
  queue_job_id: string | null;
  attempts: number;
  result: Record<string, unknown> | null;
  progress: JobProgress | null;
  progress_at: string | null;
  error: string | null;
  enqueued_at: string;
  started_at: string | null;
  finished_at: string | null;
}

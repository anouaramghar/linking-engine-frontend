export type JobKind =
  | "ingestion"
  | "analysis"
  | "publication_preparation"
  | "publication";

export type JobStatusValue =
  | "queued"
  | "running"
  | "cancel_requested"
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

/**
 * One polled job.
 *
 * `result` is whatever the worker that produced this job stores, so the caller
 * that knows which job it started is the one that can name the shape. The
 * default keeps every caller that does not care compiling unchanged, and it is
 * deliberately not a registry of job kinds: the endpoint stays general, and only
 * the consumer narrows it.
 */
export interface JobStatus<TResult = Record<string, unknown>> {
  job_id: string;
  status: JobStatusValue;
  result: TResult | null;
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
  requested_by?: string | null;
  attempts: number;
  result: Record<string, unknown> | null;
  progress: JobProgress | null;
  progress_at: string | null;
  error: string | null;
  enqueued_at: string;
  started_at: string | null;
  finished_at: string | null;
}

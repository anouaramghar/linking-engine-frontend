export interface JobAccepted {
  job_id: string;
}

export interface JobStatus {
  job_id: string;
  status: string; // queued | started | finished | failed
  result: Record<string, unknown> | null;
  error: string | null;
}

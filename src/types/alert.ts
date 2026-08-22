import type { JobKind } from "./job";

export type AlertOutcome = "succeeded" | "partial" | "failed";

export interface AlertPayload {
  site_id?: number | null;
  kind?: JobKind | string;
  job_run_id?: number | null;
  outcome?: AlertOutcome;
  [key: string]: unknown;
}

export interface AppAlert {
  id: number;
  site_id: number | null;
  site_name: string | null;
  kind: string;
  subject: string;
  payload: AlertPayload;
  occurrences: number;
  created_at: string;
  last_seen_at: string;
  acknowledged_at: string | null;
}

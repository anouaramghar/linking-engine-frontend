import { describe, expect, it } from "vitest";

import { didActiveJobsFinish, isTerminalJobStatus } from "./useJobs";
import type { JobRun } from "../types/job";

const job = (id: number): JobRun => ({
  id,
  site_id: 1,
  kind: "ingestion",
  status: "running",
  queue_job_id: `rq-${id}`,
  attempts: 1,
  result: null,
  progress: null,
  progress_at: null,
  error: null,
  enqueued_at: "2026-07-28T08:00:00Z",
  started_at: null,
  finished_at: null,
});

describe("job polling helpers", () => {
  it("recognizes normalized and legacy terminal statuses", () => {
    expect(isTerminalJobStatus("succeeded")).toBe(true);
    expect(isTerminalJobStatus("finished")).toBe(true);
    expect(isTerminalJobStatus("stopped")).toBe(true);
    expect(isTerminalJobStatus("running")).toBe(false);
  });

  it("detects when durable active work leaves the feed", () => {
    expect(didActiveJobsFinish([job(1), job(2)], [job(2)])).toBe(true);
    expect(didActiveJobsFinish([job(2)], [job(2), job(3)])).toBe(false);
  });
});

import { describe, expect, it } from "vitest";

import { activeJobsRefresh, didActiveJobsFinish, isTerminalJobStatus } from "./useJobs";
import type { JobRun } from "../types/job";

const job = (id: number, kind: JobRun["kind"] = "ingestion"): JobRun => ({
  id,
  site_id: 1,
  kind,
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

/**
 * A crawl writes articles the whole time it runs, so the numbers it changes
 * cannot wait for it to finish — but refreshing a page of up to 250 sites on
 * every 1.5s poll would cost more than the staleness it buys off.
 */
describe("what one poll of the active feed makes stale", () => {
  it("refreshes everything a finished job could have produced", () => {
    expect(activeJobsRefresh([job(1)], [], 0)).toBe("outputs");
  });

  it("refreshes the site rows while a crawl is still running", () => {
    expect(activeJobsRefresh([job(1)], [job(1)], 10_000)).toBe("sites");
  });

  it("does not refresh them on every poll", () => {
    expect(activeJobsRefresh([job(1)], [job(1)], 1_500)).toBe("none");
  });

  it("leaves the site rows alone when the running work is not a crawl", () => {
    const analysis = job(2, "analysis");
    expect(activeJobsRefresh([analysis], [analysis], 60_000)).toBe("none");
  });
});

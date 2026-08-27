import { createElement, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  activeJobsRefresh,
  didActiveJobsFinish,
  isTerminalJobStatus,
  useActiveJobs,
} from "./useJobs";
import type { JobRun } from "../types/job";

const mocks = vi.hoisted(() => ({ getActiveJobs: vi.fn() }));

vi.mock("../api/jobs", () => ({
  getActiveJobs: mocks.getActiveJobs,
  getJob: vi.fn(),
}));

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
 * A long job writes the whole time it runs, so the numbers it changes cannot
 * wait for it to finish — but refreshing a page of up to 250 sites on every
 * 1.5s poll would cost more than the staleness it buys off.
 */
describe("what one poll of the active feed makes stale", () => {
  it("refreshes everything a finished job could have produced", () => {
    expect(activeJobsRefresh([job(1)], [], 0)).toEqual([
      ["suggestions"],
      ["sites"],
      ["publish", "pending"],
    ]);
  });

  it("refreshes the site rows while a crawl is still running", () => {
    expect(activeJobsRefresh([job(1)], [job(1)], 10_000)).toEqual([["sites"]]);
  });

  it("does not refresh them on every poll", () => {
    expect(activeJobsRefresh([job(1)], [job(1)], 1_500)).toEqual([]);
  });

  /**
   * The lag behind the frozen pending badge: an analysis commits suggestions
   * after every source article, but only a crawl used to report anything
   * before it finished.
   */
  it("refreshes the counts while an analysis is still running", () => {
    const analysis = job(2, "analysis");
    expect(activeJobsRefresh([analysis], [analysis], 10_000)).toEqual([
      ["sites"],
      ["suggestions", "counts"],
    ]);
  });

  it("leaves the paginated queue alone while an analysis runs", () => {
    const analysis = job(2, "analysis");
    // The rows an editor is reading must not re-sort under them six times a
    // minute; only the number they are watching moves.
    expect(activeJobsRefresh([analysis], [analysis], 60_000)).not.toContainEqual(["suggestions"]);
  });

  it("refreshes the publication inbox while a preparation runs", () => {
    const preparing = job(3, "publication_preparation");
    expect(activeJobsRefresh([preparing], [preparing], 10_000)).toEqual([["publish", "pending"]]);
  });

  it("asks for one refresh of the rows two running jobs share", () => {
    const crawl = job(1, "ingestion");
    const analysis = job(2, "analysis");
    expect(activeJobsRefresh([crawl, analysis], [crawl, analysis], 10_000)).toEqual([
      ["sites"],
      ["suggestions", "counts"],
    ]);
  });

  it("holds every running kind to the same throttle", () => {
    const analysis = job(2, "analysis");
    expect(activeJobsRefresh([analysis], [analysis], 1_500)).toEqual([]);
  });
});

/**
 * The wiring, not the policy: the feed has to actually invalidate what the
 * policy names. The pending badge stayed frozen through a whole analysis
 * because this loop only ever knew how to refresh site rows.
 */
describe("the active feed acting on what it found", () => {
  it("marks the suggestion counts stale while an analysis runs", async () => {
    mocks.getActiveJobs.mockResolvedValue([job(2, "analysis")]);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidate = vi.spyOn(client, "invalidateQueries");

    renderHook(() => useActiveJobs(), {
      wrapper: ({ children }: { children: ReactNode }) =>
        createElement(QueryClientProvider, { client }, children),
    });

    await waitFor(() => expect(mocks.getActiveJobs).toHaveBeenCalled());
    await waitFor(() => {
      const keys = invalidate.mock.calls.map(([options]) => options?.queryKey);
      expect(keys).toContainEqual(["suggestions", "counts"]);
    });
  });

  /**
   * The rail, the Sites page and the content pool all mount this hook, but
   * React Query runs one `queryFn` per fetch. While each copy kept its own
   * history in a ref, a page mounting mid-job owned that fetch with an empty
   * one — `didActiveJobsFinish` saw nothing leave, and the sweep that follows a
   * finished job was lost. The history lives in the cache now, which is the
   * one thing all three copies already share.
   */
  it("sees a job finish through a copy of the hook that never saw it start", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(QueryClientProvider, { client }, children);

    // The rail has been watching a crawl for a while.
    mocks.getActiveJobs.mockResolvedValue([job(1)]);
    const rail = renderHook(() => useActiveJobs(), { wrapper });
    await waitFor(() => expect(rail.result.current.data).toEqual([job(1)]));

    // A second page mounts, and the crawl finishes on the fetch it owns.
    mocks.getActiveJobs.mockResolvedValue([]);
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const page = renderHook(() => useActiveJobs(), { wrapper });
    await waitFor(() => expect(page.result.current.data).toEqual([]));

    await waitFor(() => {
      const keys = invalidate.mock.calls.map(([options]) => options?.queryKey);
      // The full sweep, not just what a running crawl moves.
      expect(keys).toContainEqual(["suggestions"]);
      expect(keys).toContainEqual(["publish", "pending"]);
    });
  });
});

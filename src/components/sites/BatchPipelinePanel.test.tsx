import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";

import BatchPipelinePanel from "./BatchPipelinePanel";
import type { PipelineBatch } from "../../types/pipeline";
import type { Site } from "../../types/site";

afterEach(cleanup);

const sites = [
  { id: 4, name: "Nona" },
  { id: 5, name: "Shawn" },
] as Site[];

const batch: PipelineBatch = {
  id: 2,
  status: "partial_failed",
  total: 2,
  active: 0,
  succeeded: 1,
  failed: 1,
  cancelled: 0,
  created_at: "2026-08-04T08:00:00Z",
  started_at: "2026-08-04T08:00:01Z",
  finished_at: "2026-08-04T08:01:00Z",
  sites: [
    {
      id: 20,
      site_id: 4,
      status: "succeeded",
      stage: "completed",
      ingestion_job_run_id: 31,
      analysis_job_run_id: 32,
      retry_count: 0,
      error: null,
      created_at: "2026-08-04T08:00:00Z",
      started_at: "2026-08-04T08:00:01Z",
      finished_at: "2026-08-04T08:00:30Z",
    },
    {
      id: 21,
      site_id: 5,
      status: "failed",
      stage: "analysis",
      ingestion_job_run_id: 33,
      analysis_job_run_id: 34,
      retry_count: 1,
      error: "analysis unavailable",
      created_at: "2026-08-04T08:00:00Z",
      started_at: "2026-08-04T08:00:01Z",
      finished_at: "2026-08-04T08:01:00Z",
    },
  ],
};

it("shows progress, errors, retry, and the filtered suggestions link", () => {
  const retry = vi.fn();
  render(
    <MemoryRouter>
      <BatchPipelinePanel
        batch={batch}
        sites={sites}
        retryingSiteId={null}
        onRetry={retry}
        cancelling={false}
        onCancel={vi.fn()}
      />
    </MemoryRouter>,
  );

  expect(screen.getByText("Completed with failures")).not.toBeNull();
  expect(screen.getByText("2/2 finished · 1 succeeded · 1 failed")).not.toBeNull();
  expect(screen.getByText("analysis unavailable")).not.toBeNull();
  expect(screen.getByRole("link", { name: "View suggestions" }).getAttribute("href")).toBe(
    "/queue?site=4",
  );
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(retry).toHaveBeenCalledWith(5);
});

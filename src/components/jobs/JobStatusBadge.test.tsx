import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { jobStatusLabel } from "../../lib/jobStatus";
import JobStatusBadge from "./JobStatusBadge";

vi.mock("../../hooks/useJobs", () => ({
  useJob: () => ({ data: undefined }),
}));

afterEach(cleanup);

describe("JobStatusBadge", () => {
  it("turns durable crawl progress into one compact thinking status", () => {
    const { container } = render(
      <JobStatusBadge
        jobId={null}
        kind="ingestion"
        snapshot={{
          status: "running",
          progress: { stage: "resolving_links" },
          error: null,
        }}
      />,
    );

    expect(screen.getByRole("status", { name: "Resolving links" })).not.toBeNull();
    expect(container.querySelectorAll(".logo-loading-anim")).toHaveLength(1);
    expect(container.querySelectorAll(".dot")).toHaveLength(0);
  });

  it("uses a static semantic dot for terminal work", () => {
    const { container } = render(
      <JobStatusBadge
        jobId={null}
        kind="analysis"
        snapshot={{ status: "failed", progress: null, error: "worker stopped" }}
      />,
    );

    // The reason rides in the accessible name as well as the tooltip: a
    // failure only a mouse can read is one half the operators never see.
    expect(
      screen.getByRole("status", { name: "Analysis failed. worker stopped" }),
    ).not.toBeNull();
    expect(container.querySelector(".dot.bg-error")).not.toBeNull();
    expect(container.querySelectorAll(".logo-loading-anim")).toHaveLength(0);
  });

  it("keeps legacy RQ states understandable during a rolling deploy", () => {
    expect(jobStatusLabel("ingestion", "started", null)).toBe("Crawling");
    expect(jobStatusLabel("ingestion", "finished", null)).toBe("Indexed");
    expect(jobStatusLabel("publication", "stopped", null)).toBe("Cancelled");
    expect(jobStatusLabel("analysis", "cancel_requested", null)).toBe("Stopping…");
    expect(jobStatusLabel("analysis", "cancelled", null)).toBe("Cancelled");
  });
});

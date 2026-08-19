import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import type { JobRun } from "../../types/job";
import type { Site } from "../../types/site";
import ActivityPanel from "./ActivityPanel";
import { activityDestination, progressMetric, progressSummary } from "./activity";

const site: Site = {
  id: 3,
  name: "Alpha site",
  base_url: "https://alpha.example",
  platform: "wordpress",
  crawl_frequency: "manual",
  suggestion_slots_available: 10,
  created_at: "2026-08-01T10:00:00Z",
  last_ingestion_status: null,
};

const job = (overrides: Partial<JobRun> = {}): JobRun => ({
  id: 7,
  site_id: site.id,
  kind: "ingestion",
  status: "running",
  queue_job_id: "rq-7",
  requested_by: "amir",
  attempts: 1,
  result: null,
  progress: { stage: "resolving_links", articles: 12 },
  progress_at: "2026-08-19T10:01:00Z",
  error: null,
  enqueued_at: "2026-08-19T10:00:00Z",
  started_at: "2026-08-19T10:00:30Z",
  finished_at: null,
  ...overrides,
});

const LocationProbe = () => {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
};

const renderPanel = (overrides: Partial<ComponentProps<typeof ActivityPanel>> = {}) =>
  render(
    <MemoryRouter initialEntries={["/queue"]}>
      <ActivityPanel
        collapsed={false}
        jobs={[job()]}
        sites={[site]}
        isPending={false}
        isError={false}
        {...overrides}
      />
    </MemoryRouter>,
  );

afterEach(cleanup);

describe("ActivityPanel", () => {
  it("shows the active count and current job stage when opened", async () => {
    const user = userEvent.setup();
    renderPanel();

    expect(screen.getByRole("button", { name: "Activity, 1 active background task" })).toBeTruthy();
    expect(screen.queryByRole("complementary", { name: "Running background tasks" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Activity, 1 active background task" }));

    expect(screen.getByRole("complementary", { name: "Running background tasks" })).toBeTruthy();
    expect(screen.getByText("Alpha site")).toBeTruthy();
    expect(screen.getByText("Resolving links")).toBeTruthy();
    expect(screen.getByText("12 articles")).toBeTruthy();
  });

  it("turns truthful totals into an accessible progress meter", async () => {
    const user = userEvent.setup();
    renderPanel({
      jobs: [
        job({
          kind: "publication",
          progress: { stage: "publishing", applied: 2, total: 5 },
        }),
      ],
    });

    await user.click(screen.getByRole("button", { name: "Activity, 1 active background task" }));

    const meter = screen.getByRole("progressbar", { name: "Publication progress" });
    expect(meter.getAttribute("aria-valuenow")).toBe("2");
    expect(meter.getAttribute("aria-valuemax")).toBe("5");
    expect(screen.getByRole("group", { name: "Publication progress" })).toBeTruthy();
  });

  it("navigates to the related workspace and closes after opening a job", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/queue"]}>
        <LocationProbe />
        <ActivityPanel
          collapsed={false}
          jobs={[job()]}
          sites={[site]}
          isPending={false}
          isError={false}
        />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("button", { name: "Activity, 1 active background task" }));
    await user.click(
      screen.getByRole("button", {
        name: "Open Alpha site crawl activity: Resolving links, 12 articles",
      }),
    );

    await waitFor(() => expect(screen.getByTestId("location").textContent).toBe("/sites"));
    expect(screen.queryByRole("complementary", { name: "Running background tasks" })).toBeNull();
  });

  it("explains loading, failure, and empty states", async () => {
    const user = userEvent.setup();
    const { unmount } = renderPanel({ isPending: true, jobs: [] });

    await user.click(screen.getByRole("button", { name: "Activity" }));
    expect(screen.getByText("Checking active tasks")).toBeTruthy();
    unmount();

    renderPanel({ isError: true, jobs: [] });
    await user.click(screen.getByRole("button", { name: "Activity" }));
    const panel = screen.getByRole("complementary", { name: "Running background tasks" });
    expect(within(panel).getByText("Activity unavailable")).toBeTruthy();
    expect(within(panel).getByText("Could not load activity")).toBeTruthy();
    expect(within(panel).getByText(/keeps trying/)).toBeTruthy();
    cleanup();

    renderPanel({ jobs: [] });
    await user.click(screen.getByRole("button", { name: "Activity" }));
    expect(screen.getByText("No active background tasks")).toBeTruthy();
  });

  it("keeps progress formatting and destinations specific to the job", () => {
    expect(progressSummary({ stage: "publishing", applied: 2, total: 5 })).toBe("2 / 5");
    expect(progressMetric({ stage: "publishing", applied: 2, total: 5 })).toEqual({
      current: 2,
      total: 5,
      percent: 40,
    });
    expect(progressSummary({ stage: "crawling", articles: 42 })).toBe("42 articles");
    expect(progressSummary({ stage: "crawling" })).toBeNull();
    expect(activityDestination(job({ kind: "publication" }), site)).toBe("/publish/3");
    expect(activityDestination(job({ kind: "ingestion" }), { ...site, platform: "pool" })).toBe(
      "/content-pool",
    );
  });
});

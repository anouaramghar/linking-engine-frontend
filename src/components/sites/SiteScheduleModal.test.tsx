import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import SiteScheduleModal from "./SiteScheduleModal";

const mocks = vi.hoisted(() => ({
  schedule: {
    data: null,
    isPending: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  },
  update: { isPending: false, mutateAsync: vi.fn() },
  runNow: { isPending: false, mutateAsync: vi.fn() },
}));

vi.mock("../../hooks/useSites", () => ({
  useSiteSchedule: () => mocks.schedule,
  useUpdateSiteSchedule: () => mocks.update,
  useRunSiteScheduleNow: () => mocks.runNow,
}));

const site = {
  id: 7,
  name: "Editorial",
  base_url: "https://editorial.example",
  platform: "wordpress" as const,
  crawl_frequency: "manual",
  suggestion_slots_available: 3,
  created_at: "2026-08-01T09:00:00Z",
  last_ingestion_status: null,
};

beforeEach(() => {
  mocks.schedule.data = null;
  mocks.schedule.isPending = false;
  mocks.schedule.isError = false;
  mocks.update.isPending = false;
  mocks.runNow.isPending = false;
  mocks.update.mutateAsync.mockReset();
  mocks.runNow.mutateAsync.mockReset();
});

afterEach(cleanup);

describe("SiteScheduleModal", () => {
  it("saves a daily schedule in the selected timezone", async () => {
    const onClose = vi.fn();
    const onSaved = vi.fn();
    mocks.update.mutateAsync.mockResolvedValue({ id: 4 });

    render(<SiteScheduleModal site={site} onClose={onClose} onSaved={onSaved} />);
    fireEvent.click(screen.getByRole("checkbox", { name: /Run refresh automatically/ }));
    fireEvent.change(screen.getByRole("combobox", { name: "Repeat" }), {
      target: { value: "daily" },
    });
    fireEvent.change(screen.getByRole("combobox", { name: /Timezone/ }), {
      target: { value: "Africa/Casablanca" },
    });
    const form = screen.getByRole("form", { name: "Site refresh schedule" });
    expect(form.querySelector('[name="enabled"]')).not.toBeNull();
    expect(form.querySelector('[name="cadence"]')).not.toBeNull();
    expect(form.querySelector('[name="local_time"]')).not.toBeNull();
    expect(form.querySelector('[name="timezone"]')).not.toBeNull();
    fireEvent.submit(form);

    await waitFor(() =>
      expect(mocks.update.mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          enabled: true,
          cadence: "daily",
          weekday: null,
          local_time: "02:00",
          timezone: "Africa/Casablanca",
        }),
      ),
    );
    expect(onSaved).toHaveBeenCalledWith("Automation schedule saved.");
    expect(onClose).toHaveBeenCalled();
  });

  it("queues an immediate crawl and analysis run", async () => {
    const onClose = vi.fn();
    const onSaved = vi.fn();
    mocks.runNow.mutateAsync.mockResolvedValue({ batch_id: 19, ingestion_job_run_id: 20 });

    render(<SiteScheduleModal site={site} onClose={onClose} onSaved={onSaved} />);
    fireEvent.click(screen.getByRole("button", { name: "Run now" }));

    await waitFor(() => expect(mocks.runNow.mutateAsync).toHaveBeenCalledWith(7));
    expect(onSaved).toHaveBeenCalledWith("Crawl and analysis queued.");
    expect(onClose).toHaveBeenCalled();
  });
});

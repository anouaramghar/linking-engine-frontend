import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import NotificationBell from "./NotificationBell";
import type { AppAlert } from "../types/alert";

const mocks = vi.hoisted(() => ({
  useAlerts: vi.fn(),
}));

vi.mock("../hooks/useAlerts", () => ({
  useAlerts: mocks.useAlerts,
}));

const alert: AppAlert = {
  id: 1,
  site_id: 7,
  site_name: "CMH main site",
  kind: "job_succeeded",
  subject: "LinkMesh publication job completed",
  payload: { site_id: 7, kind: "publication", job_run_id: 4, outcome: "succeeded" },
  occurrences: 1,
  created_at: "2026-08-17T10:00:00Z",
  last_seen_at: "2026-08-17T10:00:00Z",
  acknowledged_at: null,
};

const LocationProbe = () => {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
};

afterEach(cleanup);

beforeEach(() => {
  mocks.useAlerts.mockReturnValue({
    alerts: [alert],
    unreadCount: 1,
    isPending: false,
    isError: false,
    acknowledge: vi.fn(),
  });
});

describe("NotificationBell", () => {
  it("shows the shared unread feed and opens the existing destination", async () => {
    const user = userEvent.setup();
    const acknowledge = vi.fn();
    mocks.useAlerts.mockReturnValue({
      alerts: [alert],
      unreadCount: 1,
      isPending: false,
      isError: false,
      acknowledge,
    });

    render(
      <MemoryRouter initialEntries={["/queue"]}>
        <LocationProbe />
        <NotificationBell collapsed={false} />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole("button", { name: "Notifications, 1 unread notification" }));
    const dialog = screen.getByRole("dialog", { name: "Notifications" });
    expect(within(dialog).getByText("Publication job completed")).toBeTruthy();
    expect(dialog.textContent).toContain("CMH main site");

    await user.click(within(dialog).getByRole("button", { name: /Completed:/ }));

    expect(acknowledge).toHaveBeenCalledWith(1);
    expect(screen.getByTestId("location").textContent).toBe("/publish/7");
    expect(screen.queryByRole("dialog", { name: "Notifications" })).toBeNull();
  });

  it("keeps the collapsed control accessible without exposing the visual label", () => {
    render(
      <MemoryRouter>
        <NotificationBell collapsed />
      </MemoryRouter>,
    );

    const button = screen.getByRole("button", { name: "Notifications, 1 unread notification" });
    expect(button.textContent).toContain("1 unread notification");
    expect(button.textContent).not.toContain("Notifications");
    expect(button.className).toContain("w-7");
  });

  it("supports an icon-only control in the sidebar header", () => {
    render(
      <MemoryRouter>
        <NotificationBell collapsed={false} iconOnly />
      </MemoryRouter>,
    );

    const button = screen.getByRole("button", { name: "Notifications, 1 unread notification" });
    expect(button.textContent).not.toContain("Notifications");
    expect(button.className).toContain("w-8");
    expect(button.querySelector(".dot")?.className).toContain("bg-notification-unread");
  });

  it("hides the unread indicator when every notification has been read", () => {
    mocks.useAlerts.mockReturnValue({
      alerts: [{ ...alert, acknowledged_at: "2026-08-17T10:01:00Z" }],
      unreadCount: 0,
      isPending: false,
      isError: false,
      acknowledge: vi.fn(),
    });

    render(
      <MemoryRouter>
        <NotificationBell collapsed={false} iconOnly />
      </MemoryRouter>,
    );

    const button = screen.getByRole("button", { name: "Notifications" });
    expect(button.querySelector(".dot")).toBeNull();
  });
});

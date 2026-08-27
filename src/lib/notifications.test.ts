import { describe, expect, it } from "vitest";

import {
  formatNotificationTime,
  formatNotificationTimestamp,
  notificationDestination,
  notificationStatus,
  notificationTitle,
} from "./notifications";
import type { AppAlert } from "../types/alert";

const alert = (overrides: Partial<AppAlert> = {}): AppAlert => ({
  id: 1,
  site_id: 7,
  site_name: "CMH main site",
  kind: "job_succeeded",
  subject: "LinkMesh analysis job completed",
  payload: { site_id: 7, kind: "analysis", job_run_id: 4, outcome: "succeeded" },
  occurrences: 1,
  created_at: "2026-08-17T10:00:00Z",
  last_seen_at: "2026-08-17T10:00:00Z",
  acknowledged_at: null,
  ...overrides,
});

describe("notification helpers", () => {
  it("maps job outcomes to the existing destination", () => {
    expect(notificationDestination(alert())).toBe("/queue");
    expect(
      notificationDestination(
        alert({ payload: { site_id: 7, kind: "publication", job_run_id: 9 } }),
      ),
    ).toBe("/publish/7");
  });

  it("recognizes partial and failed alerts", () => {
    expect(
      notificationStatus(
        alert({ kind: "job_partial", payload: { outcome: "partial" } }),
      ),
    ).toBe("partial");
    expect(notificationStatus(alert({ kind: "job_lost" }))).toBe("failed");
    expect(notificationStatus(alert({ kind: "job_stopped" }))).toBe("failed");
    expect(notificationStatus(alert({ kind: "job_cancelled" }))).toBe("info");
  });

  it("drops the Telegram prefix without leaving a lowercase headline", () => {
    expect(notificationTitle("LinkMesh analysis job completed")).toBe("Analysis job completed");
    // Nothing to strip, nothing to change.
    expect(notificationTitle("Crawl blocked by robots.txt")).toBe("Crawl blocked by robots.txt");
    // The prefix is the whole subject: keep the words rather than return "".
    expect(notificationTitle("LinkMesh")).toBe("LinkMesh");
  });

  it("keeps an unparseable timestamp out of the tooltip", () => {
    expect(formatNotificationTimestamp("not-a-date")).toBe("");
    expect(formatNotificationTimestamp("2026-08-17T10:00:00Z")).not.toBe("");
  });

  it("uses compact relative time labels", () => {
    const now = Date.parse("2026-08-17T12:00:00Z");
    expect(formatNotificationTime("2026-08-17T11:59:30Z", now)).toBe("just now");
    expect(formatNotificationTime("2026-08-17T11:15:00Z", now)).toBe("45m ago");
    expect(formatNotificationTime("2026-08-16T12:00:00Z", now)).toBe("1d ago");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const post = vi.hoisted(() => vi.fn());
const remove = vi.hoisted(() => vi.fn());

vi.mock("./client", () => ({
  api: {
    post,
    put: vi.fn(),
    delete: remove,
    defaults: { baseURL: "/api/v1" },
  },
  AGENT_CHAT_TIMEOUT_MS: 120_000,
  AGENT_STREAM_IDLE_MS: 120_000,
  LINKMESH_CLIENT_HEADER: "X-LinkMesh-Client",
  LINKMESH_CLIENT_VALUE: "dashboard",
}));

import { confirmProposal } from "./agent";

describe("small dashboard-parity proposal confirmation", () => {
  beforeEach(() => {
    post.mockReset();
    remove.mockReset();
  });

  it("acknowledges only the exact unread alert occurrence", async () => {
    const payload = {
      expected_unacknowledged: true,
      expected_occurrences: 3,
      expected_last_seen_at: "2026-08-23T17:30:00Z",
    };
    post.mockResolvedValueOnce({ data: { id: 17, subject: "Analysis failed" } });

    await expect(
      confirmProposal({
        tool: "preview_alert_acknowledgement",
        kind: "alert_acknowledgement",
        risk: "sensitive",
        method: "POST",
        endpoint: "/api/v1/alerts/17/acknowledge",
        payload,
        context: {
          alert_id: 17,
          alert_subject: "Analysis failed",
          alert_kind: "job_failed",
          site_id: 8,
          site_name: "Docs",
        },
        impact: { alert_count: 1, occurrence_count: 3 },
      }),
    ).resolves.toEqual({
      message: "Acknowledged: alert #17 — Analysis failed.",
      undoAvailable: false,
    });
    expect(post).toHaveBeenCalledWith("/alerts/17/acknowledge", payload);
  });

  it("revokes one exact pool source with its exact suggestion impact", async () => {
    const payload = {
      expected: {
        approved: true,
        quarantined: false,
        consecutive_failures: 0,
        quarantined_at: null,
      },
      expected_expiring_suggestion_ids: [41, 42],
    };
    remove.mockResolvedValueOnce({ data: { id: 9, name: "Reference pool" } });

    await expect(
      confirmProposal({
        tool: "preview_pool_source_action",
        kind: "pool_source_action",
        risk: "sensitive",
        method: "DELETE",
        endpoint: "/api/v1/sites/9/pool-source/approval",
        payload,
        context: {
          site_id: 9,
          site_name: "Reference pool",
          site_url: "https://reference.example/feed",
          action: "revoke",
        },
        impact: {
          site_count: 1,
          expiring_suggestion_count: 2,
          pending_count: 1,
          approved_count: 1,
          consecutive_failure_count: 0,
        },
      }),
    ).resolves.toEqual({
      message: "Revoked: Reference pool (site #9).",
      undoAvailable: false,
    });
    expect(remove).toHaveBeenCalledWith("/sites/9/pool-source/approval", { data: payload });
  });

  it("refuses a pool proposal whose displayed site differs from its endpoint", async () => {
    await expect(
      confirmProposal({
        tool: "preview_pool_source_action",
        kind: "pool_source_action",
        risk: "sensitive",
        method: "POST",
        endpoint: "/api/v1/sites/9/pool-source/reactivate",
        payload: {
          expected: {
            approved: true,
            quarantined: true,
            consecutive_failures: 3,
            quarantined_at: "2026-08-23T17:30:00Z",
          },
        },
        context: {
          site_id: 10,
          site_name: "Different pool",
          action: "reactivate",
        },
      }),
    ).rejects.toThrow("unsupported content-pool action proposal");
    expect(post).not.toHaveBeenCalled();
  });
});

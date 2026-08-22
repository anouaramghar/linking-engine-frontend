import { beforeEach, describe, expect, it, vi } from "vitest";

// The client module is mocked so no axios instance is built; the post spy is
// what the guard below must argue with.
const post = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ data: { reviewed: 1 } }),
);
vi.mock("./client", () => ({
  api: { post },
  AGENT_CHAT_TIMEOUT_MS: 120_000,
  LINKMESH_CLIENT_HEADER: "X-LinkMesh-Client",
  LINKMESH_CLIENT_VALUE: "dashboard",
}));

import { confirmProposal, postAgentMessage } from "./agent";

describe("postAgentMessage", () => {
  beforeEach(() => {
    post.mockClear();
    post.mockResolvedValue({
      data: { reply: "ok", tools_used: [], proposals: [] },
    });
  });

  it("asks for longer than the shared client budget", async () => {
    // Chat runs several model turns before it can answer. On the shared 30s
    // budget the panel failed intermittently while the engine went on to
    // answer successfully, which reads to an operator as a broken assistant.
    await postAgentMessage("how many pending suggestions?", []);

    expect(post).toHaveBeenCalledWith(
      "/agent/chat",
      { message: "how many pending suggestions?", history: [] },
      { timeout: 120_000 },
    );
  });
});

describe("confirmProposal", () => {
  beforeEach(() => {
    post.mockClear();
    post.mockResolvedValue({ data: { reviewed: 1 } });
  });

  it("posts the staged payload verbatim to the one allowed endpoint", async () => {
    const payload = { status: "approved", threshold_percent: 85, site_id: 7 };
    await confirmProposal({
      tool: "preview_bulk_review",
      endpoint: "/api/v1/suggestions/bulk-review-by-filter",
      payload,
    });

    expect(post).toHaveBeenCalledWith(
      "/suggestions/bulk-review-by-filter",
      payload,
    );
  });

  it("refuses any other endpoint a proposal might name", async () => {
    await expect(
      confirmProposal({
        tool: "preview_bulk_review",
        endpoint: "/api/v1/sites/7",
        payload: {},
      }),
    ).rejects.toThrow("unsupported proposal endpoint");

    await expect(
      confirmProposal({
        tool: "preview_bulk_review",
        endpoint: "/api/v1/suggestions/bulk-review",
        payload: {},
      }),
    ).rejects.toThrow("unsupported proposal endpoint");

    expect(post).not.toHaveBeenCalled();
  });
});

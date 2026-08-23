import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The client module is mocked so no axios instance is built; the post spy is
// what the guard below must argue with.
const post = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ data: { reviewed: 1 } }),
);
const put = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ data: { id: 7, status: "approved" } }),
);
vi.mock("./client", () => ({
  api: { post, put, defaults: { baseURL: "/api/v1" } },
  AGENT_CHAT_TIMEOUT_MS: 120_000,
  AGENT_STREAM_IDLE_MS: 120_000,
  LINKMESH_CLIENT_HEADER: "X-LinkMesh-Client",
  LINKMESH_CLIENT_VALUE: "dashboard",
}));

import {
  AgentStreamError,
  confirmProposal,
  postAgentMessage,
  streamAgentMessage,
  type AgentStreamHandlers,
} from "./agent";

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
    put.mockClear();
    post.mockResolvedValue({ data: { reviewed: 1 } });
  });

  it("posts the staged payload verbatim to the one allowed endpoint", async () => {
    const payload = {
      status: "approved",
      match_status: "pending",
      threshold_percent: 85,
      site_id: 7,
    };
    await confirmProposal({
      tool: "preview_bulk_review",
      kind: "bulk_review",
      risk: "reversible",
      method: "POST",
      endpoint: "/api/v1/suggestions/bulk-review-by-filter",
      payload,
    });

    expect(post).toHaveBeenCalledWith(
      "/suggestions/bulk-review-by-filter",
      payload,
    );
  });

  it("puts a single review only to its exact suggestion route", async () => {
    const payload = { status: "approved", expected_status: "pending" };
    await confirmProposal({
      tool: "preview_suggestion_review",
      kind: "review_suggestion",
      risk: "reversible",
      method: "PUT",
      endpoint: "/api/v1/suggestions/7",
      payload,
    });

    expect(put).toHaveBeenCalledWith("/suggestions/7", payload);
  });

  it("puts a ranking policy with its expected snapshot", async () => {
    put.mockResolvedValueOnce({ data: { site_id: 8 } });
    const expected = {
      enabled: false,
      min_score_percent: 0,
      feedback_weight: 0.2,
      min_samples: 10,
    };
    const payload = {
      enabled: true,
      min_score_percent: 70,
      feedback_weight: 0.35,
      min_samples: 25,
      expected,
    };

    await expect(
      confirmProposal({
        tool: "preview_editorial_ranking_policy",
        kind: "editorial_ranking_policy",
        risk: "reversible",
        method: "PUT",
        endpoint: "/api/v1/sites/8/editorial-ranking-policy",
        payload,
      }),
    ).resolves.toEqual({
      message: "Applied: editorial ranking policy updated for site #8.",
      undoAvailable: false,
    });

    expect(put).toHaveBeenCalledWith("/sites/8/editorial-ranking-policy", payload);
  });

  it("puts a sensitive external-link policy with its exact impact snapshot", async () => {
    put.mockResolvedValueOnce({ data: { site_id: 8, expired_suggestions: 2 } });
    const expected = {
      external_links_enabled: false,
      require_https: true,
      min_trust_score: 60,
      min_domain_age_days: 0,
      trusted_tlds: [],
      allowlist_domains: [],
      blocklist_domains: [],
      competitor_domains: [],
    };
    const payload = {
      external_links_enabled: true,
      require_https: true,
      min_trust_score: 0,
      min_domain_age_days: 0,
      trusted_tlds: [],
      allowlist_domains: [],
      blocklist_domains: [],
      competitor_domains: ["competitor.example"],
      expected,
      expected_expiring_suggestion_ids: [41, 42],
    };

    await expect(
      confirmProposal({
        tool: "preview_external_link_policy",
        kind: "external_link_policy",
        risk: "sensitive",
        method: "PUT",
        endpoint: "/api/v1/sites/8/external-link-policy",
        payload,
        impact: { expiring_count: 2, pending_count: 1, approved_count: 1 },
      }),
    ).resolves.toEqual({
      message: "Applied: external-link policy updated for site #8; 2 suggestions expired.",
      undoAvailable: false,
    });

    expect(put).toHaveBeenCalledWith("/sites/8/external-link-policy", payload);
  });

  it("refuses any other endpoint a proposal might name", async () => {
    await expect(
      confirmProposal({
        tool: "preview_bulk_review",
        kind: "bulk_review",
        risk: "reversible",
        method: "POST",
        endpoint: "/api/v1/sites/7",
        payload: {},
      }),
    ).rejects.toThrow("unsupported proposal endpoint");

    await expect(
      confirmProposal({
        tool: "preview_bulk_review",
        kind: "bulk_review",
        risk: "reversible",
        method: "POST",
        endpoint: "/api/v1/suggestions/bulk-review",
        payload: {},
      }),
    ).rejects.toThrow("unsupported proposal endpoint");

    expect(post).not.toHaveBeenCalled();
  });

  it("refuses a write proposal without its race-safety precondition", async () => {
    await expect(
      confirmProposal({
        tool: "preview_suggestion_review",
        kind: "review_suggestion",
        risk: "reversible",
        method: "PUT",
        endpoint: "/api/v1/suggestions/7",
        payload: { status: "approved" },
      }),
    ).rejects.toThrow("unsupported suggestion review status");

    expect(put).not.toHaveBeenCalled();
  });

  it("refuses a ranking policy proposal without its expected snapshot", async () => {
    await expect(
      confirmProposal({
        tool: "preview_editorial_ranking_policy",
        kind: "editorial_ranking_policy",
        risk: "reversible",
        method: "PUT",
        endpoint: "/api/v1/sites/8/editorial-ranking-policy",
        payload: {
          enabled: true,
          min_score_percent: 70,
          feedback_weight: 0.35,
          min_samples: 25,
        },
      }),
    ).rejects.toThrow("unsupported editorial ranking policy payload");

    expect(put).not.toHaveBeenCalled();
  });

  it("refuses an external-link policy without an exact impact snapshot", async () => {
    await expect(
      confirmProposal({
        tool: "preview_external_link_policy",
        kind: "external_link_policy",
        risk: "sensitive",
        method: "PUT",
        endpoint: "/api/v1/sites/8/external-link-policy",
        payload: {
          external_links_enabled: true,
          require_https: true,
          min_trust_score: 0,
          min_domain_age_days: 0,
          trusted_tlds: [],
          allowlist_domains: [],
          blocklist_domains: [],
          competitor_domains: [],
          expected: {},
        },
      }),
    ).rejects.toThrow("unsupported external-link policy payload");

    expect(put).not.toHaveBeenCalled();
  });
});

describe("streamAgentMessage", () => {
  /** A response that hands the body over in the chunks it is given. */
  const sse = (...chunks: string[]) => ({
    ok: true,
    status: 200,
    body: {
      getReader() {
        let at = 0;
        return {
          read: async () =>
            at < chunks.length
              ? { done: false, value: new TextEncoder().encode(chunks[at++]) }
              : { done: true, value: undefined },
          cancel: async () => {},
        };
      },
    },
  });

  const handlers = (): AgentStreamHandlers & { seen: string[] } => {
    const seen: string[] = [];
    return {
      seen,
      onDelta: (text) => seen.push(`delta:${text}`),
      onTool: (tool) => seen.push(`tool:${tool.name}`),
      onDone: (response) => seen.push(`done:${response.reply}`),
    };
  };

  const respondWith = (response: unknown) => {
    const fetching = vi.fn().mockResolvedValue(response);
    vi.stubGlobal("fetch", fetching);
    return fetching;
  };

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("reports each event as it arrives, whatever the chunks were", async () => {
    // Frames are split across reads on purpose: a chunk boundary falls wherever
    // the network puts it, including the middle of one event.
    respondWith(
      sse(
        ': open\n\nevent: tool\ndata: {"name":"get_queue_counts","arguments":{},"outcome":{"total":3}}\n\nevent: del',
        'ta\ndata: {"text":"The queue "}\n\nevent: delta\ndata: {"text":"has 3."}\n\n',
        'event: done\ndata: {"reply":"The queue has 3.","tools_used":[],"proposals":[]}\n\n',
      ),
    );

    const report = handlers();
    await streamAgentMessage("how busy?", [], report);

    expect(report.seen).toEqual([
      "tool:get_queue_counts",
      "delta:The queue ",
      "delta:has 3.",
      "done:The queue has 3.",
    ]);
  });

  it("sends the marker the proxy requires on an unsafe method", async () => {
    // Without it nginx answers 403 before the engine is reached: a browser
    // form cannot set a custom header, which is what makes it a CSRF guard.
    const fetching = respondWith(
      sse('event: done\ndata: {"reply":"ok","tools_used":[],"proposals":[]}\n\n'),
    );

    await streamAgentMessage("hi", [{ role: "user", content: "earlier" }], handlers());

    const [url, init] = fetching.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/v1/agent/chat/stream");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["X-LinkMesh-Client"]).toBe("dashboard");
    expect(JSON.parse(String(init.body))).toEqual({
      message: "hi",
      history: [{ role: "user", content: "earlier" }],
    });
  });

  it("carries the engine's own words out of a refusal", async () => {
    respondWith({
      ok: false,
      status: 503,
      json: async () => ({ detail: "the assistant is not configured on this deployment" }),
    });

    await expect(streamAgentMessage("hi", [], handlers())).rejects.toThrow(
      "the assistant is not configured on this deployment",
    );
  });

  it("treats an error event as the failure it is", async () => {
    // The status line was spent on the 200 that opened the stream, so this is
    // the only way a provider failure mid-turn can be told.
    respondWith(
      sse(
        'event: delta\ndata: {"text":"The queue "}\n\n',
        'event: error\ndata: {"detail":"the assistant is temporarily unavailable"}\n\n',
      ),
    );

    const report = handlers();
    await expect(streamAgentMessage("hi", [], report)).rejects.toBeInstanceOf(AgentStreamError);
    expect(report.seen).toEqual(["delta:The queue "]);
  });

  it("gives up on a connection that has gone silent", async () => {
    // The old whole-request timeout does not translate: a reply that keeps
    // arriving is not a stall. What is timed is the gap between fragments.
    vi.useFakeTimers();
    let pending: ((result: { done: boolean; value?: Uint8Array }) => void) | undefined;
    respondWith({
      ok: true,
      status: 200,
      body: {
        getReader: () => ({
          // Opens, then says nothing — until the read is cancelled, which is
          // how a real reader ends a read that is still in flight.
          read: () =>
            new Promise<{ done: boolean; value?: Uint8Array }>((resolve) => {
              pending = resolve;
            }),
          cancel: async () => pending?.({ done: true }),
        }),
      },
    });

    // The assertion is attached before the clock moves: the rejection lands
    // during the advance, and a promise nobody is holding at that moment is an
    // unhandled rejection.
    const turn = expect(streamAgentMessage("hi", [], handlers())).rejects.toThrow(
      "stopped responding",
    );
    await vi.advanceTimersByTimeAsync(120_000);
    await turn;
  });

  it("refuses to call a turn that never finished an answer", async () => {
    // A cut connection leaves a half-written reply on screen. Without this it
    // would settle there and read as the whole answer.
    respondWith(sse('event: delta\ndata: {"text":"The queue has "}\n\n'));

    await expect(streamAgentMessage("hi", [], handlers())).rejects.toThrow(
      "stopped before it finished",
    );
  });
});

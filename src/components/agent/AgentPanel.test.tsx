import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AgentPanel from "./AgentPanel";
import * as agentApi from "../../api/agent";

afterEach(cleanup);

vi.mock("../../api/agent", () => ({
  getAgentStatus: vi.fn().mockResolvedValue({ configured: true, model: "test-model" }),
  postAgentMessage: vi.fn(),
  confirmProposal: vi.fn(),
}));

const getSession = vi.hoisted(() => vi.fn());
vi.mock("../../api/auth", () => ({ getSession, logout: vi.fn() }));

vi.mock("./AgentAvatar", () => ({
  default: ({
    animation = "idle",
    className,
  }: {
    animation?: string;
    className?: string;
  }) => <div data-testid="agent-avatar" data-animation={animation} className={className} />,
}));

const renderPanel = () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <AgentPanel />
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  vi.mocked(agentApi.getAgentStatus).mockClear();
  vi.mocked(agentApi.postAgentMessage).mockReset();
  vi.mocked(agentApi.confirmProposal).mockReset();
  getSession.mockResolvedValue({ telegram_id: 42, is_staff: true });
});

describe("AgentPanel", () => {
  it("offers a launcher only for a signed-in operator", async () => {
    renderPanel();
    expect(await screen.findByRole("button", { name: "Open assistant" })).not.toBeNull();
    expect(agentApi.getAgentStatus).not.toHaveBeenCalled();
  });

  it("renders nothing when signed out", async () => {
    getSession.mockResolvedValue(null);
    const { container } = renderPanel();
    await waitFor(() => expect(getSession).toHaveBeenCalled());
    expect(container.querySelector("button")).toBeNull();
  });

  it("sends a message and shows the reply with the tools consulted", async () => {
    const post = vi.mocked(agentApi.postAgentMessage).mockResolvedValue({
      reply: "The queue has 3 pending suggestions.",
      tools_used: [
        {
          name: "get_queue_counts",
          arguments: {},
          outcome: { total: 3 },
        },
      ],
      proposals: [],
    });

    const user = userEvent.setup();
    renderPanel();
    await user.click(await screen.findByRole("button", { name: "Open assistant" }));

    const input = await screen.findByLabelText("Message the assistant");
    await user.type(input, "How busy is the queue?{Enter}");

    await screen.findByText("The queue has 3 pending suggestions.");
    expect(post).toHaveBeenCalledWith(
      "How busy is the queue?",
      [],
    );
    // The tool trace names what the answer was built from.
    expect(screen.getByText("get_queue_counts")).not.toBeNull();
  });

  it("renders the reply's Markdown as structure, and the operator's own words as typed", async () => {
    vi.mocked(agentApi.postAgentMessage).mockResolvedValue({
      reply: "**Review queue**\n* pending: 146\n* approved: 1",
      tools_used: [],
      proposals: [],
    });

    const user = userEvent.setup();
    const { container } = renderPanel();
    await user.click(await screen.findByRole("button", { name: "Open assistant" }));

    const input = await screen.findByLabelText("Message the assistant");
    await user.type(input, "status of **my** queue?{Enter}");

    await waitFor(() => expect(container.querySelector(".assistant-md-li")).not.toBeNull());
    expect(container.querySelector(".assistant-md-strong")?.textContent).toBe("Review queue");
    expect(container.querySelectorAll(".assistant-md-li").length).toBe(2);

    // The operator's message is shown exactly as typed: their asterisks are
    // theirs, and nothing they write is read as markup.
    expect(screen.getByText("status of **my** queue?")).not.toBeNull();
  });

  it("keeps the conversation log directly scrollable while a reply is pending", async () => {
    let release: (() => void) | undefined;
    const post = vi.mocked(agentApi.postAgentMessage).mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () =>
            resolve({
              reply: "The queue is ready.",
              tools_used: [],
              proposals: [],
            });
        }),
    );

    const user = userEvent.setup();
    renderPanel();
    await user.click(await screen.findByRole("button", { name: "Open assistant" }));
    await user.type(await screen.findByLabelText("Message the assistant"), "check the queue{Enter}");

    const log = await screen.findByRole("log", { name: "Assistant conversation" });
    expect(log.getAttribute("tabindex")).toBe("0");
    expect(log.className).toContain("overscroll-contain");
    expect(screen.getByRole("status").textContent).toContain("Assistant is thinking…");

    release?.();
    await screen.findByText("The queue is ready.");
    expect(post).toHaveBeenCalledWith("check the queue", []);
  });

  it("maps typing, longer requests, and successful replies to avatar reactions", async () => {
    let release: (() => void) | undefined;
    const post = vi.mocked(agentApi.postAgentMessage).mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () =>
            resolve({
              reply: "The queue is ready.",
              tools_used: [],
              proposals: [],
            });
        }),
    );

    const user = userEvent.setup();
    renderPanel();
    const launcher = await screen.findByRole("button", { name: "Open assistant" });
    expect(screen.getByTestId("agent-avatar").getAttribute("data-animation")).toBe("idle");
    await user.click(launcher);

    const input = await screen.findByLabelText("Message the assistant");
    await user.type(input, "check the queue");
    expect(screen.getByTestId("agent-avatar").getAttribute("data-animation")).toBe("listening");

    await user.keyboard("{Enter}");
    await waitFor(() =>
      expect(screen.getByTestId("agent-avatar").getAttribute("data-animation")).toBe("thinking"),
    );
    await new Promise((resolve) => setTimeout(resolve, 1250));
    expect(screen.getByTestId("agent-avatar").getAttribute("data-animation")).toBe("working");

    release?.();
    await screen.findByText("The queue is ready.");
    await user.click(screen.getByRole("button", { name: "Close assistant" }));
    await waitFor(() =>
      expect(screen.getByTestId("agent-avatar").getAttribute("data-animation")).toBe("happy"),
    );
    expect(post).toHaveBeenCalledWith("check the queue", []);
  });

  it("shows an error notice when the assistant is unavailable", async () => {
    vi.mocked(agentApi.postAgentMessage).mockRejectedValue({
      response: { status: 503, data: { detail: "the assistant is not configured" } },
    });

    const user = userEvent.setup();
    renderPanel();
    await user.click(await screen.findByRole("button", { name: "Open assistant" }));
    await user.type(await screen.findByLabelText("Message the assistant"), "hi{Enter}");

    await screen.findByRole("alert");
    expect(screen.getByText("the assistant is not configured")).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Close assistant" }));
    await waitFor(() =>
      expect(screen.getByTestId("agent-avatar").getAttribute("data-animation")).toBe("surprised"),
    );
  });

  it("retries the exact failed message instead of only dismissing the error", async () => {
    const post = vi
      .mocked(agentApi.postAgentMessage)
      .mockRejectedValueOnce({ response: { status: 503, data: { detail: "Temporary outage" } } })
      .mockResolvedValueOnce({
        reply: "Recovered after retry.",
        tools_used: [],
        proposals: [],
      });

    const user = userEvent.setup();
    renderPanel();
    await user.click(await screen.findByRole("button", { name: "Open assistant" }));
    await user.type(await screen.findByLabelText("Message the assistant"), "check the queue{Enter}");
    await screen.findByText("Temporary outage");

    await user.click(screen.getByRole("button", { name: "Retry message" }));
    await screen.findByText("Recovered after retry.");
    expect(post).toHaveBeenCalledTimes(2);
    expect(post.mock.calls[1]).toEqual(["check the queue", []]);
  });

  it("clears the local conversation on request", async () => {
    vi.mocked(agentApi.postAgentMessage).mockResolvedValue({
      reply: "The queue is clear.",
      tools_used: [],
      proposals: [],
    });

    const user = userEvent.setup();
    renderPanel();
    await user.click(await screen.findByRole("button", { name: "Open assistant" }));
    await user.type(await screen.findByLabelText("Message the assistant"), "queue status{Enter}");
    await screen.findByText("The queue is clear.");

    await user.click(screen.getByRole("button", { name: "Clear" }));
    expect(screen.queryByText("The queue is clear.")).toBeNull();
    expect(screen.getByText(/Ask about your sites/)).not.toBeNull();
  });

  it("announces itself as a labelled dialog once open", async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(await screen.findByRole("button", { name: "Open assistant" }));
    const dialog = await screen.findByRole("dialog", { name: "Assistant" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
  });

  it("restores focus to the launcher after the dialog closes", async () => {
    const user = userEvent.setup();
    renderPanel();
    await user.click(await screen.findByRole("button", { name: "Open assistant" }));
    await user.keyboard("{Escape}");

    const launcher = await screen.findByRole("button", { name: "Open assistant" });
    expect(document.activeElement).toBe(launcher);
  });

  it("stages a bulk rule behind an explicit confirm, then reports the result", async () => {
    vi.mocked(agentApi.postAgentMessage).mockResolvedValue({
      reply: "I can approve the strong ones when you are ready.",
      tools_used: [],
      proposals: [
        {
          tool: "preview_bulk_review",
          endpoint: "/api/v1/suggestions/bulk-review-by-filter",
          payload: {
            status: "approved",
            match_status: "pending",
            site_id: 7,
            all_sites: false,
            threshold_percent: 85,
          },
          match_count: 12,
        },
      ],
    });
    const confirm = vi.mocked(agentApi.confirmProposal).mockResolvedValue({
      reviewed: 12,
      skipped: 0,
      reviewed_ids: [1, 2, 3],
      undo_operation_id: "op-1",
      status: "approved",
    });

    const user = userEvent.setup();
    renderPanel();
    await user.click(await screen.findByRole("button", { name: "Open assistant" }));
    await user.type(
      await screen.findByLabelText("Message the assistant"),
      "approve everything strong on site 7{Enter}",
    );
    await screen.findByText("I can approve the strong ones when you are ready.");

    // The staged rule is described, not silently executed.
    expect(
      screen.getByText(/Approve pending suggestions at or above 85% on site #7 \(12 pending\)/),
    ).not.toBeNull();

    const confirmButton = screen.getByRole("button", { name: "Confirm" });
    expect(screen.getByText(/Nothing happens until you confirm/)).not.toBeNull();

    await user.click(confirmButton);
    await screen.findByText(/Applied: 12 reviewed/);
    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({ endpoint: "/api/v1/suggestions/bulk-review-by-filter" }),
    );
    // Confirmed once, gone: the card cannot fire twice.
    expect(screen.queryByRole("button", { name: "Confirm" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Close assistant" }));
    await waitFor(() =>
      expect(screen.getByTestId("agent-avatar").getAttribute("data-animation")).toBe("celebrate"),
    );
  });

  it("surfaces a failed proposal without losing the conversation", async () => {
    vi.mocked(agentApi.postAgentMessage).mockResolvedValue({
      reply: "",
      tools_used: [],
      proposals: [
        {
          tool: "preview_bulk_review",
          endpoint: "/api/v1/sites/7",
          payload: {},
          match_count: 1,
        },
      ],
    });
    // Mirrors the real confirmProposal guard rejecting a foreign endpoint.
    vi.mocked(agentApi.confirmProposal).mockRejectedValue(
      new Error("unsupported proposal endpoint: /api/v1/sites/7"),
    );

    const user = userEvent.setup();
    renderPanel();
    await user.click(await screen.findByRole("button", { name: "Open assistant" }));
    await user.type(
      await screen.findByLabelText("Message the assistant"),
      "do something unusual{Enter}",
    );
    await user.click(await screen.findByRole("button", { name: "Confirm" }));

    const alert = await screen.findByRole("alert");
    // A bare Error carries no response body, so the card's fallback copy shows.
    expect(alert.textContent).toContain("The review could not be applied.");
  });
});

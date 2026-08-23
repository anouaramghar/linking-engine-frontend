import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AgentPanel from "./AgentPanel";
import * as agentApi from "../../api/agent";
import type { AgentProposal, AgentToolTrace } from "../../api/agent";

afterEach(cleanup);

vi.mock("../../api/agent", () => ({
  getAgentStatus: vi.fn().mockResolvedValue({ configured: true, model: "test-model" }),
  streamAgentMessage: vi.fn(),
  confirmProposal: vi.fn(),
  // The hook tells an engine refusal from a transport failure with
  // `instanceof`, so the class it imports has to be the one thrown here.
  AgentStreamError: class AgentStreamError extends Error {
    constructor(readonly detail: string) {
      super(detail);
    }
  },
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

/**
 * Play one turn the way the engine sends it: tools as they return, then the
 * text, then the finished body. Whole-turn delivery is the common case in these
 * tests; the ones about what a half-written turn looks like script it by hand.
 */
const streams = (
  reply: string,
  extras: { tools?: AgentToolTrace[]; proposals?: AgentProposal[] } = {},
) =>
  vi
    .mocked(agentApi.streamAgentMessage)
    .mockImplementation(async (_message, _history, handlers) => {
      extras.tools?.forEach(handlers.onTool);
      handlers.onDelta(reply);
      handlers.onDone({
        reply,
        tools_used: extras.tools ?? [],
        proposals: extras.proposals ?? [],
      });
    });

/** The message and the transcript it was sent with, without the plumbing. */
const asked = (call: unknown[] | undefined) => call?.slice(0, 2);

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
  vi.mocked(agentApi.streamAgentMessage).mockReset();
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
    const stream = streams("The queue has 3 pending suggestions.", {
      tools: [{ name: "get_queue_counts", arguments: {}, outcome: { total: 3 } }],
    });

    const user = userEvent.setup();
    renderPanel();
    await user.click(await screen.findByRole("button", { name: "Open assistant" }));

    const input = await screen.findByLabelText("Message the assistant");
    await user.type(input, "How busy is the queue?{Enter}");

    await screen.findByText("The queue has 3 pending suggestions.");
    expect(asked(stream.mock.calls[0])).toEqual(["How busy is the queue?", []]);
    // The tool trace names what the answer was built from.
    expect(screen.getByText("get_queue_counts")).not.toBeNull();
  });

  it("shows the reply as it arrives, before the turn has finished", async () => {
    // The whole point of streaming: half an answer on screen beats a spinner
    // over a finished one nobody can see yet.
    let write: ((text: string) => void) | undefined;
    let finish: (() => void) | undefined;
    vi.mocked(agentApi.streamAgentMessage).mockImplementation(
      (_message, _history, handlers) =>
        new Promise((resolve) => {
          write = handlers.onDelta;
          handlers.onTool({ name: "get_queue_counts", arguments: {}, outcome: { total: 3 } });
          finish = () => {
            handlers.onDelta("3 pending suggestions.");
            handlers.onDone({
              reply: "The queue has 3 pending suggestions.",
              tools_used: [{ name: "get_queue_counts", arguments: {}, outcome: { total: 3 } }],
              proposals: [],
            });
            resolve();
          };
        }),
    );

    const user = userEvent.setup();
    const { container } = renderPanel();
    await user.click(await screen.findByRole("button", { name: "Open assistant" }));
    await user.type(await screen.findByLabelText("Message the assistant"), "queue?{Enter}");

    // The tool lands first, while the model is still deciding what to say.
    await screen.findByText("get_queue_counts");
    expect(screen.getByRole("status").textContent).toContain("Assistant is working…");

    write?.("The queue has ");
    await screen.findByText(/The queue has/);
    // The waiting line is gone the moment there are words in its place, and the
    // turn is marked as still being written.
    expect(screen.queryByRole("status")).toBeNull();
    expect(container.querySelector(".assistant-message--streaming")).not.toBeNull();

    finish?.();
    await waitFor(() =>
      expect(container.querySelector(".assistant-message--streaming")).toBeNull(),
    );
    expect(screen.getByText("The queue has 3 pending suggestions.")).not.toBeNull();
  });

  it("renders the reply's Markdown as structure, and the operator's own words as typed", async () => {
    streams("**Review queue**\n* pending: 146\n* approved: 1");

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
    const stream = vi.mocked(agentApi.streamAgentMessage).mockImplementation(
      (_message, _history, handlers) =>
        new Promise((resolve) => {
          release = () => {
            handlers.onDone({ reply: "The queue is ready.", tools_used: [], proposals: [] });
            resolve();
          };
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
    expect(asked(stream.mock.calls[0])).toEqual(["check the queue", []]);
  });

  it("maps typing, consulting a tool, and successful replies to avatar reactions", async () => {
    let consult: (() => void) | undefined;
    let release: (() => void) | undefined;
    const stream = vi.mocked(agentApi.streamAgentMessage).mockImplementation(
      (_message, _history, handlers) =>
        new Promise((resolve) => {
          consult = () =>
            handlers.onTool({ name: "get_queue_counts", arguments: {}, outcome: { total: 0 } });
          release = () => {
            handlers.onDone({ reply: "The queue is ready.", tools_used: [], proposals: [] });
            resolve();
          };
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

    // Working is reported, not timed: the engine says when a tool ran.
    consult?.();
    await waitFor(() =>
      expect(screen.getByTestId("agent-avatar").getAttribute("data-animation")).toBe("working"),
    );

    release?.();
    await screen.findByText("The queue is ready.");
    await user.click(screen.getByRole("button", { name: "Close assistant" }));
    await waitFor(() =>
      expect(screen.getByTestId("agent-avatar").getAttribute("data-animation")).toBe("happy"),
    );
    expect(asked(stream.mock.calls[0])).toEqual(["check the queue", []]);
  });

  it("shows an error notice when the assistant is unavailable", async () => {
    vi.mocked(agentApi.streamAgentMessage).mockRejectedValue(
      new agentApi.AgentStreamError("the assistant is not configured"),
    );

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

  it("takes a half-written reply back when the stream fails part way", async () => {
    // Half an answer with a retry button beside it reads as an answer, and the
    // half that is missing is the half with the number in it.
    vi.mocked(agentApi.streamAgentMessage)
      .mockImplementationOnce(async (_message, _history, handlers) => {
        handlers.onDelta("The queue has ");
        throw new agentApi.AgentStreamError("the assistant is temporarily unavailable");
      })
      .mockImplementationOnce(async (_message, _history, handlers) => {
        handlers.onDone({ reply: "The queue has 3 pending.", tools_used: [], proposals: [] });
      });

    const user = userEvent.setup();
    renderPanel();
    await user.click(await screen.findByRole("button", { name: "Open assistant" }));
    await user.type(await screen.findByLabelText("Message the assistant"), "queue?{Enter}");

    await screen.findByText("the assistant is temporarily unavailable");
    expect(screen.queryByText(/The queue has $/)).toBeNull();
    // The operator's own question goes back too, so Retry sends it once.
    expect(screen.queryByText("queue?")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Retry message" }));
    await screen.findByText("The queue has 3 pending.");
  });

  it("retries the exact failed message instead of only dismissing the error", async () => {
    const stream = vi
      .mocked(agentApi.streamAgentMessage)
      .mockRejectedValueOnce(new agentApi.AgentStreamError("Temporary outage"))
      .mockImplementationOnce(async (_message, _history, handlers) => {
        handlers.onDone({ reply: "Recovered after retry.", tools_used: [], proposals: [] });
      });

    const user = userEvent.setup();
    renderPanel();
    await user.click(await screen.findByRole("button", { name: "Open assistant" }));
    await user.type(await screen.findByLabelText("Message the assistant"), "check the queue{Enter}");
    await screen.findByText("Temporary outage");

    await user.click(screen.getByRole("button", { name: "Retry message" }));
    await screen.findByText("Recovered after retry.");
    expect(stream).toHaveBeenCalledTimes(2);
    expect(asked(stream.mock.calls[1])).toEqual(["check the queue", []]);
  });

  it("clears the local conversation on request", async () => {
    streams("The queue is clear.");

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
    streams("I can approve the strong ones when you are ready.", {
      proposals: [
        {
          tool: "preview_bulk_review",
          kind: "bulk_review",
          risk: "reversible",
          method: "POST",
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
      message: "Applied: 12 reviewed.",
      undoAvailable: true,
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

  it("confirms one suggestion review through the typed proposal path", async () => {
    streams("I staged the decision for you.", {
      proposals: [
        {
          tool: "preview_suggestion_review",
          kind: "review_suggestion",
          risk: "reversible",
          method: "PUT",
          endpoint: "/api/v1/suggestions/42",
          payload: {
            status: "rejected",
            expected_status: "pending",
            rejection_reason: "wrong_target",
          },
        },
      ],
    });
    const confirm = vi.mocked(agentApi.confirmProposal).mockResolvedValue({
      message: "Applied: suggestion #42 is rejected.",
      undoAvailable: true,
    });

    const user = userEvent.setup();
    renderPanel();
    await user.click(await screen.findByRole("button", { name: "Open assistant" }));
    await user.type(
      await screen.findByLabelText("Message the assistant"),
      "reject suggestion 42 because it targets the wrong page{Enter}",
    );

    expect(await screen.findByText(/Reject suggestion #42 \(wrong target\)/)).not.toBeNull();
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    expect(await screen.findByText(/suggestion #42 is rejected/)).not.toBeNull();
    expect(confirm).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "review_suggestion", method: "PUT" }),
    );
  });

  it("surfaces a failed proposal without losing the conversation", async () => {
    streams("", {
      proposals: [
        {
          tool: "preview_bulk_review",
          kind: "bulk_review",
          risk: "reversible",
          method: "POST",
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

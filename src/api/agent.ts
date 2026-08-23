import {
  AGENT_CHAT_TIMEOUT_MS,
  AGENT_STREAM_IDLE_MS,
  api,
  LINKMESH_CLIENT_HEADER,
  LINKMESH_CLIENT_VALUE,
} from "./client";
import type { FilteredBulkReviewResult } from "./suggestions";

export interface AgentToolTrace {
  name: string;
  arguments: Record<string, unknown>;
  outcome: Record<string, unknown>;
}

/** A staged bulk rule awaiting the operator's confirm in the panel. */
export interface AgentProposal {
  tool: string;
  endpoint: string;
  payload: Record<string, unknown>;
  match_count?: number | null;
}

export interface AgentChatResponse {
  reply: string;
  tools_used: AgentToolTrace[];
  proposals: AgentProposal[];
}

export interface AgentStatus {
  configured: boolean;
  model: string;
  /** Host the engine calls for chat. Empty when nothing is configured. */
  provider?: string;
}

export const getAgentStatus = () =>
  api.get<AgentStatus>("/agent/status").then((response) => response.data);

/**
 * Ask for a whole turn at once.
 *
 * The panel streams instead (see `streamAgentMessage`); this is the same answer
 * without the reporting, kept because it is the engine's plain REST shape and
 * the one a caller that cannot read a stream still has.
 *
 * Overrides the shared client budget: see AGENT_CHAT_TIMEOUT_MS for why.
 */
export const postAgentMessage = (
  message: string,
  history: { role: "user" | "assistant"; content: string }[],
) =>
  api
    .post<AgentChatResponse>(
      "/agent/chat",
      { message, history },
      { timeout: AGENT_CHAT_TIMEOUT_MS },
    )
    .then((response) => response.data);

/** What the engine reports while a turn is still running. */
export interface AgentStreamHandlers {
  /** A fragment of the reply, as the model writes it. */
  onDelta: (text: string) => void;
  /** A tool the engine has just finished consulting. */
  onTool: (tool: AgentToolTrace) => void;
  /** The finished turn — the same body `postAgentMessage` resolves with. */
  onDone: (response: AgentChatResponse) => void;
}

/**
 * Carries the engine's own `detail` so the panel can show its sentence rather
 * than a transport error the operator cannot act on.
 */
export class AgentStreamError extends Error {
  constructor(readonly detail: string) {
    super(detail);
    this.name = "AgentStreamError";
  }
}

/** SSE separators. A frame ends at a blank line, whatever wrote the newline. */
const FRAME_SEPARATOR = /\r?\n\r?\n/;
const LINE_SEPARATOR = /\r?\n/;

/** Read the engine's `detail` out of a refusal, falling back to its status. */
const refusalDetail = async (response: Response): Promise<string> => {
  try {
    const body = (await response.json()) as { detail?: unknown };
    if (typeof body.detail === "string" && body.detail) return body.detail;
  } catch {
    // A refusal from the proxy rather than the engine: no JSON body to read.
  }
  return `The assistant failed with HTTP ${response.status}.`;
};

/**
 * Stream one turn, reporting each step as the engine produces it.
 *
 * `fetch` rather than the shared axios instance: XHR exposes a growing
 * response string, not a stream, and the panel wants the fragment — so the
 * three things axios adds for us are re-added by hand here. The client marker
 * is one of them, and it is not optional: the proxy refuses an unsafe method
 * without it (CSRF).
 *
 * Resolves when the engine says `done`. Rejects with an `AgentStreamError` if
 * the stream ends before that, or falls silent for `AGENT_STREAM_IDLE_MS` — a
 * turn without its closing event is an unfinished answer, not a short one, and
 * a connection nothing is coming down is not a slow answer.
 */
export const streamAgentMessage = async (
  message: string,
  history: { role: "user" | "assistant"; content: string }[],
  handlers: AgentStreamHandlers,
  signal?: AbortSignal,
) => {
  const base = String(api.defaults.baseURL ?? "/api/v1").replace(/\/$/, "");
  const response = await fetch(`${base}/agent/chat/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      [LINKMESH_CLIENT_HEADER]: LINKMESH_CLIENT_VALUE,
    },
    body: JSON.stringify({ message, history }),
    signal,
  });
  if (!response.ok) throw new AgentStreamError(await refusalDetail(response));
  if (!response.body) throw new AgentStreamError("The assistant sent no reply.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finished = false;
  let stalled = false;

  // Cancelling resolves the read in flight, which is what ends the loop below;
  // the wait starts again with every frame the engine sends.
  let silence: ReturnType<typeof setTimeout> | undefined;
  const waitForMore = () => {
    clearTimeout(silence);
    silence = setTimeout(() => {
      stalled = true;
      reader.cancel().catch(() => {});
    }, AGENT_STREAM_IDLE_MS);
  };

  const consume = (frame: string) => {
    const lines = frame.split(LINE_SEPARATOR);
    const event = lines.find((line) => line.startsWith("event:"))?.slice(6).trim();
    const data = lines.find((line) => line.startsWith("data:"))?.slice(5).trim();
    // Comment frames are the connection talking; the engine opens with one.
    if (!event || !data) return;
    // One `data:` line always holds the whole payload: the engine sends JSON,
    // which cannot contain the raw newline that would split a frame.
    const payload: unknown = JSON.parse(data);
    if (event === "delta") {
      handlers.onDelta(String((payload as { text?: unknown }).text ?? ""));
    } else if (event === "tool") {
      handlers.onTool(payload as AgentToolTrace);
    } else if (event === "error") {
      throw new AgentStreamError(String((payload as { detail?: unknown }).detail ?? ""));
    } else if (event === "done") {
      finished = true;
      handlers.onDone(payload as AgentChatResponse);
    }
  };

  try {
    for (;;) {
      waitForMore();
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split(FRAME_SEPARATOR);
      // Whatever follows the last separator is a frame still being written.
      buffer = frames.pop() ?? "";
      frames.forEach(consume);
    }
    if (buffer.trim()) consume(buffer);
  } finally {
    clearTimeout(silence);
    // Let go of the connection however this ended: finished, failed, or left.
    reader.cancel().catch(() => {});
  }
  if (stalled) throw new AgentStreamError("The assistant stopped responding.");
  if (!finished) throw new AgentStreamError("The assistant stopped before it finished answering.");
};

/**
 * Execute a staged proposal against the audited REST endpoint it names.
 *
 * The path is pinned server-side to the one bulk-review route on purpose: a
 * proposal is data the panel received from a model's tool call, so the panel
 * never `POST`s anywhere the engine did not stage.
 */
export const confirmProposal = (proposal: AgentProposal) => {
  const path = proposal.endpoint.replace(/^\/api\/v1/, "");
  if (path !== "/suggestions/bulk-review-by-filter") {
    return Promise.reject(
      new Error(`unsupported proposal endpoint: ${proposal.endpoint}`),
    );
  }
  return api
    .post<FilteredBulkReviewResult>(path, proposal.payload)
    .then((r) => r.data);
};

import { AGENT_CHAT_TIMEOUT_MS, api } from "./client";
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

/** Overrides the shared client budget: see AGENT_CHAT_TIMEOUT_MS for why. */
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

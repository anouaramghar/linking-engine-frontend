import { useCallback, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import {
  getAgentStatus,
  postAgentMessage,
  type AgentProposal,
  type AgentToolTrace,
} from "../api/agent";

export interface AgentMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  /** Tools the assistant consulted to produce this turn, in call order. */
  tools?: AgentToolTrace[];
  /** Bulk rules staged for the operator to confirm (or dismiss). */
  proposals?: AgentProposal[];
}

export interface AgentTurnResult {
  prompt: string;
  assistantMessage?: AgentMessage;
}

export const MAX_AGENT_HISTORY_TURNS = 20;
export const MAX_AGENT_MESSAGES = MAX_AGENT_HISTORY_TURNS * 2;

interface UseAgentChatOptions {
  /** Defer the status request until the panel is actually visible. */
  enabled?: boolean;
}

/**
 * The side panel's transcript. Client state on purpose: the server keeps no
 * conversation memory (each request is self-contained), so there is nothing
 * for the query cache to own.
 */
export function useAgentChat({ enabled = false }: UseAgentChatOptions = {}) {
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failedMessage, setFailedMessage] = useState<string | null>(null);
  const pendingRef = useRef(false);
  const messageId = useRef(0);

  const { data: status } = useQuery({
    queryKey: ["agent-status"],
    queryFn: getAgentStatus,
    staleTime: 5 * 60 * 1000,
    enabled,
  });

  const send = useCallback(
    async (text: string): Promise<AgentTurnResult | null> => {
      const trimmed = text.trim();
      if (!trimmed || pendingRef.current) return null;
      setError(null);
      setFailedMessage(null);
      pendingRef.current = true;
      setPending(true);
      const history = messages.slice(-MAX_AGENT_MESSAGES).map((m) => ({
        role: m.role,
        content: m.content,
      }));
      const userMessage: AgentMessage = {
        id: `agent-${messageId.current++}`,
        role: "user",
        content: trimmed,
      };
      setMessages((current) => [...current, userMessage].slice(-MAX_AGENT_MESSAGES));
      try {
        const response = await postAgentMessage(trimmed, history);
        const assistantMessage: AgentMessage = {
          id: `agent-${messageId.current++}`,
          role: "assistant",
          content: response.reply,
          tools: response.tools_used,
          proposals: response.proposals,
        };
        setMessages((current) => [
          ...current,
          assistantMessage,
        ].slice(-MAX_AGENT_MESSAGES));
        return { prompt: trimmed, assistantMessage };
      } catch (cause) {
        // Keep duplicate messages intact: identify only the request that failed
        // rather than removing every equal string from the transcript.
        setMessages((current) => current.filter((m) => m.id !== userMessage.id));
        setFailedMessage(trimmed);
        const detail =
          (
            cause as { response?: { data?: { detail?: string }; status?: number } }
        ).response?.data?.detail ?? "The assistant is unavailable right now.";
        setError(detail);
        return { prompt: trimmed };
      } finally {
        pendingRef.current = false;
        setPending(false);
      }
    },
    [messages],
  );

  const retry = useCallback(() => {
    if (failedMessage) return send(failedMessage);
    return Promise.resolve(null);
  }, [failedMessage, send]);

  const clearConversation = useCallback(() => {
    setMessages([]);
    setError(null);
    setFailedMessage(null);
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return {
    messages,
    pending,
    error,
    clearError,
    retry,
    clearConversation,
    send,
    configured: status?.configured ?? null,
    model: status?.model ?? null,
  };
}

import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import {
  AgentStreamError,
  getAgentStatus,
  streamAgentMessage,
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
  /** Still being written: the turn has arrived in part, not in full. */
  streaming?: boolean;
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
 *
 * A turn is read as the engine produces it, so the transcript is written to
 * several times per reply. That is also why this is not a mutation: react-query
 * has one result per request, and a streamed turn is a sequence of them.
 */
export function useAgentChat({ enabled = false }: UseAgentChatOptions = {}) {
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failedMessage, setFailedMessage] = useState<string | null>(null);
  const pendingRef = useRef(false);
  const messageId = useRef(0);
  const streamRef = useRef<AbortController | null>(null);

  // Nothing outlives the panel: an abandoned stream would go on writing into a
  // transcript that no longer exists.
  useEffect(() => () => streamRef.current?.abort(), []);

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

      // The reply joins the log the moment it has something to show — a tool it
      // consulted, or its first words. Adding it up front instead would put an
      // empty turn under the operator's question for the seconds before the
      // model speaks, where the panel's "thinking" line belongs.
      const assistantId = `agent-${messageId.current++}`;
      let assistant: AgentMessage = {
        id: assistantId,
        role: "assistant",
        content: "",
        streaming: true,
      };
      const revise = (update: (message: AgentMessage) => AgentMessage) => {
        assistant = update(assistant);
        const revised = assistant;
        setMessages((current) =>
          current.some((m) => m.id === assistantId)
            ? current.map((m) => (m.id === assistantId ? revised : m))
            : [...current, revised].slice(-MAX_AGENT_MESSAGES),
        );
      };

      const stream = new AbortController();
      streamRef.current = stream;
      try {
        await streamAgentMessage(
          trimmed,
          history,
          {
            onDelta: (delta) => revise((m) => ({ ...m, content: m.content + delta })),
            onTool: (tool) => revise((m) => ({ ...m, tools: [...(m.tools ?? []), tool] })),
            onDone: (response) =>
              revise((m) => ({
                ...m,
                // What arrived in fragments is what the operator watched being
                // written, so it stands: replacing it would make text they had
                // already read change under them. The finished reply is for the
                // turn that streamed nothing — a provider that sends its answer
                // in one piece, or a run that ended with the retry line.
                content: m.content.trim() ? m.content : response.reply,
                tools: response.tools_used,
                proposals: response.proposals,
                streaming: false,
              })),
          },
          stream.signal,
        );
        return { prompt: trimmed, assistantMessage: assistant };
      } catch (cause) {
        // An abort is the operator's own doing (clearing the conversation);
        // there is nobody to apologise to.
        if (stream.signal.aborted) return null;
        // Keep duplicate messages intact: identify only the request that failed
        // rather than removing every equal string from the transcript. A partly
        // written reply goes with it — half an answer with a retry beside it
        // reads as an answer.
        setMessages((current) =>
          current.filter((m) => m.id !== userMessage.id && m.id !== assistantId),
        );
        setFailedMessage(trimmed);
        setError(
          cause instanceof AgentStreamError
            ? cause.detail
            : "Mesh is unavailable right now.",
        );
        return { prompt: trimmed };
      } finally {
        streamRef.current = null;
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
    // A turn still being written is part of the conversation being cleared.
    streamRef.current?.abort();
    streamRef.current = null;
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

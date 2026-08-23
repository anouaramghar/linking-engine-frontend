import { useCallback, useEffect, useId, useRef, useState } from "react";

import { BorderBeam } from "border-beam";
import type { AnimationKey } from "@bible-strong/avatar-core";
import {
  confirmProposal,
  type AgentProposal,
  type AgentProposalResult,
} from "../../api/agent";
import { useAgentChat, type AgentTurnResult } from "../../hooks/useAgentChat";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { useSession } from "../../hooks/useSession";
import AgentAvatar from "./AgentAvatar";
import AgentMarkdown from "./AgentMarkdown";
import Notice from "../Notice";

type AssistantAvatarAnimation =
  | "idle"
  | "listening"
  | "thinking"
  | "working"
  | "happy"
  | "curious"
  | "surprised"
  | "celebrate";

type AvatarReaction = Exclude<AssistantAvatarAnimation, "idle" | "listening" | "thinking" | "working">;

const AVATAR_REACTION_DURATION_MS = 2600;
const RANDOM_AVATAR_REACTIONS: readonly AvatarReaction[] = ["curious", "happy", "surprised"];
const RANDOM_AVATAR_MIN_DELAY_MS = 8000;
const RANDOM_AVATAR_MAX_DELAY_MS = 16000;

const randomAvatarDelay = () =>
  RANDOM_AVATAR_MIN_DELAY_MS +
  Math.floor(Math.random() * (RANDOM_AVATAR_MAX_DELAY_MS - RANDOM_AVATAR_MIN_DELAY_MS + 1));

const looksLikeQuestion = (text: string) => {
  const normalized = text.trim();
  return (
    /[?؟]/.test(normalized) ||
    /^(who|what|where|when|why|how|can|could|is|are|do|does|should)\b/i.test(normalized)
  );
};

function ToolTrace({ name, outcome }: { name: string; outcome: Record<string, unknown> }) {
  const summary = Object.entries(outcome)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(" · ");
  return (
    <span
      title={summary || undefined}
      className="assistant-tool-chip"
    >
      {name}
    </span>
  );
}

const describeProposal = (proposal: AgentProposal): string => {
  if (proposal.kind === "external_link_policy") {
    const siteId = proposal.endpoint.match(/\/sites\/(\d+)\//)?.[1];
    const pending = proposal.impact?.pending_count ?? 0;
    const approved = proposal.impact?.approved_count ?? 0;
    return `Update site #${siteId} external-link policy; ${pending} pending and ${approved} approved suggestions will expire`;
  }
  if (proposal.kind === "editorial_ranking_policy") {
    const siteId = proposal.endpoint.match(/\/sites\/(\d+)\//)?.[1];
    const state = proposal.payload.enabled ? "enable" : "disable";
    const weight = Math.round(Number(proposal.payload.feedback_weight) * 100);
    return `Update site #${siteId} ranking policy: ${state} editorial feedback, minimum score ${String(proposal.payload.min_score_percent)}%, ${weight}% feedback weight, after ${String(proposal.payload.min_samples)} decisions`;
  }
  if (proposal.kind === "review_suggestion") {
    const verb = proposal.payload.status === "approved" ? "Approve" : "Reject";
    const suggestionId = proposal.endpoint.split("/").pop();
    const reason =
      proposal.payload.status === "rejected" && proposal.payload.rejection_reason
        ? ` (${String(proposal.payload.rejection_reason).replaceAll("_", " ")})`
        : "";
    return `${verb} suggestion #${suggestionId}${reason}`;
  }
  if (proposal.kind === "site_job_start") {
    const ingestion = /\/sites\/\d+\/ingest$/.test(proposal.endpoint);
    const siteId = proposal.endpoint.match(/\/(?:sites|suggestions)\/(\d+)/)?.[1];
    const articles = proposal.impact?.active_article_count ?? 0;
    return `${ingestion ? "Crawl" : "Analyze"} site #${siteId}; current scope is ${articles} active article${articles === 1 ? "" : "s"}`;
  }
  if (proposal.kind === "pipeline_batch_start") {
    const sites = proposal.impact?.site_count ?? 0;
    const articles = proposal.impact?.active_article_count ?? 0;
    return `Start crawl-then-analysis pipeline for ${sites} site${sites === 1 ? "" : "s"}, currently covering ${articles} active article${articles === 1 ? "" : "s"}`;
  }
  if (proposal.kind === "pipeline_retry") {
    const match = proposal.endpoint.match(/\/batches\/(\d+)\/sites\/(\d+)\/retry$/);
    return `Retry the failed ${String(proposal.payload.expected_stage)} stage for site #${match?.[2]} in batch #${match?.[1]}`;
  }
  if (proposal.kind === "pipeline_cancel") {
    const batchId = proposal.endpoint.match(/\/batches\/(\d+)\/cancel$/)?.[1];
    const sites = proposal.impact?.site_count ?? 0;
    return `Cancel batch #${batchId} for ${sites} unfinished site${sites === 1 ? "" : "s"}`;
  }
  const rule = proposal.payload;
  const verb = rule.status === "approved" ? "Approve" : "Reject";
  const direction = rule.status === "approved" ? "at or above" : "below";
  const scope = rule.all_sites ? "every site" : `site #${String(rule.site_id)}`;
  const count =
    typeof proposal.match_count === "number" ? ` (${proposal.match_count} pending)` : "";
  return `${verb} pending suggestions ${direction} ${String(rule.threshold_percent)}% on ${scope}${count}`;
};

const sensitiveProposalWarning = (proposal: AgentProposal): string => {
  if (proposal.kind === "external_link_policy") {
    return "Sensitive change: review the impact carefully. Expired suggestions are not restored by changing the policy back.";
  }
  if (proposal.kind === "pipeline_cancel") {
    return "Sensitive action: unfinished work will stop. Completed site runs stay completed.";
  }
  return "Sensitive action: this queues connector or analysis work and may consume processing capacity.";
};

/**
 * One staged bulk rule. The Confirm button is the only writer in the whole
 * panel, and it posts the staged payload verbatim to the audited endpoint —
 * the agent never executes anything it proposes.
 */
function ProposalCard({
  proposal,
  onReaction,
}: {
  proposal: AgentProposal;
  onReaction?: (reaction: AvatarReaction) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<AgentProposalResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    setConfirming(true);
    setError(null);
    try {
      setResult(await confirmProposal(proposal));
      onReaction?.("celebrate");
    } catch (cause) {
      onReaction?.("surprised");
      setError(
        (cause as { response?: { data?: { detail?: string } } }).response?.data?.detail ??
          "The review could not be applied.",
      );
    } finally {
      setConfirming(false);
    }
  };

  return (
    <div className="assistant-proposal mt-3">
      <div className="assistant-proposal__label">Staged action</div>
      <p className="assistant-proposal__copy">{describeProposal(proposal)}</p>
      {proposal.risk === "sensitive" && result === null && (
        <p className="assistant-proposal__hint" role="note">
          {sensitiveProposalWarning(proposal)}
        </p>
      )}
      {result !== null ? (
        <p className="assistant-proposal__result" role="status">
          {result.message}
          {result.undoAvailable ? " Undo is available in the queue." : ""}
        </p>
      ) : (
        <div className="assistant-proposal__actions">
          <button
            type="button"
            onClick={() => void confirm()}
            disabled={confirming}
            className="assistant-confirm-button"
          >
            {confirming
              ? "Applying…"
              : proposal.risk === "sensitive"
                ? "Confirm sensitive change"
                : "Confirm"}
          </button>
          <span className="assistant-proposal__hint">Nothing happens until you confirm.</span>
        </div>
      )}
      {error && (
        <p role="alert" className="assistant-proposal__error">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * The operator assistant: a slide-in panel over any page.
 *
 * Read-only by contract with the backend (`app/agent_tools.py`): the assistant
 * can look at the queue, sites, jobs, graph, and metrics — it cannot approve,
 * publish, or crawl, so nothing here needs the review workflow's guards.
 */
export default function AgentPanel() {
  const { data: user } = useSession();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const [avatarOverride, setAvatarOverride] = useState<AvatarReaction | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const avatarReactionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasOpen = useRef(false);
  const stickToBottom = useRef(true);
  const titleId = useId();
  const { messages, pending, error, clearError, retry, clearConversation, send, configured } =
    useAgentChat({ enabled: open && !!user });

  // The turn currently being written, if any. It is always the last message:
  // the operator cannot send another while one is in flight.
  const lastMessage = messages[messages.length - 1];
  const streamingReply =
    lastMessage?.role === "assistant" && lastMessage.streaming ? lastMessage : null;

  const clearAvatarOverride = useCallback(() => {
    if (avatarReactionTimer.current !== null) {
      clearTimeout(avatarReactionTimer.current);
      avatarReactionTimer.current = null;
    }
    setAvatarOverride(null);
  }, []);

  const triggerAvatarReaction = useCallback((reaction: AvatarReaction) => {
    if (avatarReactionTimer.current !== null) clearTimeout(avatarReactionTimer.current);
    setAvatarOverride(reaction);
    avatarReactionTimer.current = setTimeout(() => {
      setAvatarOverride(null);
      avatarReactionTimer.current = null;
    }, AVATAR_REACTION_DURATION_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (avatarReactionTimer.current !== null) clearTimeout(avatarReactionTimer.current);
    };
  }, []);

  // When the launcher is idle, give it occasional personality without turning
  // it into a notification. The loop stops as soon as the panel opens and is
  // skipped for reduced-motion users.
  useEffect(() => {
    if (!user || open || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let randomActionTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleRandomAction = () => {
      randomActionTimer = setTimeout(() => {
        const reaction =
          RANDOM_AVATAR_REACTIONS[Math.floor(Math.random() * RANDOM_AVATAR_REACTIONS.length)];
        if (reaction) triggerAvatarReaction(reaction);
        scheduleRandomAction();
      }, randomAvatarDelay());
    };

    scheduleRandomAction();
    return () => {
      if (randomActionTimer !== null) clearTimeout(randomActionTimer);
    };
  }, [open, triggerAvatarReaction, user]);

  const handleAvatarTurnResult = useCallback(
    (result: AgentTurnResult | null) => {
      if (!result) return;
      triggerAvatarReaction(
        result.assistantMessage
          ? looksLikeQuestion(result.prompt)
            ? "curious"
            : "happy"
          : "surprised",
      );
    },
    [triggerAvatarReaction],
  );

  // Working, rather than thinking, is something the panel can now know instead
  // of timing: the engine reports each tool as it returns, so the rhythm
  // changes when the assistant actually goes and looks something up.
  const avatarAnimation: AnimationKey = pending
    ? (streamingReply?.tools?.length ?? 0) > 0
      ? "working"
      : "thinking"
    : draft.trim()
      ? "listening"
      : avatarOverride ?? "idle";

  const handleClearConversation = () => {
    clearConversation();
    clearAvatarOverride();
  };

  // Hooks stay unconditional; a signed-out visitor just renders nothing —
  // there is no principal the tools could scope by.
  const handlePanelKeyDown = useFocusTrap(panelRef, () => setOpen(false), open && !!user);

  // Restore focus to the launcher after the dialog has mounted it again.
  useEffect(() => {
    if (!open && wasOpen.current) launcherRef.current?.focus();
    wasOpen.current = open;
  }, [open]);

  // Follow new turns only when the operator was already near the end of the
  // log. A reader inspecting older context can stay there and jump forward on
  // demand instead of losing their place on every response.
  useEffect(() => {
    const log = logRef.current;
    if (!log) return;
    if (stickToBottom.current) {
      log.scrollTop = log.scrollHeight;
      setShowJumpToLatest(false);
    } else {
      setShowJumpToLatest(true);
    }
  }, [messages, pending]);

  if (!user) return null;

  const launcherNeedsClearance = ["/queue", "/selected", "/sites", "/publish"].some(
    (route) =>
      window.location.pathname === route ||
      (route === "/publish" && window.location.pathname.startsWith("/publish/")),
  );

  const submit = () => {
    const text = draft;
    if (!text.trim() || pending) return;
    setDraft("");
    clearAvatarOverride();
    void send(text).then(handleAvatarTurnResult);
  };

  const openAssistant = () => {
    clearAvatarOverride();
    setOpen(true);
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={openAssistant}
        ref={launcherRef}
        aria-label="Open assistant"
        aria-haspopup="dialog"
        className={`assistant-launcher fixed z-40 flex h-14 w-14
          items-center justify-center rounded-full ${
            launcherNeedsClearance ? "assistant-launcher--raised" : ""
          }`}
      >
        <AgentAvatar animation={avatarAnimation} className="assistant-launcher-avatar" size="100%" />
      </button>
    );
  }

  return (
    <div
      className="assistant-scrim fixed inset-0 z-50 flex justify-end"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) setOpen(false);
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={handlePanelKeyDown}
        className="assistant-panel-shell relative flex h-full min-h-0 w-full max-w-[420px] flex-col"
      >
        <div className="assistant-panel-content relative z-10 flex min-h-0 flex-1 flex-col">
          <header className="assistant-dialog-header assistant-panel-header flex flex-none items-center justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2.5">
                {/* Same heading voice as every dialog in the app: the display
                    serif, light, at the dashboard's dialog size. */}
                <h2 id={titleId} className="font-serif text-display-sm leading-none text-on-dark">
                  Assistant
                </h2>
                <span className="assistant-status-chip">
                  <span
                    aria-hidden="true"
                    className={`assistant-status-dot ${
                      configured === false
                        ? "assistant-status-dot--offline"
                        : configured === null
                          ? "assistant-status-dot--checking"
                          : ""
                    }`}
                  />
                  {configured === false ? "Offline" : configured === null ? "Checking" : "Ready"}
                </span>
              </div>
              <p className="assistant-panel-meta">Read-only · LinkMesh</p>
            </div>
            <div className="flex items-center gap-1">
              {messages.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearConversation}
                  data-modal-dismiss
                  className="assistant-header-action assistant-header-action--wide"
                >
                  Clear
                </button>
              )}
              <button
                type="button"
                onClick={() => setOpen(false)}
                data-modal-dismiss
                aria-label="Close assistant"
                className="assistant-header-action"
              >
                <svg
                  aria-hidden="true"
                  width="16"
                  height="16"
                  viewBox="0 0 16 16"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                >
                  <path d="M4 4l8 8M12 4l-8 8" />
                </svg>
              </button>
            </div>
          </header>

          {error && (
            <div className="assistant-notice-wrap">
              <Notice
                notice={{ message: error, tone: "error" }}
                onDismiss={clearError}
                onRetry={() => {
                  clearAvatarOverride();
                  void retry().then(handleAvatarTurnResult);
                }}
                retryPending={pending}
                retryLabel="Retry message"
              />
            </div>
          )}

          {configured === false ? (
            <div className="assistant-unavailable">
              <div aria-hidden="true" className="assistant-empty-mark">
                <AgentAvatar animation={avatarAnimation} className="assistant-avatar-renderer" />
              </div>
              <p className="assistant-empty-kicker">Agent offline</p>
              <p className="assistant-empty-copy">
                The assistant is not configured on this deployment. Ask an administrator to set
                an OpenRouter API key.
              </p>
            </div>
          ) : (
            <>
              {/* aria-live: a reply arrives a few characters at a time, and a
                  polite region would announce every one of them. The log goes
                  quiet while the words are landing and speaks again for the
                  finished turn, which is the announcement worth hearing. */}
              <div
                ref={logRef}
                role="log"
                aria-label="Assistant conversation"
                aria-live={streamingReply?.content ? "off" : "polite"}
                aria-relevant="additions text"
                aria-busy={pending}
                tabIndex={0}
                onScroll={() => {
                  const log = logRef.current;
                  if (!log) return;
                  const distanceFromBottom = log.scrollHeight - log.scrollTop - log.clientHeight;
                  const nearBottom = distanceFromBottom < 80;
                  stickToBottom.current = nearBottom;
                  setShowJumpToLatest(!nearBottom);
                }}
                className="assistant-conversation-log relative flex min-h-0 flex-1 flex-col gap-3
                  overflow-y-auto overscroll-contain"
              >
                {messages.length === 0 && (
                  <div className="assistant-empty-state">
                    <div aria-hidden="true" className="assistant-empty-mark">
                      <AgentAvatar animation={avatarAnimation} className="assistant-avatar-renderer" />
                    </div>
                    <p className="assistant-empty-kicker">Ask the agent</p>
                    <p className="assistant-empty-copy">
                      Ask about your sites, the review queue, running jobs, or evaluation metrics.
                      I can look things up — reviewing and publishing stay yours.
                    </p>
                    <div className="assistant-topic-strip" aria-hidden="true">
                      <span>Queue</span>
                      <span>Sites</span>
                      <span>Evaluation</span>
                    </div>
                  </div>
                )}
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={message.role === "user" ? "assistant-message-row assistant-message-row--user" : "assistant-message-row"}
                  >
                    <div
                      className={`assistant-message ${
                        message.role === "user" ? "assistant-message--user" : "assistant-message--agent"
                      }${message.streaming && message.content ? " assistant-message--streaming" : ""}`}
                    >
                      {message.role === "assistant" && (
                        <div className="assistant-message-label">
                          Agent
                          {message.tools && message.tools.length > 0 && (
                            <span className="assistant-message-label__source">· sources consulted</span>
                          )}
                        </div>
                      )}
                      {message.role === "assistant" && message.tools && message.tools.length > 0 && (
                        <div className="assistant-tool-list" aria-label="Sources consulted">
                          {message.tools.map((tool, toolIndex) => (
                            <ToolTrace
                              key={`${tool.name}-${toolIndex}`}
                              name={tool.name}
                              outcome={tool.outcome}
                            />
                          ))}
                        </div>
                      )}
                      {/* The operator's own words are shown exactly as typed; only the
                          agent writes Markdown, and only its replies are read as such. */}
                      {message.role === "assistant" ? (
                        <AgentMarkdown content={message.content} />
                      ) : (
                        <p className="whitespace-pre-wrap">{message.content}</p>
                      )}
                      {message.proposals?.map((proposal, proposalIndex) => (
                        <ProposalCard
                          key={`${proposal.tool}-${proposalIndex}`}
                          proposal={proposal}
                          onReaction={triggerAvatarReaction}
                        />
                      ))}
                    </div>
                  </div>
                ))}
                {/* Only until the reply starts landing: once words are
                    arriving, they say what this line was standing in for. */}
                {pending && !streamingReply?.content && (
                  <div role="status" className="assistant-thinking">
                    <span aria-hidden="true" className="assistant-thinking__avatar">
                      <AgentAvatar animation={avatarAnimation} size={28} />
                    </span>
                    <span className="assistant-thinking__copy">
                      {avatarAnimation === "working"
                        ? "Assistant is working…"
                        : "Assistant is thinking…"}
                    </span>
                  </div>
                )}
                {showJumpToLatest && (
                  <button
                    type="button"
                    onClick={() => {
                      const log = logRef.current;
                      if (!log) return;
                      stickToBottom.current = true;
                      log.scrollTop = log.scrollHeight;
                      setShowJumpToLatest(false);
                    }}
                    className="assistant-jump-button"
                  >
                    Jump to latest
                  </button>
                )}
              </div>

              <form
                className="assistant-composer safe-area-bottom flex-none"
                onSubmit={(event) => {
                  event.preventDefault();
                  submit();
                }}
              >
                  <BorderBeam size="pulse-inner" theme="dark">
                    <div className="assistant-composer-field">
                      <textarea
                        aria-label="Message the assistant"
                        rows={1}
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" && !event.shiftKey) {
                            event.preventDefault();
                            submit();
                          }
                        }}
                        placeholder="Ask about your linking engine…"
                        className="assistant-composer-input"
                      />
                      <button
                        type="submit"
                        aria-label="Send"
                        disabled={pending || !draft.trim()}
                        className="assistant-send-button"
                      >
                        <svg
                          aria-hidden="true"
                          width="16"
                          height="16"
                          viewBox="0 0 16 16"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.4"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M2.5 8h10" />
                          <path d="m8.5 4 4 4-4 4" />
                        </svg>
                      </button>
                    </div>
                  </BorderBeam>
                <div className="assistant-composer-hint">
                  <span>Enter to send</span>
                  <span>Shift + Enter for new line</span>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

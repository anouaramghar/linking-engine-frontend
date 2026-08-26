import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import { useQueryClient } from "@tanstack/react-query";
import { BorderBeam } from "border-beam";
import type { AnimationKey } from "@bible-strong/avatar-core";
import {
  confirmProposal,
  issueMcpActionReceipt,
  previewMcpAction,
  type AgentActionPreview,
  type AgentActionReceipt,
  type AgentProposal,
  type AgentProposalKind,
  type AgentProposalResult,
  type AgentToolTrace,
} from "../../api/agent";
import { useAgentChat, type AgentTurnResult } from "../../hooks/useAgentChat";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import type { ResolvedTheme } from "../../hooks/useTheme";
import { useSession } from "../../hooks/useSession";
import AgentAvatar from "./AgentAvatar";
import AgentMarkdown from "./AgentMarkdown";
import { getAgentViewContext } from "./agentContext";
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

/** How much of the model's current thought the waiting line shows. */
const THINKING_TAIL_CHARS = 140;

const actionEnvelopeFromFragment = () => {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  return params.get("mcp-action");
};

const looksLikeQuestion = (text: string) => {
  const normalized = text.trim();
  return (
    /[?؟]/.test(normalized) ||
    /^(who|what|where|when|why|how|can|could|is|are|do|does|should)\b/i.test(normalized)
  );
};

const WEEKDAY_LABELS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function ToolTrace({ name, outcome }: { name: string; outcome: Record<string, unknown> }) {
  const summary = Object.entries(outcome)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(" · ");
  return (
    <span title={summary || undefined} className="assistant-tool-chip">
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
  if (proposal.kind === "site_create") {
    return `Connect ${String(proposal.payload.name)} at ${String(proposal.payload.base_url)} as ${String(proposal.payload.platform)}`;
  }
  if (proposal.kind === "site_bulk_create") {
    const sites = proposal.impact?.site_count ?? 0;
    const wordpress = proposal.impact?.wordpress_count ?? 0;
    const html = proposal.impact?.html_count ?? 0;
    return `Connect ${sites} managed sites: ${wordpress} WordPress and ${html} HTML`;
  }
  if (proposal.kind === "site_job_start") {
    const ingestion = /\/sites\/\d+\/ingest$/.test(proposal.endpoint);
    const siteId = proposal.endpoint.match(/\/(?:sites|suggestions)\/(\d+)/)?.[1];
    const articles = proposal.impact?.active_article_count ?? 0;
    return `${ingestion ? "Crawl" : "Analyze"} site #${siteId}; current scope is ${articles} active article${articles === 1 ? "" : "s"}`;
  }
  if (proposal.kind === "site_schedule_update") {
    const siteId = proposal.endpoint.match(/\/sites\/(\d+)\/schedule$/)?.[1];
    const site = proposal.context?.site_name ?? `site #${siteId}`;
    if (!proposal.payload.enabled) return `Pause automatic refresh for ${String(site)}`;
    const weekday = Number(proposal.payload.weekday);
    const cadence =
      proposal.payload.cadence === "weekly"
        ? `weekly on ${WEEKDAY_LABELS[weekday] ?? `weekday ${String(proposal.payload.weekday)}`}`
        : "daily";
    const nextRun =
      typeof proposal.context?.next_run_at === "string"
        ? `; next run ${proposal.context.next_run_at}`
        : "";
    return `Schedule ${String(site)} refresh ${cadence} at ${String(proposal.payload.local_time)} ${String(proposal.payload.timezone)}${nextRun}`;
  }
  if (proposal.kind === "article_analysis_start") {
    const articleId = proposal.context?.article_id;
    const title = proposal.context?.article_title;
    const site = proposal.context?.site_name;
    const remaining = proposal.impact?.remaining_slots_for_article ?? 0;
    return `Generate suggestions for ${String(title)} (article #${String(articleId)}) on ${String(site)}; up to ${remaining} slot${remaining === 1 ? "" : "s"} remain`;
  }
  if (proposal.kind === "alert_acknowledgement") {
    const alertId = proposal.context?.alert_id;
    const subject = proposal.context?.alert_subject;
    const site = proposal.context?.site_name;
    const occurrences = proposal.impact?.occurrence_count ?? 1;
    const siteScope = site ? ` for ${String(site)}` : "";
    return `Acknowledge “${String(subject)}” (alert #${String(alertId)})${siteScope}; ${occurrences} occurrence${occurrences === 1 ? "" : "s"} through ${String(proposal.payload.expected_last_seen_at)}`;
  }
  if (proposal.kind === "pool_source_action") {
    const action = String(proposal.context?.action);
    const site = proposal.context?.site_name;
    const siteId = proposal.context?.site_id;
    const label = action === "approve" ? "Approve" : action === "revoke" ? "Revoke" : "Reactivate";
    const pending = proposal.impact?.pending_count ?? 0;
    const approved = proposal.impact?.approved_count ?? 0;
    const impact =
      action === "revoke"
        ? `; ${pending} pending and ${approved} approved suggestions will expire`
        : "";
    return `${label} content-pool source ${String(site)} (site #${String(siteId)})${impact}`;
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
  if (proposal.kind === "site_schedule_update") {
    return "Sensitive action: this changes future crawl-and-analysis runs. It does not publish and does not interrupt work already running.";
  }
  if (proposal.kind === "site_create" || proposal.kind === "site_bulk_create") {
    return "Sensitive action: this registers external site URLs. No credentials are attached and no crawl starts until separately confirmed.";
  }
  if (proposal.kind === "alert_acknowledgement") {
    return "This marks the notification read; it does not fix the underlying issue. A newer occurrence will block this confirmation.";
  }
  if (proposal.kind === "pool_source_action") {
    if (proposal.context?.action === "revoke") {
      return "Sensitive action: affected pending and approved suggestions will expire and are not restored by approving the source again.";
    }
    return "Sensitive action: this changes whether a shared content source may participate in future ingestion and linking work; it does not start a crawl.";
  }
  return "Sensitive action: this queues connector or analysis work and may consume processing capacity.";
};

const PROPOSAL_IMPACT_LABELS: Record<string, string> = {
  pending_count: "Pending",
  approved_count: "Approved",
  rejected_count: "Rejected",
  expiring_count: "Expiring",
  active_article_count: "Active articles",
  active_suggestion_count: "Active suggestions",
  remaining_slots_for_article: "Open slots",
  site_count: "Sites",
  article_count: "Articles",
  wordpress_count: "WordPress",
  html_count: "HTML",
  occurrence_count: "Occurrences",
  unfinished_site_count: "Unfinished sites",
};

const proposalImpactFacts = (proposal: AgentProposal) => {
  const facts: Array<{ label: string; value: string }> = [];
  if (typeof proposal.match_count === "number") {
    facts.push({ label: "Matches", value: `${proposal.match_count} pending` });
  }
  for (const [key, value] of Object.entries(proposal.impact ?? {})) {
    const label = PROPOSAL_IMPACT_LABELS[key];
    if (!label || !Number.isFinite(value)) continue;
    facts.push({ label, value: String(value) });
  }
  return facts.slice(0, 4);
};

interface BlockedActionDetails {
  title: string;
  explanation: string;
  nextStep: string;
  href?: string;
  hrefLabel?: string;
}

const displaySiteName = (outcome: Record<string, unknown>) =>
  typeof outcome.site_name === "string" && outcome.site_name.trim()
    ? outcome.site_name
    : "this site";

const displayBlockedReason = (reason: string) =>
  `${reason.charAt(0).toUpperCase()}${reason.slice(1)}${reason.endsWith(".") ? "" : "."}`;

const siteQueueHref = (outcome: Record<string, unknown>) => {
  const siteId = Number(outcome.site_id);
  return Number.isInteger(siteId) && siteId > 0
    ? `/queue?site=${encodeURIComponent(String(siteId))}`
    : "/queue";
};

const blockedActionDetails = (tool: AgentToolTrace): BlockedActionDetails | null => {
  const { outcome } = tool;
  if (outcome.ready !== false || typeof outcome.blocked_reason !== "string") return null;

  const siteName = displaySiteName(outcome);
  const reason = displayBlockedReason(outcome.blocked_reason);

  if (
    (tool.name === "preview_site_job" && outcome.kind === "analysis") ||
    tool.name === "preview_article_analysis"
  ) {
    const siteSlots = outcome.suggestion_capacity_slots_available;
    const articleSlots = outcome.remaining_slots_for_article;
    const capacityIsFull =
      (siteSlots === 0 || articleSlots === 0) && /capacity/i.test(outcome.blocked_reason);
    if (capacityIsFull) {
      const activeSuggestions = outcome.active_suggestion_count;
      const occupied =
        Number.isInteger(activeSuggestions) && Number(activeSuggestions) >= 0
          ? `The site has ${String(activeSuggestions)} active suggestions and no open suggestion slots.`
          : "The site has no open suggestion slots.";
      return {
        title: `Suggestion capacity is full for ${siteName}`,
        explanation: occupied,
        nextStep:
          "Reject pending suggestions or publish approved ones to free capacity, then run analysis again.",
        href: siteQueueHref(outcome),
        hrefLabel: "Review suggestions",
      };
    }
  }

  if (
    tool.name === "preview_site_job" &&
    outcome.kind === "analysis" &&
    outcome.active_article_count === 0
  ) {
    return {
      title: `No active articles in ${siteName}`,
      explanation: reason,
      nextStep: "Crawl the site first, then run analysis again.",
      href: "/sites",
      hrefLabel: "Open sites",
    };
  }

  if (tool.name === "preview_site_job" && outcome.kind === "analysis") {
    return {
      title: `Analysis is not available for ${siteName}`,
      explanation: reason,
      nextStep: "Wait for the current analysis to finish, then run analysis again.",
    };
  }

  if (tool.name === "preview_site_job" && outcome.kind === "ingestion") {
    return {
      title: `Crawl is not available for ${siteName}`,
      explanation: reason,
      nextStep: "Wait for the current crawl to finish, then try again.",
    };
  }

  return {
    title: "This action is not available yet",
    explanation: reason,
    nextStep: "Resolve the condition above, then ask Mesh to try again.",
  };
};

function BlockedActionCard({ tool }: { tool: AgentToolTrace }) {
  const details = blockedActionDetails(tool);
  if (!details) return null;

  return (
    <section className="assistant-proposal assistant-proposal--blocked mt-3" role="status">
      <div className="assistant-proposal__label">Action unavailable</div>
      <p className="assistant-proposal__copy">{details.title}</p>
      <p className="assistant-proposal__blocked-reason">{details.explanation}</p>
      <p className="assistant-proposal__hint">
        No confirmation is available because this action was not staged. {details.nextStep}
      </p>
      {details.href && details.hrefLabel && (
        <div className="assistant-proposal__actions">
          <a
            href={details.href}
            className="assistant-secondary-button assistant-secondary-button--link"
          >
            {details.hrefLabel}
          </a>
        </div>
      )}
    </section>
  );
}

/**
 * What a confirmed action makes stale.
 *
 * The panel writes from above the routes, so nothing it changes belongs to the
 * page the operator happens to be looking at. Without this the rail badge, the
 * queue chips and the site rows all keep the numbers they held before the
 * confirmation, and the only way to see the work land was to navigate away and
 * back. Each entry is a key prefix, so `["suggestions"]` also covers the counts
 * and the paginated queue beneath it.
 *
 * Keyed by kind rather than by endpoint, because the kind is what
 * `confirmProposal` allowlists — a new action cannot reach the server without
 * first appearing here.
 */
const AFFECTED_QUERIES: Record<AgentProposalKind, readonly (readonly string[])[]> = {
  bulk_review: [["suggestions"], ["suggestion-events"], ["publish", "pending"]],
  review_suggestion: [["suggestions"], ["suggestion-events"], ["publish", "pending"]],
  editorial_ranking_policy: [["editorial-ranking-policy"], ["sites"]],
  // A changed external-link rule re-scores what the queue may offer, so the
  // rows and their counts move although no suggestion was reviewed.
  external_link_policy: [["external-link-policy"], ["suggestions"]],
  site_schedule_update: [["site-schedule"], ["sites"], ["jobs", "active"]],
  // A started job appears as an activity row first. Its output arrives later,
  // through the active-jobs feed that refreshes the numbers again then.
  site_job_start: [["jobs"], ["sites"]],
  article_analysis_start: [["jobs"], ["sites"], ["suggestions"]],
  pipeline_batch_start: [["pipeline-batch"], ["jobs"], ["sites"], ["suggestions"]],
  pipeline_retry: [["pipeline-batch"], ["jobs"], ["sites"], ["suggestions"]],
  pipeline_cancel: [["pipeline-batch"], ["jobs"], ["sites"]],
  site_create: [["sites"], ["jobs"], ["publish", "pending"]],
  site_bulk_create: [["sites"], ["jobs"], ["publish", "pending"]],
  alert_acknowledgement: [["alerts"]],
  pool_source_action: [["sites"], ["pool-audit"], ["jobs"]],
};

/**
 * One staged bulk rule. The Confirm button is the only writer in the whole
 * panel, and it posts the staged payload verbatim to the audited endpoint —
 * the agent never executes anything it proposes.
 */
function ProposalCard({
  proposal,
  result,
  onConfirmed,
  onReaction,
}: {
  proposal: AgentProposal;
  result: AgentProposalResult | null;
  onConfirmed: (result: AgentProposalResult) => void;
  onReaction?: (reaction: AvatarReaction) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const qc = useQueryClient();
  const impactFacts = proposalImpactFacts(proposal);

  const confirm = async () => {
    setConfirming(true);
    setError(null);
    try {
      const confirmed = await confirmProposal(proposal);
      onConfirmed(confirmed);
      // Only after the write is acknowledged, and never awaited: the refetches
      // it starts belong to the rest of the dashboard, so waiting for them
      // would hold this button busy — and a failed refetch would then be
      // reported as a failed confirmation, which it is not.
      for (const queryKey of AFFECTED_QUERIES[proposal.kind] ?? []) {
        void qc.invalidateQueries({ queryKey });
      }
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
      <div className="assistant-proposal__facts" aria-label="Action impact">
        <div>
          <span>Risk</span>
          <strong>{proposal.risk === "sensitive" ? "Sensitive" : "Reversible"}</strong>
        </div>
        {impactFacts.map(({ label, value }) => (
          <div key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
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

function McpActionCard({
  envelope,
  preview,
  loading,
  loadError,
  onDismiss,
  onReaction,
}: {
  envelope: string;
  preview: AgentActionPreview | null;
  loading: boolean;
  loadError: string | null;
  onDismiss: () => void;
  onReaction: (reaction: AvatarReaction) => void;
}) {
  const [issuing, setIssuing] = useState(false);
  const [receipt, setReceipt] = useState<AgentActionReceipt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const issue = async () => {
    if (!preview) return;
    setIssuing(true);
    setError(null);
    try {
      setReceipt(await issueMcpActionReceipt(envelope, preview.proposal_hash));
      onReaction("celebrate");
    } catch (cause) {
      onReaction("surprised");
      setError(
        (cause as { response?: { data?: { detail?: string } } }).response?.data?.detail ??
          "Mesh could not issue the receipt. Preview the action again from your MCP client.",
      );
    } finally {
      setIssuing(false);
    }
  };

  return (
    <section className="assistant-proposal assistant-mcp-action" aria-label="MCP action review">
      <div className="assistant-proposal__label">MCP action review</div>
      {loading && (
        <p className="assistant-proposal__copy" role="status">
          Checking the signed preview…
        </p>
      )}
      {loadError && (
        <p className="assistant-proposal__error" role="alert">
          {loadError}
        </p>
      )}
      {preview && !receipt && (
        <>
          <p className="assistant-proposal__copy">{describeProposal(preview.proposal)}</p>
          <p className="assistant-proposal__hint">
            Requested by {preview.originating_scope}. The receipt works only for that exact MCP
            identity and expires shortly after issuance.
          </p>
          {preview.proposal.risk === "sensitive" && (
            <p className="assistant-proposal__hint" role="note">
              {sensitiveProposalWarning(preview.proposal)}
            </p>
          )}
          <div className="assistant-proposal__actions">
            <button
              type="button"
              onClick={() => void issue()}
              disabled={issuing}
              className="assistant-confirm-button"
            >
              {issuing ? "Issuing…" : "Confirm and issue receipt"}
            </button>
            <button type="button" onClick={onDismiss} className="assistant-secondary-button">
              Decline
            </button>
          </div>
        </>
      )}
      {receipt && (
        <div className="assistant-receipt" role="status">
          <p className="assistant-proposal__copy">Receipt ready</p>
          <p className="assistant-proposal__hint">
            Copy it back to your MCP client. It can be used once and expires at{" "}
            {new Date(receipt.expires_at).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            })}.
          </p>
          <code className="assistant-receipt__code">{receipt.receipt}</code>
          <div className="assistant-proposal__actions">
            <button
              type="button"
              className="assistant-confirm-button"
              onClick={() => {
                setError(null);
                if (!navigator.clipboard) {
                  setError("Clipboard access is unavailable. Select and copy the receipt above.");
                  return;
                }
                void navigator.clipboard
                  .writeText(receipt.receipt)
                  .then(() => {
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 2000);
                  })
                  .catch(() => {
                    setError(
                      "The browser blocked clipboard access. Select and copy the receipt above.",
                    );
                  });
              }}
            >
              {copied ? "Copied" : "Copy receipt"}
            </button>
            <button type="button" onClick={onDismiss} className="assistant-secondary-button">
              Done
            </button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="assistant-proposal__error">
          {error}
        </p>
      )}
    </section>
  );
}

/**
 * The operator assistant: a slide-in panel over any page.
 *
 * Dashboard chat uses the read-only registry. Its proposal cards execute only
 * after a click; signed MCP links use the separate one-time receipt flow.
 */
interface AgentPanelProps {
  /** The shell owns the theme hook so the beam follows explicit preferences. */
  resolvedTheme?: ResolvedTheme;
  /** Passed by the shell so the panel follows route changes without owning navigation. */
  currentPath?: string;
  currentSearch?: string;
}

export default function AgentPanel({
  resolvedTheme = "light",
  currentPath,
  currentSearch,
}: AgentPanelProps) {
  const { data: user } = useSession();
  const [mcpEnvelope, setMcpEnvelope] = useState<string | null>(actionEnvelopeFromFragment);
  const [open, setOpen] = useState(mcpEnvelope !== null);
  const [proposalResults, setProposalResults] = useState<Record<string, AgentProposalResult>>({});
  const [draft, setDraft] = useState("");
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const [avatarOverride, setAvatarOverride] = useState<AvatarReaction | null>(null);
  const [mcpPreview, setMcpPreview] = useState<AgentActionPreview | null>(null);
  const [mcpLoading, setMcpLoading] = useState(mcpEnvelope !== null);
  const [mcpError, setMcpError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const avatarReactionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasOpen = useRef(false);
  const stickToBottom = useRef(true);
  const titleId = useId();
  const viewContext = useMemo(
    () =>
      getAgentViewContext(
        currentPath ?? (typeof window === "undefined" ? "/" : window.location.pathname),
        currentSearch ?? (typeof window === "undefined" ? "" : window.location.search),
      ),
    [currentPath, currentSearch],
  );
  const agentChatContext = useMemo(
    () => ({
      surface: viewContext.surface,
      path: viewContext.path,
      search: viewContext.search,
      scope: viewContext.scope,
      filters: viewContext.filters,
    }),
    [viewContext.filters, viewContext.path, viewContext.scope, viewContext.search, viewContext.surface],
  );
  const {
    messages,
    reasoning,
    pending,
    error,
    failedMessage,
    clearError,
    retry,
    cancel,
    clearConversation,
    send,
    configured,
  } = useAgentChat({ enabled: open && !!user, context: agentChatContext });

  // The turn currently being written, if any. It is always the last message:
  // the operator cannot send another while one is in flight.
  const lastMessage = messages[messages.length - 1];
  const streamingReply =
    lastMessage?.role === "assistant" && lastMessage.streaming ? lastMessage : null;

  // The end of what the model is thinking, on one line. The tail rather than
  // the head because the head stops changing: what makes the wait readable is
  // seeing the sentence it is on now, and a reasoning model can spend twenty
  // seconds there before its first word of reply.
  const thinkingTail = useMemo(() => {
    const flattened = reasoning.replace(/\s+/g, " ").trim();
    if (!flattened) return "";
    return flattened.length > THINKING_TAIL_CHARS
      ? `…${flattened.slice(-THINKING_TAIL_CHARS)}`
      : flattened;
  }, [reasoning]);

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

  useEffect(() => {
    if (!user || !mcpEnvelope) return;

    // Fragments never reach the server or referrer, and removing it here keeps
    // browser history and screenshots from retaining staged action material.
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    void previewMcpAction(mcpEnvelope)
      .then(setMcpPreview)
      .catch((cause) => {
        setMcpError(
          (cause as { response?: { data?: { detail?: string } } }).response?.data?.detail ??
            "Mesh could not verify this action link. Ask the MCP client for a fresh preview.",
        );
      })
      .finally(() => setMcpLoading(false));
  }, [mcpEnvelope, user]);

  const handleAvatarTurnResult = useCallback(
    (result: AgentTurnResult | null) => {
      if (!result || result.cancelled) return;
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

  const avatarAnimation: AnimationKey = pending
    ? (streamingReply?.tools?.length ?? 0) > 0
      ? "working"
      : "thinking"
    : draft.trim()
      ? "listening"
      : avatarOverride ?? "idle";

  const handleClearConversation = () => {
    clearConversation();
    setProposalResults({});
    clearAvatarOverride();
  };

  const rememberProposalResult = useCallback((proposalKey: string, result: AgentProposalResult) => {
    setProposalResults((current) => ({ ...current, [proposalKey]: result }));
  }, []);

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

  const submitMessage = (text: string) => {
    if (!text.trim() || pending) return;
    setDraft("");
    clearAvatarOverride();
    void send(text).then(handleAvatarTurnResult);
  };

  const submit = () => submitMessage(draft);

  const stopGenerating = () => {
    clearAvatarOverride();
    cancel();
  };

  const editFailedMessage = () => {
    if (!failedMessage) return;
    setDraft(failedMessage);
    clearError();
    window.setTimeout(() => inputRef.current?.focus(), 0);
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
        aria-label="Open Mesh"
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
                <h2 id={titleId} className="font-serif text-display-sm leading-none text-ink">
                  Mesh
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
              <p className="assistant-panel-meta">Review &amp; operations · LinkMesh</p>
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
                aria-label="Close Mesh"
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
              {failedMessage && (
                <button
                  type="button"
                  className="assistant-recovery-action"
                  onClick={editFailedMessage}
                >
                  Edit failed question
                </button>
              )}
            </div>
          )}

          {mcpEnvelope && (
            <div className="assistant-mcp-wrap">
              <McpActionCard
                envelope={mcpEnvelope}
                preview={mcpPreview}
                loading={mcpLoading}
                loadError={mcpError}
                onReaction={triggerAvatarReaction}
                onDismiss={() => {
                  setMcpEnvelope(null);
                  setMcpPreview(null);
                  setMcpError(null);
                }}
              />
            </div>
          )}

          {configured === false ? (
            <div className="assistant-unavailable">
              <div aria-hidden="true" className="assistant-empty-mark">
                <AgentAvatar animation={avatarAnimation} className="assistant-avatar-renderer" />
              </div>
              <p className="assistant-empty-kicker">Mesh offline</p>
              <p className="assistant-empty-copy">
                Mesh is not configured on this deployment. Ask an administrator to set
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
                aria-label="Mesh conversation"
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
                    <p className="assistant-empty-kicker">Ask Mesh</p>
                    <p className="assistant-empty-copy">
                      Ask about your sites, the review queue, running jobs, or evaluation metrics.
                      I can look things up, reviewing and publishing stay yours.
                    </p>
                    <div
                      className="assistant-suggestion-list"
                      role="group"
                      aria-label="Suggested questions"
                    >
                      {viewContext.suggestions.map(({ label, prompt }) => (
                        <button
                          key={prompt}
                          type="button"
                          onClick={() => submitMessage(prompt)}
                          disabled={pending}
                          aria-label={prompt}
                          className="assistant-suggestion"
                        >
                          <span className="assistant-suggestion__content">
                            <span className="assistant-suggestion__label">{label}</span>
                            <span className="assistant-suggestion__prompt">{prompt}</span>
                          </span>
                          <svg
                            aria-hidden="true"
                            className="assistant-suggestion__arrow"
                            width="16"
                            height="16"
                            viewBox="0 0 16 16"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.4"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M3 8h9" />
                            <path d="m8.5 4 4 4-4 4" />
                          </svg>
                        </button>
                      ))}
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
                      }${message.streaming && message.content ? " assistant-message--streaming" : ""}${
                        message.cancelled ? " assistant-message--cancelled" : ""
                      }`}
                    >
                      {message.role === "assistant" && (
                        <div className="assistant-message-label">
                          Mesh
                          {message.cancelled && (
                            <span className="assistant-message-label__source">· stopped</span>
                          )}
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
                      {message.cancelled && (
                        <p className="assistant-message__cancelled-copy">
                          Stopped before Mesh finished the answer.
                        </p>
                      )}
                      {message.proposals?.map((proposal, proposalIndex) => {
                        const proposalKey = `${message.id}:${String(proposalIndex)}`;
                        return (
                          <ProposalCard
                            key={proposalKey}
                            proposal={proposal}
                            result={proposalResults[proposalKey] ?? null}
                            onConfirmed={(result) => rememberProposalResult(proposalKey, result)}
                            onReaction={triggerAvatarReaction}
                          />
                        );
                      })}
                      {!message.streaming &&
                        message.tools?.map((tool, toolIndex) => (
                          <BlockedActionCard
                            key={`blocked-${tool.name}-${toolIndex}`}
                            tool={tool}
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
                    <span className="assistant-thinking__lines">
                      <span className="assistant-thinking__copy">
                        {avatarAnimation === "working"
                          ? "Mesh is working…"
                          : "Mesh is thinking…"}
                      </span>
                      {/* The model's own draft, moving while it works. Hidden
                          from assistive technology on purpose: this is a live
                          region, and announcing a scratchpad that rewrites
                          itself every few hundred milliseconds would bury the
                          one sentence above that is worth hearing. */}
                      {thinkingTail && (
                        <span aria-hidden="true" className="assistant-thinking__thought">
                          {thinkingTail}
                        </span>
                      )}
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
                  <BorderBeam size="pulse-inner" theme={resolvedTheme}>
                    <div className="assistant-composer-field">
                      <textarea
                        ref={inputRef}
                        aria-label="Message Mesh"
                        rows={1}
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" && !event.shiftKey) {
                            event.preventDefault();
                            submit();
                          }
                        }}
                        placeholder="Ask Mesh about your linking engine…"
                        className="assistant-composer-input"
                      />
                      {pending ? (
                        <button
                          type="button"
                          aria-label="Stop generating"
                          title="Stop generating"
                          onClick={stopGenerating}
                          className="assistant-stop-button"
                        >
                          <svg
                            aria-hidden="true"
                            width="16"
                            height="16"
                            viewBox="0 0 16 16"
                            fill="none"
                          >
                            <rect x="4" y="4" width="8" height="8" rx="1" fill="currentColor" />
                          </svg>
                        </button>
                      ) : (
                        <button
                          type="submit"
                          aria-label="Send"
                          disabled={!draft.trim()}
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
                      )}
                    </div>
                  </BorderBeam>
                <div className="assistant-composer-hint">
                  <span>Mesh inspects and stages changes · you confirm writes</span>
                  <span>Enter to send · Shift + Enter for a new line</span>
                </div>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

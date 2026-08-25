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

export type AgentProposalKind =
  | "bulk_review"
  | "review_suggestion"
  | "editorial_ranking_policy"
  | "external_link_policy"
  | "site_schedule_update"
  | "site_job_start"
  | "pipeline_batch_start"
  | "pipeline_retry"
  | "pipeline_cancel"
  | "site_create"
  | "site_bulk_create"
  | "article_analysis_start"
  | "alert_acknowledgement"
  | "pool_source_action";
export type AgentProposalRisk = "reversible" | "sensitive";

/** A typed, allowlisted mutation awaiting the editor's confirmation. */
export interface AgentProposal {
  tool: string;
  kind: AgentProposalKind;
  risk: AgentProposalRisk;
  method: "POST" | "PUT" | "DELETE";
  endpoint: string;
  payload: Record<string, unknown>;
  match_count?: number | null;
  context?: Record<string, string | number | boolean | null>;
  impact?: Record<string, number>;
}

export interface AgentProposalResult {
  message: string;
  undoAvailable: boolean;
}

export interface AgentActionPreview {
  proposal: AgentProposal;
  proposal_hash: string;
  envelope_expires_at: string;
  originating_scope: string;
  requires_admin: boolean;
}

export interface AgentActionReceipt {
  receipt: string;
  expires_at: string;
  proposal_hash: string;
}

export const previewMcpAction = (envelope: string) =>
  api
    .post<AgentActionPreview>("/agent-actions/preview", { envelope })
    .then((response) => response.data);

export const issueMcpActionReceipt = (envelope: string, expectedProposalHash: string) =>
  api
    .post<AgentActionReceipt>("/agent-actions/receipts", {
      envelope,
      expected_proposal_hash: expectedProposalHash,
    })
    .then((response) => response.data);

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

/**
 * The dashboard view the operator was looking at when they asked a question.
 * It is optional so older engines can keep accepting the original chat body
 * while the UI grows a more useful scope contract.
 */
export interface AgentChatContext {
  surface: string;
  path: string;
  search: string;
  scope: string;
  filters?: Record<string, string>;
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
  context?: AgentChatContext,
) =>
  api
    .post<AgentChatResponse>(
      "/agent/chat",
      { message, history, ...(context ? { context } : {}) },
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
  return `Mesh failed with HTTP ${response.status}.`;
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
  context?: AgentChatContext,
) => {
  const base = String(api.defaults.baseURL ?? "/api/v1").replace(/\/$/, "");
  const response = await fetch(`${base}/agent/chat/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      [LINKMESH_CLIENT_HEADER]: LINKMESH_CLIENT_VALUE,
    },
    body: JSON.stringify({ message, history, ...(context ? { context } : {}) }),
    signal,
  });
  if (!response.ok) throw new AgentStreamError(await refusalDetail(response));
  if (!response.body) throw new AgentStreamError("Mesh sent no reply.");

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
  if (stalled) throw new AgentStreamError("Mesh stopped responding.");
  if (!finished) throw new AgentStreamError("Mesh stopped before finishing the answer.");
};

/**
 * Execute a staged proposal against the audited REST endpoint it names.
 *
 * Proposal data came through a model turn, so both the action kind and exact
 * REST shape are allowlisted here. The model cannot turn an endpoint string
 * into an arbitrary authenticated dashboard request.
 */
export const confirmProposal = async (
  proposal: AgentProposal,
): Promise<AgentProposalResult> => {
  const path = proposal.endpoint.replace(/^\/api\/v1/, "");
  const positiveIntegerList = (value: unknown): value is number[] =>
    Array.isArray(value) && value.every((item) => Number.isInteger(item) && Number(item) > 0);
  const sortedUniqueIntegerList = (value: unknown): value is number[] =>
    positiveIntegerList(value) &&
    value.every((item, index) => index === 0 || Number(value[index - 1]) < item);
  const hasOnlyKeys = (value: Record<string, unknown>, allowed: readonly string[]) =>
    Object.keys(value).every((key) => allowed.includes(key));
  const isIsoTimestamp = (value: unknown): value is string =>
    typeof value === "string" && value.trim() !== "" && !Number.isNaN(Date.parse(value));
  const isScheduleTime = (value: unknown): value is string =>
    typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value);
  const validScheduleSnapshot = (value: unknown): value is Record<string, unknown> => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
    const snapshot = value as Record<string, unknown>;
    if (!hasOnlyKeys(snapshot, ["exists", "enabled", "cadence", "weekday", "local_time", "timezone"])) {
      return false;
    }
    if (snapshot.exists === false) return Object.keys(snapshot).length === 1;
    return (
      snapshot.exists === true &&
      typeof snapshot.enabled === "boolean" &&
      (snapshot.cadence === "daily" || snapshot.cadence === "weekly") &&
      (snapshot.weekday === null || (Number.isInteger(snapshot.weekday) && Number(snapshot.weekday) >= 0 && Number(snapshot.weekday) <= 6)) &&
      ((snapshot.cadence === "daily" && snapshot.weekday === null) ||
        (snapshot.cadence === "weekly" && snapshot.weekday !== null)) &&
      isScheduleTime(snapshot.local_time) &&
      typeof snapshot.timezone === "string" &&
      snapshot.timezone.trim() !== "" &&
      snapshot.timezone.length <= 64
    );
  };
  const validManagedSite = (value: unknown): value is Record<string, unknown> => {
    if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
    const site = value as Record<string, unknown>;
    if (
      !hasOnlyKeys(site, ["name", "base_url", "platform"]) ||
      typeof site.name !== "string" ||
      !site.name.trim() ||
      site.name.length > 255 ||
      typeof site.base_url !== "string" ||
      (site.platform !== "wordpress" && site.platform !== "html")
    ) {
      return false;
    }
    try {
      const parsed = new URL(site.base_url);
      return (parsed.protocol === "http:" || parsed.protocol === "https:") &&
        !site.base_url.endsWith("/");
    } catch {
      return false;
    }
  };
  if (
    proposal.tool === "preview_bulk_review" &&
    proposal.kind === "bulk_review" &&
    proposal.risk === "reversible" &&
    proposal.method === "POST" &&
    path === "/suggestions/bulk-review-by-filter"
  ) {
    const status = proposal.payload.status;
    if (
      (status !== "approved" && status !== "rejected") ||
      proposal.payload.match_status !== "pending"
    ) {
      throw new Error("unsupported bulk review payload");
    }
    const result = await api
      .post<FilteredBulkReviewResult>(path, proposal.payload)
      .then((r) => r.data);
    return {
      message: `Applied: ${result.reviewed} reviewed${
        result.skipped > 0 ? `, ${result.skipped} skipped` : ""
      }.`,
      undoAvailable: Boolean(result.undo_operation_id),
    };
  }

  if (
    proposal.tool === "preview_site_creation" &&
    proposal.kind === "site_create" &&
    proposal.risk === "sensitive" &&
    proposal.method === "POST" &&
    path === "/sites"
  ) {
    const payload = proposal.payload;
    const site = {
      name: payload.name,
      base_url: payload.base_url,
      platform: payload.platform,
    };
    if (
      !hasOnlyKeys(payload, ["name", "base_url", "platform", "expected_absent"]) ||
      payload.expected_absent !== true ||
      !validManagedSite(site)
    ) {
      throw new Error("unsupported site creation payload");
    }
    const result = await api
      .post<{ id: number; name: string }>(path, payload)
      .then((response) => response.data);
    return {
      message: `Connected: ${result.name} as site #${result.id}.`,
      undoAvailable: false,
    };
  }

  const alertAcknowledgement = path.match(/^\/alerts\/(\d+)\/acknowledge$/);
  if (
    proposal.tool === "preview_alert_acknowledgement" &&
    proposal.kind === "alert_acknowledgement" &&
    proposal.risk === "sensitive" &&
    proposal.method === "POST" &&
    alertAcknowledgement
  ) {
    const context = proposal.context;
    if (
      !hasOnlyKeys(proposal.payload, [
        "expected_unacknowledged",
        "expected_occurrences",
        "expected_last_seen_at",
      ]) ||
      proposal.payload.expected_unacknowledged !== true ||
      !Number.isInteger(proposal.payload.expected_occurrences) ||
      Number(proposal.payload.expected_occurrences) < 1 ||
      !isIsoTimestamp(proposal.payload.expected_last_seen_at) ||
      !context ||
      Number(context.alert_id) !== Number(alertAcknowledgement[1]) ||
      typeof context.alert_subject !== "string" ||
      !context.alert_subject.trim()
    ) {
      throw new Error("unsupported alert acknowledgement proposal");
    }
    const result = await api
      .post<{ id: number; subject: string }>(path, proposal.payload)
      .then((response) => response.data);
    return {
      message: `Acknowledged: alert #${result.id} — ${result.subject}.`,
      undoAvailable: false,
    };
  }

  const poolApproval = path.match(/^\/sites\/(\d+)\/pool-source\/approval$/);
  const poolReactivation = path.match(/^\/sites\/(\d+)\/pool-source\/reactivate$/);
  if (
    proposal.tool === "preview_pool_source_action" &&
    proposal.kind === "pool_source_action" &&
    proposal.risk === "sensitive" &&
    (poolApproval || poolReactivation)
  ) {
    const context = proposal.context;
    const action = context?.action;
    const expected = proposal.payload.expected;
    const expiringIds = proposal.payload.expected_expiring_suggestion_ids;
    const expectedRecord =
      typeof expected === "object" && expected !== null && !Array.isArray(expected)
        ? (expected as Record<string, unknown>)
        : null;
    const expectedKeys = ["approved", "quarantined", "consecutive_failures", "quarantined_at"];
    const actionMatchesRoute =
      (action === "approve" && proposal.method === "POST" && Boolean(poolApproval)) ||
      (action === "revoke" && proposal.method === "DELETE" && Boolean(poolApproval)) ||
      (action === "reactivate" && proposal.method === "POST" && Boolean(poolReactivation));
    const endpointSiteId = Number((poolApproval ?? poolReactivation)?.[1]);
    const impactMatchesAction =
      action === "revoke"
        ? sortedUniqueIntegerList(expiringIds) || (Array.isArray(expiringIds) && expiringIds.length === 0)
        : expiringIds === undefined;
    if (
      !actionMatchesRoute ||
      !hasOnlyKeys(proposal.payload, ["expected", "expected_expiring_suggestion_ids"]) ||
      !expectedRecord ||
      !hasOnlyKeys(expectedRecord, expectedKeys) ||
      Object.keys(expectedRecord).length !== expectedKeys.length ||
      typeof expectedRecord.approved !== "boolean" ||
      typeof expectedRecord.quarantined !== "boolean" ||
      !Number.isInteger(expectedRecord.consecutive_failures) ||
      Number(expectedRecord.consecutive_failures) < 0 ||
      !(
        expectedRecord.quarantined_at === null ||
        isIsoTimestamp(expectedRecord.quarantined_at)
      ) ||
      !impactMatchesAction ||
      !context ||
      Number(context.site_id) !== endpointSiteId ||
      typeof context.site_name !== "string" ||
      !context.site_name.trim()
    ) {
      throw new Error("unsupported content-pool action proposal");
    }
    const result =
      proposal.method === "DELETE"
        ? await api
            .delete<{ id: number; name: string }>(path, { data: proposal.payload })
            .then((response) => response.data)
        : await api
            .post<{ id: number; name: string }>(path, proposal.payload)
            .then((response) => response.data);
    const verb = action === "approve" ? "Approved" : action === "revoke" ? "Revoked" : "Reactivated";
    return {
      message: `${verb}: ${result.name} (site #${result.id}).`,
      undoAvailable: false,
    };
  }

  if (
    proposal.tool === "preview_site_creation" &&
    proposal.kind === "site_bulk_create" &&
    proposal.risk === "sensitive" &&
    proposal.method === "POST" &&
    path === "/sites/bulk"
  ) {
    const sites = proposal.payload.sites;
    const expectedUrls = proposal.payload.expected_absent_base_urls;
    const sortedUniqueStrings = (value: unknown): value is string[] =>
      Array.isArray(value) &&
      value.length > 0 &&
      value.every((item) => typeof item === "string") &&
      value.every((item, index) => index === 0 || String(value[index - 1]) < item);
    if (
      !hasOnlyKeys(proposal.payload, ["sites", "expected_absent_base_urls"]) ||
      !Array.isArray(sites) ||
      sites.length < 2 ||
      sites.length > 100 ||
      !sites.every(validManagedSite) ||
      !sortedUniqueStrings(expectedUrls) ||
      JSON.stringify([...sites].map((site) => String(site.base_url)).sort()) !==
        JSON.stringify(expectedUrls)
    ) {
      throw new Error("unsupported bulk site creation payload");
    }
    const result = await api
      .post<{ created: unknown[]; skipped: unknown[]; rejected: unknown[] }>(
        path,
        proposal.payload,
      )
      .then((response) => response.data);
    if (result.skipped.length || result.rejected.length || result.created.length !== sites.length) {
      throw new Error("guarded bulk site creation returned a partial result");
    }
    return {
      message: `Connected: ${result.created.length} sites.`,
      undoAvailable: false,
    };
  }

  const siteIngestion = path.match(/^\/sites\/(\d+)\/ingest$/);
  const siteAnalysis = path.match(/^\/suggestions\/(\d+)$/);
  if (
    proposal.tool === "preview_site_job" &&
    proposal.kind === "site_job_start" &&
    proposal.risk === "sensitive" &&
    proposal.method === "POST" &&
    (siteIngestion || siteAnalysis)
  ) {
    const expectedIds = proposal.payload.expected_active_job_run_ids;
    if (!Array.isArray(expectedIds) || !sortedUniqueIntegerList(expectedIds)) {
      // An empty snapshot is valid and is what a ready preview normally binds.
      if (!Array.isArray(expectedIds) || expectedIds.length !== 0) {
        throw new Error("unsupported site job payload");
      }
    }
    const result = await api
      .post<{ job_run_id: number | null }>(path, proposal.payload)
      .then((r) => r.data);
    const label = siteIngestion ? "crawl" : "analysis";
    return {
      message: `Started: ${label} job #${String(result.job_run_id)}.`,
      undoAvailable: false,
    };
  }

  const siteSchedule = path.match(/^\/sites\/(\d+)\/schedule$/);
  if (
    proposal.tool === "preview_site_schedule" &&
    proposal.kind === "site_schedule_update" &&
    proposal.risk === "sensitive" &&
    proposal.method === "PUT" &&
    siteSchedule
  ) {
    const payload = proposal.payload;
    const context = proposal.context;
    const weekday = payload.weekday;
    const validWeekday =
      weekday === null || (Number.isInteger(weekday) && Number(weekday) >= 0 && Number(weekday) <= 6);
    if (
      !hasOnlyKeys(payload, ["enabled", "cadence", "weekday", "local_time", "timezone", "expected"]) ||
      typeof payload.enabled !== "boolean" ||
      (payload.cadence !== "daily" && payload.cadence !== "weekly") ||
      !validWeekday ||
      (payload.cadence === "daily" && weekday !== null) ||
      (payload.cadence === "weekly" && weekday === null) ||
      !isScheduleTime(payload.local_time) ||
      typeof payload.timezone !== "string" ||
      payload.timezone.trim() === "" ||
      payload.timezone.length > 64 ||
      !validScheduleSnapshot(payload.expected) ||
      !context ||
      Number(context.site_id) !== Number(siteSchedule[1]) ||
      typeof context.site_name !== "string" ||
      !context.site_name.trim()
    ) {
      throw new Error("unsupported site schedule proposal");
    }
    await api.put(path, payload);
    return {
      message: `${payload.enabled ? "Scheduled" : "Paused"}: refresh for ${context.site_name}.`,
      undoAvailable: false,
    };
  }

  const articleAnalysis = path.match(/^\/articles\/(\d+)\/suggestions$/);
  if (
    proposal.tool === "preview_article_analysis" &&
    proposal.kind === "article_analysis_start" &&
    proposal.risk === "sensitive" &&
    proposal.method === "POST" &&
    articleAnalysis
  ) {
    const expectedIds = proposal.payload.expected_active_job_run_ids;
    const context = proposal.context;
    if (
      !hasOnlyKeys(proposal.payload, [
        "expected_active_job_run_ids",
        "expected_article_is_active",
      ]) ||
      ((!sortedUniqueIntegerList(expectedIds) &&
        !(Array.isArray(expectedIds) && expectedIds.length === 0))) ||
      proposal.payload.expected_article_is_active !== true ||
      !context ||
      Number(context.article_id) !== Number(articleAnalysis[1]) ||
      !Number.isInteger(context.site_id) ||
      Number(context.site_id) <= 0 ||
      typeof context.article_title !== "string" ||
      !context.article_title.trim() ||
      typeof context.site_name !== "string" ||
      !context.site_name.trim()
    ) {
      throw new Error("unsupported article analysis proposal");
    }
    const result = await api
      .post<{ job_run_id: number | null }>(path, proposal.payload)
      .then((response) => response.data);
    return {
      message: `Started: analysis job #${String(result.job_run_id)} for article #${articleAnalysis[1]}.`,
      undoAvailable: false,
    };
  }

  if (
    proposal.tool === "preview_pipeline_batch" &&
    proposal.kind === "pipeline_batch_start" &&
    proposal.risk === "sensitive" &&
    proposal.method === "POST" &&
    path === "/pipelines/batches"
  ) {
    const siteIds = proposal.payload.site_ids;
    const expectedIds = proposal.payload.expected_active_job_run_ids;
    if (
      !sortedUniqueIntegerList(siteIds) ||
      siteIds.length === 0 ||
      (!sortedUniqueIntegerList(expectedIds) &&
        !(Array.isArray(expectedIds) && expectedIds.length === 0))
    ) {
      throw new Error("unsupported pipeline batch payload");
    }
    const result = await api
      .post<{ id: number }>(path, proposal.payload)
      .then((r) => r.data);
    return {
      message: `Started: pipeline batch #${result.id} for ${siteIds.length} site${siteIds.length === 1 ? "" : "s"}.`,
      undoAvailable: false,
    };
  }

  const pipelineRetry = path.match(/^\/pipelines\/batches\/(\d+)\/sites\/(\d+)\/retry$/);
  if (
    proposal.tool === "preview_pipeline_retry" &&
    proposal.kind === "pipeline_retry" &&
    proposal.risk === "sensitive" &&
    proposal.method === "POST" &&
    pipelineRetry
  ) {
    const retryCount = proposal.payload.expected_retry_count;
    const stage = proposal.payload.expected_stage;
    if (
      typeof proposal.payload.expected_batch_status !== "string" ||
      proposal.payload.expected_site_status !== "failed" ||
      (stage !== "ingestion" && stage !== "analysis") ||
      !Number.isInteger(retryCount) ||
      Number(retryCount) < 0
    ) {
      throw new Error("unsupported pipeline retry payload");
    }
    await api.post(path, proposal.payload);
    return {
      message: `Started: ${stage} retry for site #${pipelineRetry[2]} in batch #${pipelineRetry[1]}.`,
      undoAvailable: false,
    };
  }

  const pipelineCancel = path.match(/^\/pipelines\/batches\/(\d+)\/cancel$/);
  if (
    proposal.tool === "preview_pipeline_cancel" &&
    proposal.kind === "pipeline_cancel" &&
    proposal.risk === "sensitive" &&
    proposal.method === "POST" &&
    pipelineCancel
  ) {
    const status = proposal.payload.expected_batch_status;
    const expectedSites = proposal.payload.expected_sites;
    const validSiteState = (value: unknown): value is Record<string, unknown> => {
      if (typeof value !== "object" || value === null) return false;
      const state = value as Record<string, unknown>;
      return (
        Number.isInteger(state.site_id) &&
        Number(state.site_id) > 0 &&
        ["queued", "ingestion_running", "analysis_queued", "analysis_running"].includes(
          String(state.status),
        ) &&
        (state.stage === "ingestion" || state.stage === "analysis") &&
        (state.ingestion_job_run_id === null ||
          (Number.isInteger(state.ingestion_job_run_id) &&
            Number(state.ingestion_job_run_id) > 0)) &&
        (state.analysis_job_run_id === null ||
          (Number.isInteger(state.analysis_job_run_id) && Number(state.analysis_job_run_id) > 0))
      );
    };
    if (
      (status !== "queued" && status !== "running") ||
      !Array.isArray(expectedSites) ||
      expectedSites.length === 0 ||
      !expectedSites.every(validSiteState) ||
      !sortedUniqueIntegerList(expectedSites.map((state) => Number(state.site_id)))
    ) {
      throw new Error("unsupported pipeline cancellation payload");
    }
    await api.post(path, proposal.payload);
    return {
      message: `Cancelled: pipeline batch #${pipelineCancel[1]} across ${expectedSites.length} unfinished site${expectedSites.length === 1 ? "" : "s"}.`,
      undoAvailable: false,
    };
  }

  const singleReview = path.match(/^\/suggestions\/(\d+)$/);
  if (
    proposal.tool === "preview_suggestion_review" &&
    proposal.kind === "review_suggestion" &&
    proposal.risk === "reversible" &&
    proposal.method === "PUT" &&
    singleReview
  ) {
    const status = proposal.payload.status;
    if (
      (status !== "approved" && status !== "rejected") ||
      proposal.payload.expected_status !== "pending"
    ) {
      throw new Error("unsupported suggestion review status");
    }
    const result = await api
      .put<{ id: number; status: string }>(path, proposal.payload)
      .then((r) => r.data);
    return {
      message: `Applied: suggestion #${result.id} is ${result.status}.`,
      undoAvailable: true,
    };
  }

  const rankingPolicy = path.match(/^\/sites\/(\d+)\/editorial-ranking-policy$/);
  if (
    proposal.tool === "preview_editorial_ranking_policy" &&
    proposal.kind === "editorial_ranking_policy" &&
    proposal.risk === "reversible" &&
    proposal.method === "PUT" &&
    rankingPolicy
  ) {
    const expected = proposal.payload.expected;
    const enabled = proposal.payload.enabled;
    const minScore = proposal.payload.min_score_percent;
    const weight = proposal.payload.feedback_weight;
    const minSamples = proposal.payload.min_samples;
    if (
      typeof expected !== "object" ||
      expected === null ||
      typeof enabled !== "boolean" ||
      typeof minScore !== "number" ||
      typeof weight !== "number" ||
      typeof minSamples !== "number"
    ) {
      throw new Error("unsupported editorial ranking policy payload");
    }
    const result = await api
      .put<{ site_id: number }>(path, {
        enabled,
        min_score_percent: minScore,
        feedback_weight: weight,
        min_samples: minSamples,
        expected,
      })
      .then((r) => r.data);
    return {
      message: `Applied: editorial ranking policy updated for site #${result.site_id}.`,
      undoAvailable: false,
    };
  }

  const externalPolicy = path.match(/^\/sites\/(\d+)\/external-link-policy$/);
  if (
    proposal.tool === "preview_external_link_policy" &&
    proposal.kind === "external_link_policy" &&
    proposal.risk === "sensitive" &&
    proposal.method === "PUT" &&
    externalPolicy
  ) {
    const expected = proposal.payload.expected;
    const expiringIds = proposal.payload.expected_expiring_suggestion_ids;
    const enabled = proposal.payload.external_links_enabled;
    const requireHttps = proposal.payload.require_https;
    const minTrustScore = proposal.payload.min_trust_score;
    const minDomainAgeDays = proposal.payload.min_domain_age_days;
    const trustedTlds = proposal.payload.trusted_tlds;
    const allowlist = proposal.payload.allowlist_domains;
    const blocklist = proposal.payload.blocklist_domains;
    const competitors = proposal.payload.competitor_domains;
    const stringList = (value: unknown): value is string[] =>
      Array.isArray(value) && value.every((item) => typeof item === "string");
    if (
      typeof expected !== "object" ||
      expected === null ||
      !Array.isArray(expiringIds) ||
      !expiringIds.every((id) => Number.isInteger(id) && Number(id) > 0) ||
      typeof enabled !== "boolean" ||
      typeof requireHttps !== "boolean" ||
      typeof minTrustScore !== "number" ||
      typeof minDomainAgeDays !== "number" ||
      !stringList(trustedTlds) ||
      !stringList(allowlist) ||
      !stringList(blocklist) ||
      !stringList(competitors)
    ) {
      throw new Error("unsupported external-link policy payload");
    }
    const result = await api
      .put<{ site_id: number; expired_suggestions: number }>(path, {
        external_links_enabled: enabled,
        require_https: requireHttps,
        min_trust_score: minTrustScore,
        min_domain_age_days: minDomainAgeDays,
        trusted_tlds: trustedTlds,
        allowlist_domains: allowlist,
        blocklist_domains: blocklist,
        competitor_domains: competitors,
        expected,
        expected_expiring_suggestion_ids: expiringIds,
      })
      .then((r) => r.data);
    return {
      message: `Applied: external-link policy updated for site #${result.site_id}; ${result.expired_suggestions} suggestions expired.`,
      undoAvailable: false,
    };
  }

  throw new Error(`unsupported proposal endpoint: ${proposal.endpoint}`);
};

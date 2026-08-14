import { pct } from "../../lib/utils";
import type { Suggestion, SuggestionEvent } from "../../types/suggestion";
import { LogoLoadingIndicator } from "../LogoLoadingAnimation";

export interface SuggestionTraceState {
  data: SuggestionEvent[] | undefined;
  isLoading: boolean;
  error: unknown;
  onRetry: () => void;
}

interface Props {
  suggestion: Suggestion;
  trace: SuggestionTraceState;
}

const EVENT_LABEL: Record<string, string> = {
  generated: "Generated",
  imported: "Imported",
  reviewed: "Reviewed",
  restored: "Restored to pending",
  publishing: "Publishing started",
  publish_attempt_failed: "Publishing attempt failed",
  applied: "Published",
  failed: "Publishing failed",
  expired: "Expired",
  status_changed: "Status changed",
  policy_expired: "Blocked by external policy",
};

const eventLabel = (event: SuggestionEvent) => {
  if (event.event_type === "reviewed") {
    if (event.details.to_status === "approved") return "Accepted";
    if (event.details.to_status === "rejected") return "Rejected";
  }
  return EVENT_LABEL[event.event_type] ?? event.event_type.replaceAll("_", " ");
};

const eventDetail = (event: SuggestionEvent) => {
  const outcome = event.details.publish_outcome;
  if (typeof outcome === "string") return `Outcome: ${outcome.replaceAll("_", " ")}`;
  if (event.event_type === "publish_attempt_failed") {
    const attempt = event.details.attempt;
    const reason = event.details.reason;
    const prefix = typeof attempt === "number" ? `Attempt ${attempt}: ` : "";
    return typeof reason === "string" ? `${prefix}${reason}` : null;
  }
  const toStatus = event.details.to_status;
  if (typeof toStatus === "string" && event.event_type === "status_changed") {
    return `Status: ${toStatus.replaceAll("_", " ")}`;
  }
  return null;
};

const eventTime = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
};

const formatDuration = (from: string, to: string | number) => {
  const start = new Date(from).getTime();
  const end = typeof to === "number" ? to : new Date(to).getTime();
  if (Number.isNaN(start) || Number.isNaN(end)) return "Unknown";

  const minutes = Math.max(0, Math.floor((end - start) / 60_000));
  if (minutes < 1) return "< 1 min";
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
};

const CHECK_LABEL: Record<string, string> = {
  https: "HTTPS",
  trusted_tld: "Trusted TLD",
  domain_age_days: "Domain age",
  allowlisted: "On the allowlist",
  blocklisted: "On the blocklist",
  competitor: "Competitor domain",
  owned_domain: "Domain we manage",
  approved_source: "Approved pool source",
};

/**
 * Checks where `true` is the finding that blocks a link rather than the
 * reassuring answer. Everything else is reported plainly: `allowlisted: false`
 * means nothing on a site with no allowlist, and dressing it as a failure would
 * be the same overclaiming this panel exists to remove.
 */
const BLOCKING_WHEN_TRUE = new Set(["blocklisted", "competitor", "owned_domain"]);

const checkLabel = (key: string) => CHECK_LABEL[key] ?? key.replaceAll("_", " ");

const checkValue = (key: string, value: boolean | number | string | null) => {
  if (value === null || value === undefined) return "Unknown";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (key === "domain_age_days") return `${value} days`;
  return String(value);
};

const checkIsAdverse = (key: string, value: boolean | number | string | null) => {
  if (typeof value !== "boolean") return false;
  return BLOCKING_WHEN_TRUE.has(key) ? value : key === "https" && !value;
};

/**
 * The individual checks behind an external verdict, and why it went that way.
 *
 * A single score or a "Passed" badge is not the contract: the engine records
 * each guard it applied and a reason for every one that refused the link, and an
 * editor deciding whether to publish an outbound link needs to see which guard
 * spoke. A blocked link with no stated reason is an unexplained refusal.
 */
function ExternalChecks({
  title,
  domain,
  eligible,
  reasons,
  checks,
}: {
  title: string;
  domain: string;
  eligible: boolean;
  reasons: string[];
  checks: Record<string, boolean | number | string | null>;
}) {
  const entries = Object.entries(checks);
  return (
    <div className="mt-3 rounded-lg border border-hairline px-3 py-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-caption-sm font-medium text-ink">{title}</span>
        <span className={`text-caption-sm ${eligible ? "text-muted" : "text-error-ink"}`}>
          {domain} &middot; {eligible ? "Passed" : "Blocked"}
        </span>
      </div>
      {reasons.length > 0 && (
        <ul className="mt-2 list-disc space-y-0.5 pl-5 text-caption-sm text-error-ink">
          {reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      )}
      {entries.length > 0 && (
        <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-caption-sm">
          {entries.map(([key, value]) => (
            <div key={key} className="flex items-baseline justify-between gap-2">
              <dt className="min-w-0 truncate text-muted">{checkLabel(key)}</dt>
              <dd
                className={`font-medium ${
                  checkIsAdverse(key, value) ? "text-error-ink" : "text-body"
                }`}
              >
                {checkValue(key, value)}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

const timingStat = (suggestion: Suggestion, events: SuggestionEvent[] | undefined) => {
  const decision = events?.find(
    (event) =>
      event.event_type === "reviewed" && event.details.to_status === suggestion.status,
  );
  if (decision) {
    return {
      label: "Decision time",
      value: formatDuration(suggestion.created_at, decision.created_at),
    };
  }

  const restored = events?.find((event) => event.event_type === "restored");
  return {
    label: "Queue age",
    value: formatDuration(restored?.created_at ?? suggestion.created_at, Date.now()),
  };
};

export default function SuggestionTraceCard({ suggestion, trace }: Props) {
  const bm25 = suggestion.score_components?.bm25_score;
  const externalTrust = suggestion.score_components?.external_trust;
  const externalSafety = suggestion.score_components?.external_safety;
  const graph = suggestion.score_components?.graph;
  const timing = timingStat(suggestion, trace.data);

  return (
    <section aria-label="Suggestion traceability" className="card mb-5 mt-5 p-4">
      <div className="eyebrow">Why this suggestion</div>

      <dl
        aria-label="Suggestion statistics"
        role="group"
        className="mt-2 grid grid-cols-2 gap-2"
      >
        <div className="rounded-lg bg-surface-strong px-3 py-2">
          <dt className="text-caption-sm text-muted">Semantic match</dt>
          <dd className="mt-0.5 text-body-sm font-medium text-ink">
            {pct(suggestion.score)}
          </dd>
        </div>
        {externalTrust && (
          <div
            className="rounded-lg bg-surface-strong px-3 py-2"
            title={`External trust for ${externalTrust.domain}`}
          >
            <dt className="text-caption-sm text-muted">External trust</dt>
            <dd className="mt-0.5 text-body-sm font-medium text-ink">
              {externalTrust.score}/100
            </dd>
          </div>
        )}
        {suggestion.provider_score !== null && suggestion.provider_score !== undefined && (
          <div className="rounded-lg bg-surface-strong px-3 py-2">
            <dt className="text-caption-sm text-muted">Search relevance</dt>
            <dd className="mt-0.5 text-body-sm font-medium text-ink">
              {pct(suggestion.provider_score)}
            </dd>
          </div>
        )}
        {externalSafety && (
          <div
            className="rounded-lg bg-surface-strong px-3 py-2"
            title={`Web-search safety for ${externalSafety.domain}`}
          >
            <dt className="text-caption-sm text-muted">Safety checks</dt>
            <dd className="mt-0.5 text-body-sm font-medium text-ink">
              {externalSafety.eligible ? "Passed" : "Blocked"}
            </dd>
          </div>
        )}
        <div className="rounded-lg bg-surface-strong px-3 py-2">
          <dt className="text-caption-sm text-muted">
            {suggestion.method === "hybrid_bm25" && bm25 !== undefined
              ? "BM25 score"
              : "Ranking"}
          </dt>
          <dd className="mt-0.5 text-body-sm font-medium text-ink">
            {suggestion.method === "hybrid_bm25" && bm25 !== undefined
              ? bm25.toFixed(1)
              : suggestion.method === "baseline_cosine"
                ? "Cosine"
                : suggestion.method === "external_search"
                  ? "Web search"
                : "Hybrid"}
          </dd>
        </div>
        <div className="rounded-lg bg-surface-strong px-3 py-2">
          <dt className="text-caption-sm text-muted">{timing.label}</dt>
          <dd className="mt-0.5 text-body-sm font-medium text-ink">{timing.value}</dd>
        </div>
        <div className="rounded-lg bg-surface-strong px-3 py-2">
          <dt className="text-caption-sm text-muted">Activity events</dt>
          <dd className="mt-0.5 text-body-sm font-medium text-ink">
            {trace.data ? trace.data.length : "\u2014"}
          </dd>
        </div>
      </dl>

      {externalTrust && (
        <ExternalChecks
          title="External trust checks"
          domain={externalTrust.domain}
          eligible={externalTrust.eligible}
          reasons={externalTrust.reasons}
          checks={externalTrust.checks}
        />
      )}
      {externalSafety && (
        <ExternalChecks
          title="Web-search safety checks"
          domain={externalSafety.domain}
          eligible={externalSafety.eligible}
          reasons={externalSafety.reasons}
          checks={externalSafety.checks}
        />
      )}

      {graph && (
        <div className="mt-3 rounded-lg border border-hairline px-3 py-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-caption-sm font-medium text-ink">Graph context</span>
            <span className="text-caption-sm text-muted">
              {graph.mode === "active" ? "Used in order" : "Observed beside BM25"}
            </span>
          </div>
          <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-caption-sm">
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-muted">Target inlinks</dt>
              <dd className="font-medium text-body">
                {graph.target_in_degree ?? "Unknown"}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-muted">Source outlinks</dt>
              <dd className="font-medium text-body">
                {graph.source_out_degree ?? "Unknown"}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-muted">Target status</dt>
              <dd className="font-medium text-body">
                {graph.target_orphan
                  ? "Orphan"
                  : graph.target_underlinked
                    ? "Underlinked"
                    : graph.target_saturated
                      ? "Saturated"
                      : "Connected"}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <dt className="text-muted">Graph adjustment</dt>
              <dd className="font-medium text-body">
                {graph.adjustment ? `+${graph.adjustment.toFixed(3)}` : "None"}
              </dd>
            </div>
          </dl>
          {graph.target_orphan && (
            <p className="mt-2 text-caption-sm leading-normal text-body">
              This structural opportunity is only considered alongside topical relevance;
              orphan status does not qualify an otherwise weak target.
            </p>
          )}
        </div>
      )}

      {suggestion.trace_id && (
        <p className="mt-2 break-all text-caption-sm text-muted">
          Trace ID: <span className="font-medium text-body">{suggestion.trace_id}</span>
        </p>
      )}
      {suggestion.provider_request_id && (
        <p className="mt-1 break-all text-caption-sm text-muted">
          Provider request: {suggestion.provider_request_id}
        </p>
      )}

      <div className="mt-4 border-t border-hairline pt-4">
        <div className="eyebrow">Activity</div>
        {/* Inline rather than a `SkeletonRows` panel: this is a section inside a
            card, and the dashed panel is the shape the app uses for a whole
            region. */}
        {trace.isLoading && (
          <LogoLoadingIndicator text="Loading history…" className="mt-2 text-caption text-muted" />
        )}
        {Boolean(trace.error) && !trace.isLoading && (
          <div className="mt-2 flex items-center justify-between gap-3">
            <p className="text-caption text-error-ink">History could not be loaded.</p>
            <button type="button" onClick={trace.onRetry} className="btn btn-outline btn-sm">
              Retry
            </button>
          </div>
        )}
        {!trace.isLoading && !trace.error && trace.data?.length === 0 && (
          <p className="mt-2 text-caption text-muted">No lifecycle events recorded yet.</p>
        )}
        {!trace.isLoading && !trace.error && trace.data && trace.data.length > 0 && (
          <ol className="mt-3 flex flex-col gap-3">
            {trace.data.map((event) => {
              const detail = eventDetail(event);
              return (
                <li key={event.id} className="flex gap-3 text-caption">
                  <span aria-hidden className="dot mt-2 bg-primary" />
                  <span className="min-w-0">
                    <span className="block font-medium text-ink">{eventLabel(event)}</span>
                    <span className="mt-0.5 block text-caption-sm text-muted">
                      {event.actor} &middot;{" "}
                      <time dateTime={event.created_at}>{eventTime(event.created_at)}</time>
                    </span>
                    {detail && (
                      <span className="mt-0.5 block text-caption-sm text-body">{detail}</span>
                    )}
                  </span>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </section>
  );
}

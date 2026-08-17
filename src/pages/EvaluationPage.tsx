import { useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";

import {
  getEvaluationCsv,
  type EvaluationFilters,
  type EvaluationMetric,
  type EvaluationMetrics,
  type EvaluationProvenance,
  type EvidenceSampleState,
  type MethodMetrics,
  type ScoreRangeMetrics,
} from "../api/evaluation";
import EvaluationDrilldown from "../components/evaluation/EvaluationDrilldown";
import {
  AcceptanceTrend,
  OrphanTrend,
} from "../components/evaluation/EvaluationTrendCharts";
import HelpHint from "../components/HelpHint";
import PageHeader from "../components/PageHeader";
import { useEvaluationMetrics } from "../hooks/useEvaluation";
import { useSites } from "../hooks/useSites";
import { downloadBlob, formatCount } from "../lib/utils";

type RangeKey = "7d" | "30d" | "90d" | "all";

const RANGE_OPTIONS: Array<{ value: RangeKey; label: string; days?: number }> = [
  { value: "7d", label: "Last 7 days", days: 7 },
  { value: "30d", label: "Last 30 days", days: 30 },
  { value: "90d", label: "Last 90 days", days: 90 },
  { value: "all", label: "All time" },
];

const KPI_ORBS = [
  "bg-[radial-gradient(circle,theme(colors.orb-mint/45%),transparent_70%)]",
  "bg-[radial-gradient(circle,theme(colors.orb-sky/45%),transparent_70%)]",
  "bg-[radial-gradient(circle,theme(colors.orb-lavender/45%),transparent_70%)]",
  "bg-[radial-gradient(circle,theme(colors.orb-peach/45%),transparent_70%)]",
];

const DEFINITION = {
  acceptance:
    "Accepted suggestions divided by accepted plus rejected suggestions in the selected generated-suggestion cohort.",
  decision:
    "Time between suggestion generation and the latest current editorial decision. Pending suggestions are excluded.",
  placement:
    "Generated placements with both a verbatim passage and anchor text, divided by all placement generations.",
  publication:
    "Published suggestions divided by completed publishing outcomes: published plus terminal failures.",
  orphans:
    "Active pages with no observed inbound internal link in the latest crawl. Orphans helped are verified inserted or appended LinkMesh links to previously orphaned targets.",
  exposure:
    "A suggestion is exposed when the review queue renders it. Unseen decisions are kept separate because an unseen candidate is not a rejection.",
  graph:
    "Graph context is the generation-time structural snapshot attached to a suggestion. It describes graph opportunity, not topical relevance.",
} as const;

const formatRate = (value: number | null | undefined) => {
  if (value === null || value === undefined) return "—";
  const distanceFromEdge = Math.min(value, 1 - value);
  const precision = distanceFromEdge > 0 && distanceFromEdge < 0.01 ? 2 : 0;
  return new Intl.NumberFormat("en-US", {
    style: "percent",
    minimumFractionDigits: precision,
    maximumFractionDigits: precision,
  }).format(value);
};

const formatHours = (value: number | null | undefined) => {
  if (value === null || value === undefined) return "—";
  if (value < 1) return `${Math.max(1, Math.round(value * 60))}m`;
  if (value < 24) return `${value.toFixed(value < 10 ? 1 : 0)}h`;
  return `${(value / 24).toFixed(1)}d`;
};

const formatDelta = (value: number | null | undefined) => {
  if (value === null || value === undefined) return "No previous sample";
  const points = value * 100;
  return `${points > 0 ? "+" : ""}${points.toFixed(Math.abs(points) < 1 ? 2 : 1)} pp vs previous`;
};

const METHOD_LABELS: Record<string, string> = {
  hybrid_bm25: "Hybrid BM25",
  baseline_cosine: "Cosine baseline",
  external_search: "Web search",
};

const methodLabel = (method: string) =>
  METHOD_LABELS[method] ?? method.replaceAll("_", " ").replace(/^[a-z]/, (character) => character.toUpperCase());

const filtersFor = (range: RangeKey, siteId: number | undefined): EvaluationFilters => {
  const selected = RANGE_OPTIONS.find((option) => option.value === range)!;
  if (!selected.days) return siteId ? { site_id: siteId } : {};
  const dateTo = new Date();
  const dateFrom = new Date(dateTo.getTime() - selected.days * 24 * 60 * 60 * 1000);
  return {
    ...(siteId ? { site_id: siteId } : {}),
    date_from: dateFrom.toISOString(),
    date_to: dateTo.toISOString(),
  };
};

function MetricCard({
  label,
  value,
  detail,
  definition,
  comparison,
  orb,
  loading,
  onDetails,
}: {
  label: string;
  value: string;
  detail: string;
  definition: string;
  comparison?: string;
  orb: string;
  loading: boolean;
  onDetails?: () => void;
}) {
  return (
    <div className="card relative min-h-44 overflow-hidden px-5 py-5 sm:px-6">
      <div
        className={`pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full ${orb}`}
      />
      <div className="eyebrow relative">
        {label}
        <HelpHint label="What this metric means">{definition}</HelpHint>
      </div>
      <div
        className={`relative mt-3 font-serif text-display-lg text-ink ${
          loading ? "animate-pulse text-muted" : ""
        }`}
      >
        {loading ? "…" : value}
      </div>
      <div className="relative mt-2 text-caption leading-normal text-muted">{detail}</div>
      {comparison && (
        <div className="relative mt-1 text-caption-sm font-medium text-body">{comparison}</div>
      )}
      {onDetails && !loading && (
        <button
          type="button"
          className="relative mt-3 text-caption font-medium text-ink underline underline-offset-4"
          onClick={onDetails}
        >
          View matching suggestions
        </button>
      )}
    </div>
  );
}

function CompactStat({
  label,
  value,
  detail,
  definition,
  onDetails,
}: {
  label: string;
  value: string;
  detail: string;
  definition?: string;
  onDetails?: () => void;
}) {
  return (
    <div className="rounded-xl bg-surface-strong px-4 py-3">
      <div className="text-caption-sm text-muted">
        {label}
        {definition && (
          <HelpHint label="What this metric means">{definition}</HelpHint>
        )}
      </div>
      <div className="mt-1 text-title-md font-medium text-ink">{value}</div>
      <div className="mt-1 text-caption-sm text-muted">{detail}</div>
      {onDetails && (
        <button
          type="button"
          className="mt-2 text-caption-sm font-medium text-ink underline underline-offset-4"
          onClick={onDetails}
        >
          View matching suggestions
        </button>
      )}
    </div>
  );
}

function MethodComparison({ methods }: { methods: MethodMetrics[] }) {
  return (
    <section className="card mt-4 overflow-hidden">
      <div className="border-b border-hairline px-4 py-4 sm:px-6">
        <h2 className="font-serif text-display-sm text-ink">Ranking method comparison</h2>
        <p className="mt-1 text-caption leading-normal text-muted">
          Editorial outcomes and semantic quality for each method in the selected cohort.
        </p>
      </div>
      {methods.length === 0 ? (
        <p className="px-4 py-6 text-body-sm text-muted sm:px-6">
          No suggestions were generated in this period.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-left">
            <thead className="bg-surface-strong text-caption-upper uppercase text-muted">
              <tr>
                <th className="px-4 py-3 font-medium sm:px-6">Method</th>
                <th className="px-4 py-3 text-right font-medium">Suggestions</th>
                <th className="px-4 py-3 text-right font-medium">Acceptance</th>
                <th className="px-4 py-3 text-right font-medium">Published</th>
                <th className="px-4 py-3 text-right font-medium sm:pr-6">Avg. semantic score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline text-body-sm tabular-nums">
              {methods.map((method) => (
                <tr key={method.method}>
                  <td className="px-4 py-4 font-medium text-ink sm:px-6">
                    {methodLabel(method.method)}
                  </td>
                  <td className="px-4 py-4 text-right text-body">
                    {formatCount(method.suggestions)}
                  </td>
                  <td className="px-4 py-4 text-right text-body">
                    {formatRate(method.acceptance_rate)}
                    <span className="ml-1 text-caption-sm text-muted">
                      ({formatCount(method.accepted)}/{formatCount(method.accepted + method.rejected)})
                    </span>
                  </td>
                  <td className="px-4 py-4 text-right text-body">
                    {formatCount(method.applied)}
                  </td>
                  <td className="px-4 py-4 text-right text-body sm:pr-6">
                    {formatRate(method.average_semantic_score)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ScoreRangePerformance({ ranges }: { ranges: ScoreRangeMetrics[] }) {
  return (
    <section className="card mt-4 overflow-hidden">
      <div className="border-b border-hairline px-4 py-4 sm:px-6">
        <h2 className="font-serif text-display-sm text-ink">Editor acceptance by semantic score</h2>
        <p className="mt-1 text-caption leading-normal text-muted">
          Real accepted and rejected decisions grouped by the score editors saw.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[620px] text-left">
          <thead className="bg-surface-strong text-caption text-muted">
            <tr>
              <th className="px-4 py-3 font-medium sm:px-6">Score range</th>
              <th className="px-4 py-3 text-right font-medium">Suggestions</th>
              <th className="px-4 py-3 text-right font-medium">Decisions</th>
              <th className="px-4 py-3 text-right font-medium">Accepted</th>
              <th className="px-4 py-3 text-right font-medium sm:pr-6">Acceptance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-hairline text-body-sm tabular-nums">
            {ranges.map((range) => (
              <tr key={range.label}>
                <td className="px-4 py-4 font-medium text-ink sm:px-6">{range.label}</td>
                <td className="px-4 py-4 text-right text-body">{formatCount(range.suggestions)}</td>
                <td className="px-4 py-4 text-right text-body">{formatCount(range.accepted + range.rejected)}</td>
                <td className="px-4 py-4 text-right text-body">{formatCount(range.accepted)}</td>
                <td className="px-4 py-4 text-right text-body sm:pr-6">{formatRate(range.acceptance_rate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function SitesBreakdown({ metrics }: { metrics: EvaluationMetrics }) {
  return (
    <section className="card mt-4 overflow-hidden">
      <div className="border-b border-hairline px-4 py-4 sm:px-6">
        <h2 className="font-serif text-display-sm text-ink">Suggestions by site</h2>
        <p className="mt-1 text-caption leading-normal text-muted">
          Cohort volume, editorial acceptance and delivered links for each managed site.
        </p>
      </div>
      {metrics.sites.length === 0 ? (
        <p className="px-4 py-6 text-body-sm text-muted sm:px-6">No managed sites yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left">
            <thead className="bg-surface-strong text-caption-upper uppercase text-muted">
              <tr>
                <th className="px-4 py-3 font-medium sm:px-6">Site</th>
                <th className="px-4 py-3 text-right font-medium">Suggestions</th>
                <th className="px-4 py-3 text-right font-medium">Pending</th>
                <th className="px-4 py-3 text-right font-medium">Acceptance</th>
                <th className="px-4 py-3 text-right font-medium sm:pr-6">Published</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline text-body-sm tabular-nums">
              {metrics.sites.map((site) => (
                <tr key={site.site_id}>
                  <td className="px-4 py-4 font-medium text-ink sm:px-6">{site.site_name}</td>
                  <td className="px-4 py-4 text-right text-body">
                    {formatCount(site.suggestions)}
                  </td>
                  <td className="px-4 py-4 text-right text-body">
                    {formatCount(site.pending)}
                  </td>
                  <td className="px-4 py-4 text-right text-body">
                    {formatRate(site.acceptance_rate)}
                  </td>
                  <td className="px-4 py-4 text-right text-body sm:pr-6">
                    {formatCount(site.applied)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

const SAMPLE_STATE_LABEL: Record<EvidenceSampleState, string> = {
  evidence_unavailable: "Evidence unavailable",
  more_individual_labels_required: "More individual labels required",
  three_site_baseline_ready: "Three-site baseline ready",
};

/**
 * States plainly what this page is before any number is read.
 *
 * It sits above the metrics, not inside the collapsed definitions panel: the
 * whole point is that a reader cannot take a rate off this dashboard and use it
 * to argue for a ranking or model change without having seen why they may not.
 */
function ProvenanceNotice({ provenance }: { provenance: EvaluationProvenance }) {
  const {
    sample_state,
    sites_meeting_label_target,
    baseline_site_target,
    individual_labels,
    individual_label_target,
    bulk_labels,
    evidence_cutoff,
    schema_version,
    commit,
    label_provenance,
    limitations,
  } = provenance;
  const ready = sample_state === "three_site_baseline_ready";

  return (
    <section
      className="card mb-4 border border-hairline-strong px-4 py-4 sm:px-6"
      aria-label="Evidence provenance and limitations"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="badge">Operational telemetry</span>
        <h2 className="font-serif text-display-sm text-ink">
          Not evidence for ranking or model changes
        </h2>
      </div>
      <p className="mt-2 text-caption leading-normal text-muted">
        These numbers report what the system did. Changing a ranking default or a model
        needs a versioned three-site baseline instead — {baseline_site_target} representative
        sites with at least {formatCount(individual_label_target)} individual labels each.
      </p>
      <dl className="mt-4 grid grid-cols-1 gap-3 text-caption leading-normal sm:grid-cols-2">
        <div>
          <dt className="font-medium text-ink">Sample state</dt>
          <dd className="mt-1 text-muted">
            {SAMPLE_STATE_LABEL[sample_state]}
            {!ready && (
              <>
                {" — "}
                {formatCount(sites_meeting_label_target)} of {baseline_site_target} sites at the
                label target
              </>
            )}
          </dd>
        </div>
        <div>
          <dt className="font-medium text-ink">Label provenance</dt>
          <dd className="mt-1 text-muted">
            {formatCount(individual_labels)} individual, {formatCount(bulk_labels)} from bulk
            rules. {label_provenance}
          </dd>
        </div>
        <div>
          <dt className="font-medium text-ink">Evidence cutoff</dt>
          <dd className="mt-1 text-muted">
            {evidence_cutoff
              ? new Intl.DateTimeFormat(undefined, {
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(new Date(evidence_cutoff))
              : "No suggestions in this cohort"}
          </dd>
        </div>
        <div>
          <dt className="font-medium text-ink">Schema and build</dt>
          <dd className="mt-1 break-all text-muted">
            {schema_version} · commit {commit ?? "unknown"}
          </dd>
        </div>
      </dl>
      <details className="mt-3">
        <summary className="cursor-pointer text-caption font-medium text-ink">
          What these numbers cannot settle ({limitations.length})
        </summary>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-caption leading-normal text-muted">
          {limitations.map((limitation) => (
            <li key={limitation}>{limitation}</li>
          ))}
        </ul>
      </details>
    </section>
  );
}

function MetricDefinitions({ cohortDefinition }: { cohortDefinition: string }) {
  return (
    <details className="card mt-4 px-4 py-4 sm:px-6">
      <summary className="cursor-pointer text-body-sm font-medium text-ink">
        How these metrics are calculated
      </summary>
      <dl className="mt-4 grid grid-cols-1 gap-4 text-caption leading-normal sm:grid-cols-2">
        <div>
          <dt className="font-medium text-ink">Suggestion cohort</dt>
          <dd className="mt-1 text-muted">{cohortDefinition}</dd>
        </div>
        {Object.entries(DEFINITION).map(([label, definition]) => (
          <div key={label}>
            <dt className="font-medium capitalize text-ink">{label}</dt>
            <dd className="mt-1 text-muted">{definition}</dd>
          </div>
        ))}
        <div>
          <dt className="font-medium text-ink">Previous period</dt>
          <dd className="mt-1 text-muted">
            A period of the same length immediately before the selected range. Rate changes are percentage points.
          </dd>
        </div>
      </dl>
    </details>
  );
}

const labelReason = (reason: string) =>
  reason === "unspecified"
    ? "No reason supplied"
    : reason.replaceAll("_", " ").replace(/^[a-z]/, (character) => character.toUpperCase());

function EvidenceBreakdown({ metrics }: { metrics: EvaluationMetrics }) {
  const exposure = metrics.exposure;
  const graph = metrics.graph_impact;
  const reasons = metrics.rejection_reasons ?? [];
  if (!exposure && !graph && reasons.length === 0) return null;

  return (
    <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
      {exposure && (
        <section className="card px-4 py-5 sm:px-6">
          <h2 className="font-serif text-display-sm text-ink">
            Exposure and labels <HelpHint label="What this metric means">{DEFINITION.exposure}</HelpHint>
          </h2>
          <p className="mt-1 text-caption leading-normal text-muted">
            Decisions are split by whether the suggestion was rendered before review.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <CompactStat
              label="Exposed"
              value={`${formatCount(exposure.exposed)} / ${formatCount(exposure.suggestions)}`}
              detail={`${formatRate(exposure.exposure_rate)} of the cohort`}
            />
            <CompactStat
              label="Unseen"
              value={formatCount(exposure.unseen)}
              detail={`${formatCount(exposure.unseen_decisions)} decisions excluded from exposed quality`}
            />
            <CompactStat
              label="Exposed acceptance"
              value={formatRate(exposure.exposed_acceptance_rate)}
              detail={`${formatCount(exposure.exposed_decisions)} exposed decisions`}
            />
            <CompactStat
              label="Unseen decisions"
              value={formatCount(exposure.unseen_decisions)}
              detail="Not treated as rejection evidence"
            />
          </div>
        </section>
      )}

      {(graph || reasons.length > 0) && (
        <section className="card px-4 py-5 sm:px-6">
          <h2 className="font-serif text-display-sm text-ink">
            Graph impact and rejection reasons{" "}
            <HelpHint label="What this metric means">{DEFINITION.graph}</HelpHint>
          </h2>
          <p className="mt-1 text-caption leading-normal text-muted">
            Structural context and optional reviewer explanations captured at decision time.
          </p>
          {graph && (
            <div className="mt-4 grid grid-cols-2 gap-2">
              <CompactStat
                label="Graph context"
                value={formatCount(graph.suggestions_with_graph_context)}
                detail={`${formatCount(graph.exposed_graph_suggestions)} exposed`}
              />
              <CompactStat
                label="Graph adjusted"
                value={formatCount(graph.graph_adjusted_suggestions)}
                detail={`${formatCount(graph.accepted_or_published_graph_suggestions)} accepted or published`}
              />
              <CompactStat
                label="Orphan targets accepted"
                value={formatCount(graph.orphan_targets_accepted)}
                detail="Generation-time graph signal"
              />
              <CompactStat
                label="Underlinked accepted"
                value={formatCount(graph.underlinked_targets_accepted)}
                detail="Generation-time graph signal"
              />
            </div>
          )}
          {reasons.length > 0 && (
            <div className="mt-4 border-t border-hairline pt-4">
              <div className="text-caption-sm font-medium text-ink">Rejection reasons</div>
              <ul className="mt-2 space-y-1 text-caption text-muted">
                {reasons.map((item) => (
                  <li key={item.reason} className="flex justify-between gap-3">
                    <span>{labelReason(item.reason)}</span>
                    <span className="font-medium text-body">{formatCount(item.count)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function DashboardBody({
  metrics,
  onDrilldown,
}: {
  metrics: EvaluationMetrics;
  onDrilldown: (metric: EvaluationMetric) => void;
}) {
  const { editorial, placement, publication, orphans, comparison } = metrics;
  const cards = [
    {
      label: "Editor acceptance",
      value: formatRate(editorial.acceptance_rate),
      detail: editorial.decisions
        ? `${formatCount(editorial.accepted)} accepted of ${formatCount(editorial.decisions)} decisions`
        : "No editorial decisions yet",
      definition: DEFINITION.acceptance,
      comparison: comparison ? formatDelta(comparison.acceptance_rate_change) : undefined,
      metric: "accepted" as const,
    },
    {
      label: "Median decision time",
      value: formatHours(editorial.median_decision_hours),
      detail: editorial.decision_time_sample
        ? `${formatCount(editorial.decision_time_sample)} timed decisions`
        : "No timed decisions yet",
      definition: DEFINITION.decision,
      metric: "decided" as const,
    },
    {
      label: "Placement success",
      value: formatRate(placement.success_rate),
      detail: placement.generated
        ? `${formatCount(placement.successful)} natural placements of ${formatCount(placement.generated)} generated`
        : "No placements generated yet",
      definition: DEFINITION.placement,
      comparison: comparison ? formatDelta(comparison.placement_success_rate_change) : undefined,
      metric: "placement_success" as const,
    },
    {
      label: "Publishing success",
      value: formatRate(publication.success_rate),
      detail: publication.completed
        ? `${formatCount(publication.succeeded)} succeeded · ${formatCount(publication.failed)} failed`
        : "No completed publications yet",
      definition: DEFINITION.publication,
      comparison: comparison ? formatDelta(comparison.publication_success_rate_change) : undefined,
      metric: "published" as const,
    },
  ];

  return (
    <>
      <ProvenanceNotice provenance={metrics.provenance} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card, index) => (
          <MetricCard
            key={card.label}
            {...card}
            orb={KPI_ORBS[index]}
            loading={false}
            onDetails={() => onDrilldown(card.metric)}
          />
        ))}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <section className="card px-4 py-5 sm:px-6">
          <h2 className="font-serif text-display-sm text-ink">Editorial overview</h2>
          <p className="mt-1 text-caption leading-normal text-muted">
            Current outcomes for suggestions generated in the selected cohort.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <CompactStat
              label="All suggestions"
              value={formatCount(editorial.suggestions_total)}
              detail={
                comparison
                  ? formatDelta(comparison.suggestions_change_rate)
                  : "Across every current status"
              }
            />
            <CompactStat
              label="Pending review"
              value={formatCount(editorial.pending)}
              detail="Still awaiting a decision"
              onDetails={() => onDrilldown("pending")}
            />
            <CompactStat
              label="Rejection rate"
              value={formatRate(editorial.rejection_rate)}
              detail={`${formatCount(editorial.rejected)} rejected`}
              definition={DEFINITION.acceptance}
              onDetails={() => onDrilldown("rejected")}
            />
            <CompactStat
              label="Average decision"
              value={formatHours(editorial.average_decision_hours)}
              detail={`${formatCount(editorial.decision_time_sample)} timed decisions`}
              definition={DEFINITION.decision}
              onDetails={() => onDrilldown("decided")}
            />
          </div>
        </section>

        <section className="card px-4 py-5 sm:px-6">
          <h2 className="font-serif text-display-sm text-ink">
            Orphan-page impact{" "}
            <HelpHint label="What this metric means">{DEFINITION.orphans}</HelpHint>
          </h2>
          <p className="mt-1 text-caption leading-normal text-muted">
            Latest crawl state plus verified LinkMesh publications for this cohort.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <CompactStat
              label="Active articles"
              value={formatCount(orphans.active_articles)}
              detail="Across selected managed sites"
            />
            <CompactStat
              label="Orphans remaining"
              value={formatCount(orphans.remaining)}
              detail="No active inbound link"
            />
            <div className="col-span-2 rounded-xl bg-surface-strong px-4 py-4">
              <div className="text-caption-sm text-muted">Orphans helped</div>
              <div className="mt-1 font-serif text-display-sm text-ink">
                {formatCount(orphans.reduced_by_linkmesh)}
              </div>
              <div className="mt-1 text-caption-sm leading-normal text-muted">
                Previously orphaned targets that received a verified LinkMesh link.
              </div>
              <button
                type="button"
                className="mt-2 text-caption-sm font-medium text-ink underline underline-offset-4"
                onClick={() => onDrilldown("orphan_helped")}
              >
                View helped suggestions
              </button>
            </div>
          </div>
        </section>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <AcceptanceTrend points={metrics.trend} />
        <OrphanTrend points={metrics.orphan_trend} />
      </div>

      <EvidenceBreakdown metrics={metrics} />

      <MethodComparison methods={metrics.methods} />
      <ScoreRangePerformance ranges={metrics.score_ranges} />
      <SitesBreakdown metrics={metrics} />
      <MetricDefinitions cohortDefinition={metrics.cohort_definition} />
    </>
  );
}

function PageState({ children }: { children: ReactNode }) {
  return <div className="card px-5 py-8 text-center text-body-sm text-muted">{children}</div>;
}

export default function EvaluationPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedRange = searchParams.get("range");
  const range: RangeKey = RANGE_OPTIONS.some((option) => option.value === requestedRange)
    ? (requestedRange as RangeKey)
    : "30d";
  const rawSiteId = Number(searchParams.get("site"));
  const siteId = Number.isInteger(rawSiteId) && rawSiteId > 0 ? rawSiteId : undefined;
  const filters = useMemo(() => filtersFor(range, siteId), [range, siteId]);
  const query = useEvaluationMetrics(filters);
  const sitesQuery = useSites();
  const ownedSites = sitesQuery.data?.filter((site) => site.platform !== "pool") ?? [];
  const [drilldown, setDrilldown] = useState<EvaluationMetric | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState(false);

  const updateFilter = (key: "range" | "site", value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    setSearchParams(next, { replace: true });
    setDrilldown(null);
  };

  const exportCsv = async () => {
    setIsExporting(true);
    setExportError(false);
    try {
      const blob = await getEvaluationCsv(filters);
      downloadBlob(blob, `linkmesh-evaluation-${range}.csv`);
    } catch {
      setExportError(true);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Evaluation"
        sub="Live editorial, placement and publishing performance"
      />
      <div className="relative overflow-y-auto px-4 py-4 sm:px-6 sm:py-5 lg:px-8 lg:py-6">
        <div className="card mb-4 flex flex-wrap items-end gap-3 px-4 py-4 sm:px-5">
          <label className="min-w-40 flex-1 text-caption font-medium text-body sm:flex-none">
            Date range
            <select
              aria-label="Date range"
              className="field mt-1 w-full min-w-40"
              value={range}
              onChange={(event) => updateFilter("range", event.target.value)}
            >
              {RANGE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-48 flex-1 text-caption font-medium text-body">
            Site
            <select
              aria-label="Site"
              className="field mt-1 w-full min-w-48"
              value={siteId ?? ""}
              onChange={(event) => updateFilter("site", event.target.value)}
            >
              <option value="">All managed sites</option>
              {ownedSites.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            onClick={() => void query.refetch()}
            disabled={query.isFetching}
          >
            {query.isFetching ? "Refreshing…" : "Refresh"}
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => void exportCsv()}
            disabled={isExporting}
          >
            {isExporting ? "Exporting…" : "Export CSV"}
          </button>
          {exportError && (
            <span role="alert" className="w-full text-caption text-error-ink">
              CSV export failed. Try again.
            </span>
          )}
        </div>

        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-caption text-muted">
          <span>
            {query.data
              ? `Updated ${new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(query.data.generated_at))}`
              : "Loading the latest evaluation data…"}
          </span>
        </div>

        {query.isPending && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {KPI_ORBS.map((orb, index) => (
              <MetricCard
                key={orb}
                label={[
                  "Editor acceptance",
                  "Median decision time",
                  "Placement success",
                  "Publishing success",
                ][index]}
                value="—"
                detail="Loading live metrics…"
                definition="Loading metric definition…"
                orb={orb}
                loading
              />
            ))}
          </div>
        )}

        {query.isError && !query.isPending && (
          <PageState>
            <p>Evaluation metrics could not be loaded.</p>
            <button
              type="button"
              className="btn btn-outline btn-sm mt-3"
              onClick={() => void query.refetch()}
            >
              Try again
            </button>
          </PageState>
        )}

        {query.data && <DashboardBody metrics={query.data} onDrilldown={setDrilldown} />}
      </div>

      {drilldown && (
        <EvaluationDrilldown metric={drilldown} filters={filters} onClose={() => setDrilldown(null)} />
      )}
    </>
  );
}

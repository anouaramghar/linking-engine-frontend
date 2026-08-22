import type {
  EvaluationMetric,
  EvaluationMetrics,
  EvaluationProvenance,
  EvidenceSampleState,
  MethodMetrics,
  ScoreRangeMetrics,
} from "../../api/evaluation";
import { AcceptanceTrend, OrphanTrend } from "./EvaluationTrendCharts";
import HelpHint from "../HelpHint";
import { methodLabel } from "../../lib/auditLabels";
import {
  EVALUATION_KPI_ORBS,
} from "../../lib/evaluationPresentation";
import { formatCount } from "../../lib/utils";

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

export function EvaluationMetricCard({
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
            <caption className="sr-only">Ranking method comparison</caption>
            <thead className="bg-surface-strong text-caption-upper uppercase text-muted">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium sm:px-6">Method</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Suggestions</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Acceptance</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Published</th>
                <th scope="col" className="px-4 py-3 text-right font-medium sm:pr-6">Avg. semantic score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline text-body-sm tabular-nums">
              {methods.map((method) => (
                <tr key={method.method}>
                  <td className="px-4 py-4 font-medium text-ink sm:px-6">
                    {methodLabel(method.method)}
                  </td>
                  <td className="px-4 py-4 text-right text-body">{formatCount(method.suggestions)}</td>
                  <td className="px-4 py-4 text-right text-body">
                    {formatRate(method.acceptance_rate)}
                    <span className="ml-1 text-caption-sm text-muted">
                      ({formatCount(method.accepted)}/{formatCount(method.accepted + method.rejected)})
                    </span>
                  </td>
                  <td className="px-4 py-4 text-right text-body">{formatCount(method.applied)}</td>
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
      {ranges.length === 0 ? (
        <p className="px-4 py-6 text-body-sm text-muted sm:px-6">
          No scored decisions were recorded in this period.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] text-left">
            <caption className="sr-only">Editor acceptance by semantic score</caption>
            <thead className="bg-surface-strong text-caption text-muted">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium sm:px-6">Score range</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Suggestions</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Decisions</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Accepted</th>
                <th scope="col" className="px-4 py-3 text-right font-medium sm:pr-6">Acceptance</th>
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
      )}
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
            <caption className="sr-only">Suggestions by site</caption>
            <thead className="bg-surface-strong text-caption-upper uppercase text-muted">
              <tr>
                <th scope="col" className="px-4 py-3 font-medium sm:px-6">Site</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Suggestions</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Pending</th>
                <th scope="col" className="px-4 py-3 text-right font-medium">Acceptance</th>
                <th scope="col" className="px-4 py-3 text-right font-medium sm:pr-6">Published</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-hairline text-body-sm tabular-nums">
              {metrics.sites.map((site) => (
                <tr key={site.site_id}>
                  <td className="break-words px-4 py-4 font-medium text-ink sm:px-6">{site.site_name}</td>
                  <td className="px-4 py-4 text-right text-body">{formatCount(site.suggestions)}</td>
                  <td className="px-4 py-4 text-right text-body">{formatCount(site.pending)}</td>
                  <td className="px-4 py-4 text-right text-body">{formatRate(site.acceptance_rate)}</td>
                  <td className="px-4 py-4 text-right text-body sm:pr-6">{formatCount(site.applied)}</td>
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
        <h2 className="font-serif text-display-sm text-ink">Not evidence for ranking or model changes</h2>
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
            {!ready && <> — {formatCount(sites_meeting_label_target)} of {baseline_site_target} sites at the label target</>}
          </dd>
        </div>
        <div>
          <dt className="font-medium text-ink">Label provenance</dt>
          <dd className="mt-1 text-muted">
            {formatCount(individual_labels)} individual, {formatCount(bulk_labels)} from bulk rules. {label_provenance}
          </dd>
        </div>
        <div>
          <dt className="font-medium text-ink">Evidence cutoff</dt>
          <dd className="mt-1 text-muted">
            {evidence_cutoff
              ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(evidence_cutoff))
              : "No suggestions in this cohort"}
          </dd>
        </div>
        <div>
          <dt className="font-medium text-ink">Schema and build</dt>
          <dd className="mt-1 break-all text-muted" translate="no">
            {schema_version} · commit {commit ?? "unknown"}
          </dd>
        </div>
      </dl>
      <details className="mt-3">
        <summary className="cursor-pointer text-caption font-medium text-ink">
          What these numbers cannot settle ({limitations.length})
        </summary>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-caption leading-normal text-muted">
          {limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}
        </ul>
      </details>
    </section>
  );
}

function MetricDefinitions({ cohortDefinition }: { cohortDefinition: string }) {
  return (
    <details className="card mt-4 px-4 py-4 sm:px-6">
      <summary className="cursor-pointer text-body-sm font-medium text-ink">How these metrics are calculated</summary>
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
          <h2 className="font-serif text-display-sm text-ink">Exposure and labels <HelpHint label="What this metric means">{DEFINITION.exposure}</HelpHint></h2>
          <p className="mt-1 text-caption leading-normal text-muted">Decisions are split by whether the suggestion was rendered before review.</p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <CompactStat label="Exposed" value={`${formatCount(exposure.exposed)} / ${formatCount(exposure.suggestions)}`} detail={`${formatRate(exposure.exposure_rate)} of the cohort`} />
            <CompactStat label="Unseen" value={formatCount(exposure.unseen)} detail={`${formatCount(exposure.unseen_decisions)} decisions excluded from exposed quality`} />
            <CompactStat label="Exposed acceptance" value={formatRate(exposure.exposed_acceptance_rate)} detail={`${formatCount(exposure.exposed_decisions)} exposed decisions`} />
            <CompactStat label="Unseen decisions" value={formatCount(exposure.unseen_decisions)} detail="Not treated as rejection evidence" />
          </div>
        </section>
      )}
      {(graph || reasons.length > 0) && (
        <section className="card px-4 py-5 sm:px-6">
          <h2 className="font-serif text-display-sm text-ink">Graph impact and rejection reasons <HelpHint label="What this metric means">{DEFINITION.graph}</HelpHint></h2>
          <p className="mt-1 text-caption leading-normal text-muted">Structural context and optional reviewer explanations captured at decision time.</p>
          {graph && (
            <div className="mt-4 grid grid-cols-2 gap-2">
              <CompactStat label="Graph context" value={formatCount(graph.suggestions_with_graph_context)} detail={`${formatCount(graph.exposed_graph_suggestions)} exposed`} />
              <CompactStat label="Graph adjusted" value={formatCount(graph.graph_adjusted_suggestions)} detail={`${formatCount(graph.accepted_or_published_graph_suggestions)} accepted or published`} />
              <CompactStat label="Orphan targets accepted" value={formatCount(graph.orphan_targets_accepted)} detail="Generation-time graph signal" />
              <CompactStat label="Underlinked accepted" value={formatCount(graph.underlinked_targets_accepted)} detail="Generation-time graph signal" />
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
          <EvaluationMetricCard
            key={card.label}
            {...card}
            orb={EVALUATION_KPI_ORBS[index]}
            loading={false}
            onDetails={() => onDrilldown(card.metric)}
          />
        ))}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <section className="card px-4 py-5 sm:px-6">
          <h2 className="font-serif text-display-sm text-ink">Editorial overview</h2>
          <p className="mt-1 text-caption leading-normal text-muted">Current outcomes for suggestions generated in the selected cohort.</p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <CompactStat label="All suggestions" value={formatCount(editorial.suggestions_total)} detail={comparison ? formatDelta(comparison.suggestions_change_rate) : "Across every current status"} />
            <CompactStat label="Pending review" value={formatCount(editorial.pending)} detail="Still awaiting a decision" onDetails={() => onDrilldown("pending")} />
            <CompactStat label="Rejection rate" value={formatRate(editorial.rejection_rate)} detail={`${formatCount(editorial.rejected)} rejected`} definition={DEFINITION.acceptance} onDetails={() => onDrilldown("rejected")} />
            <CompactStat label="Average decision" value={formatHours(editorial.average_decision_hours)} detail={`${formatCount(editorial.decision_time_sample)} timed decisions`} definition={DEFINITION.decision} onDetails={() => onDrilldown("decided")} />
          </div>
        </section>

        <section className="card px-4 py-5 sm:px-6">
          <h2 className="font-serif text-display-sm text-ink">Orphan-page impact <HelpHint label="What this metric means">{DEFINITION.orphans}</HelpHint></h2>
          <p className="mt-1 text-caption leading-normal text-muted">Latest crawl state plus verified LinkMesh publications for this cohort.</p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <CompactStat label="Active articles" value={formatCount(orphans.active_articles)} detail="Across selected managed sites" />
            <CompactStat label="Orphans remaining" value={formatCount(orphans.remaining)} detail="No active inbound link" />
            <div className="col-span-2 rounded-xl bg-surface-strong px-4 py-4">
              <div className="text-caption-sm text-muted">Orphans helped</div>
              <div className="mt-1 font-serif text-display-sm text-ink">{formatCount(orphans.reduced_by_linkmesh)}</div>
              <div className="mt-1 text-caption-sm leading-normal text-muted">Previously orphaned targets that received a verified LinkMesh link.</div>
              <button type="button" className="mt-2 text-caption-sm font-medium text-ink underline underline-offset-4" onClick={() => onDrilldown("orphan_helped")}>
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

export default function EvaluationDashboard({
  metrics,
  onDrilldown,
}: {
  metrics: EvaluationMetrics;
  onDrilldown: (metric: EvaluationMetric) => void;
}) {
  return <DashboardBody metrics={metrics} onDrilldown={onDrilldown} />;
}

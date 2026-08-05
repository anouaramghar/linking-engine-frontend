import { timeAgo } from "../../lib/utils";

/**
 * The site's resting state as a {component.badge-pill}. The dot carries the
 * colour so the label can stay ink and clear contrast at 12px — the system has
 * no tinted text on tinted fill.
 *
 * A crawl and an analysis are separate jobs, and once both have left the active
 * feed the row is all the user has left to tell them apart. So the badge reports
 * the furthest stage the site has actually reached: crawled but not analysed is
 * "Indexed", analysed is "Analyzed". A crawl that landed after the last analysis
 * drops the row back to "Indexed" — those new articles have no suggestions yet.
 */
const DOTS: Record<string, string> = {
  succeeded: "bg-success",
  running: "bg-primary animate-pulse",
  failed: "bg-error",
};

const LABELS: Record<string, string> = {
  succeeded: "Indexed",
  running: "Crawling…",
  failed: "Crawl failed",
};

export interface SiteStatusBadgeProps {
  status: string | null;
  lastCrawlAt?: string | null;
  analysisStatus?: string | null;
  lastAnalysisAt?: string | null;
}

const isStale = (lastCrawlAt?: string | null, lastAnalysisAt?: string | null) =>
  Boolean(
    lastCrawlAt &&
      lastAnalysisAt &&
      Date.parse(lastCrawlAt) > Date.parse(lastAnalysisAt),
  );

function analysisState({
  status,
  lastCrawlAt,
  analysisStatus,
  lastAnalysisAt,
}: SiteStatusBadgeProps) {
  if (status !== "succeeded" || !analysisStatus) return null;
  if (isStale(lastCrawlAt, lastAnalysisAt)) {
    return {
      dot: DOTS.succeeded,
      label: "Indexed",
      title: lastAnalysisAt
        ? `Crawled again after the last analysis (${timeAgo(lastAnalysisAt)}) — new articles have no suggestions yet`
        : undefined,
    };
  }
  if (analysisStatus === "succeeded") {
    return {
      dot: DOTS.succeeded,
      label: "Analyzed",
      title: lastAnalysisAt ? `Suggestions generated ${timeAgo(lastAnalysisAt)}` : undefined,
    };
  }
  if (analysisStatus === "failed") {
    return {
      dot: DOTS.failed,
      label: "Analysis failed",
      title: lastAnalysisAt
        ? `Indexed, but the analysis ${timeAgo(lastAnalysisAt)} failed`
        : undefined,
    };
  }
  return null;
}

export default function SiteStatusBadge(props: SiteStatusBadgeProps) {
  const { status } = props;
  const analysis = analysisState(props);
  const dot = analysis?.dot ?? (status && DOTS[status]) ?? "bg-muted-soft";
  const label =
    analysis?.label ?? (status ? LABELS[status] ?? status : "Never crawled");

  return (
    <span className="badge" title={analysis?.title} aria-label={label}>
      <span className={`dot ${dot}`} />
      {label}
    </span>
  );
}

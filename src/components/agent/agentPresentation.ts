const TOOL_LABELS: Record<string, string> = {
  get_queue_counts: "Review queue",
  get_suggestion_counts: "Review queue",
  get_active_jobs: "Running jobs",
  get_job_status: "Running jobs",
  get_publish_counts: "Publication",
  get_publication_status: "Publication",
  get_site_status: "Site health",
  get_sites: "Connected sites",
  get_evaluation_metrics: "Evaluation metrics",
  get_traceability: "Audit trail",
};

const METRIC_LABELS: Record<string, string> = {
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  failed: "Failed",
  total: "Total",
  active: "Active",
  running: "Running",
  ready: "Ready",
  blocked: "Blocked",
  expiring: "Expiring",
  site_count: "Sites",
  article_count: "Articles",
};

const METRIC_KEYS = [
  "pending",
  "approved",
  "rejected",
  "failed",
  "active",
  "running",
  "ready",
  "blocked",
  "expiring",
  "total",
  "site_count",
  "article_count",
] as const;

const normaliseToolName = (name: string) => name.toLowerCase().replace(/-/g, "_");

export const toolLabelFor = (name: string) => {
  const normalised = normaliseToolName(name);
  if (TOOL_LABELS[normalised]) return TOOL_LABELS[normalised];
  if (normalised.includes("queue") || normalised.includes("suggestion")) return "Review queue";
  if (normalised.includes("job") || normalised.includes("pipeline")) return "Running jobs";
  if (normalised.includes("publish")) return "Publication";
  if (normalised.includes("evaluation")) return "Evaluation metrics";
  if (normalised.includes("trace") || normalised.includes("audit")) return "Audit trail";
  if (normalised.includes("site")) return "Connected sites";
  return name
    .replace(/^(get|list|find|preview)_/, "")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
};

export const toolActivityFor = (name: string) => {
  const label = toolLabelFor(name).toLowerCase();
  return `Checking ${label}`;
};

export const metricEntries = (outcome: Record<string, unknown>) =>
  METRIC_KEYS.flatMap((key) => {
    const value = outcome[key];
    return typeof value === "number" && Number.isFinite(value)
      ? [{ key, label: METRIC_LABELS[key], value }]
      : [];
  }).slice(0, 4);

export const summaryFor = (name: string, metrics: ReturnType<typeof metricEntries>) => {
  const normalised = normaliseToolName(name);
  const preferred =
    normalised.includes("queue") || normalised.includes("suggestion")
      ? ["pending", "total"]
      : normalised.includes("job") || normalised.includes("pipeline")
        ? ["active", "running", "total"]
        : normalised.includes("publish")
          ? ["ready", "blocked", "pending", "total"]
          : [];
  const metric = preferred
    .map((key) => metrics.find((entry) => entry.key === key))
    .find(Boolean);
  return metric ? `${metric.value} ${metric.label.toLowerCase()}` : "Checked";
};

const siteIdFromOutcome = (outcome: Record<string, unknown>) => {
  const siteId = Number(outcome.site_id);
  return Number.isInteger(siteId) && siteId > 0 ? siteId : null;
};

const queueHref = (outcome: Record<string, unknown>, currentHref: string) => {
  const siteId = siteIdFromOutcome(outcome);
  if (!siteId && currentHref.startsWith("/queue")) return currentHref;
  if (!siteId) return "/queue";

  const url = new URL(currentHref.startsWith("/queue") ? currentHref : "/queue", "https://linkmesh.local");
  url.searchParams.set("site", String(siteId));
  return `${url.pathname}${url.search}`;
};

export const toolHrefFor = (name: string, outcome: Record<string, unknown>, currentHref: string) => {
  const normalised = normaliseToolName(name);
  if (normalised.includes("queue") || normalised.includes("suggestion")) {
    return queueHref(outcome, currentHref);
  }
  if (normalised.includes("publish")) return "/publish";
  if (normalised.includes("job") || normalised.includes("pipeline") || normalised.includes("site")) {
    return "/sites";
  }
  if (normalised.includes("evaluation")) return "/evaluation";
  if (normalised.includes("trace") || normalised.includes("audit")) return "/traceability";
  return currentHref !== "/" ? currentHref : null;
};

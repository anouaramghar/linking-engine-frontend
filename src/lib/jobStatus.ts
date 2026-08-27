import type { JobKind, JobProgress, JobStatusValue } from "../types/job";

const ACTIVE_STATUSES = new Set<JobStatusValue>([
  "queued",
  "running",
  "cancel_requested",
  "started",
  "deferred",
  "scheduled",
]);

const STAGE_LABELS: Record<string, string> = {
  crawling: "Crawling",
  resolving_links: "Resolving links",
  reconciling: "Finishing crawl",
  encoding: "Analyzing",
  suggesting: "Finding suggestions",
  preparing: "Preparing exact edits",
  publishing: "Publishing",
};

const KIND_LABELS: Record<
  JobKind,
  { queued: string; running: string; succeeded: string; failed: string; cancelled: string }
> = {
  ingestion: {
    queued: "Crawl queued",
    running: "Crawling",
    succeeded: "Indexed",
    failed: "Crawl failed",
    cancelled: "Cancelled",
  },
  analysis: {
    queued: "Analysis queued",
    running: "Analyzing",
    succeeded: "Analyzed",
    failed: "Analysis failed",
    cancelled: "Cancelled",
  },
  publication_preparation: {
    queued: "Preparation queued",
    running: "Preparing exact edits",
    succeeded: "Edits prepared",
    failed: "Preparation failed",
    cancelled: "Cancelled",
  },
  publication: {
    queued: "Publication queued",
    running: "Publishing",
    succeeded: "Published",
    failed: "Publication failed",
    cancelled: "Cancelled",
  },
};

export const isActiveJobStatus = (status: JobStatusValue) =>
  ACTIVE_STATUSES.has(status);

export const jobStatusGroup = (
  status: JobStatusValue,
): "queued" | "running" | "succeeded" | "failed" | "cancelled" => {
  if (isActiveJobStatus(status)) {
    return status === "queued" || status === "deferred" || status === "scheduled"
      ? "queued"
      : "running";
  }
  if (status === "succeeded" || status === "finished") return "succeeded";
  if (status === "cancelled" || status === "canceled" || status === "stopped") {
    return "cancelled";
  }
  return "failed";
};

export const jobStatusLabel = (
  kind: JobKind,
  status: JobStatusValue,
  progress?: JobProgress | null,
) => {
  const group = jobStatusGroup(status);
  if (status === "cancel_requested") return "Stopping…";
  if (group === "cancelled") return "Cancelled";
  if (isActiveJobStatus(status) && progress?.stage) {
    return STAGE_LABELS[progress.stage] ?? KIND_LABELS[kind][group];
  }
  return KIND_LABELS[kind][group];
};

import type { JobProgress, JobRun } from "../../types/job";
import type { Site } from "../../types/site";

const PROGRESS_KEYS = ["completed", "processed", "applied", "inserted", "updated"] as const;

export interface ProgressMetric {
  current: number;
  total: number;
  percent: number;
}

export const progressMetric = (progress: JobProgress | null): ProgressMetric | null => {
  if (!progress) return null;

  const total = typeof progress.total === "number" ? progress.total : null;
  const current = PROGRESS_KEYS
    .map((key) => progress[key])
    .find((value): value is number => typeof value === "number");

  if (current === undefined || total === null || total <= 0) return null;

  return {
    current,
    total,
    percent: Math.min(100, Math.max(0, (current / total) * 100)),
  };
};

export const progressSummary = (progress: JobProgress | null) => {
  if (!progress) return null;

  const metric = progressMetric(progress);
  if (metric) return `${metric.current.toLocaleString()} / ${metric.total.toLocaleString()}`;

  return typeof progress.articles === "number"
    ? `${progress.articles.toLocaleString()} articles`
    : null;
};

export const activityDestination = (job: JobRun, site?: Site) => {
  if (job.kind === "publication_preparation" || job.kind === "publication") {
    return `/publish/${job.site_id}`;
  }
  return site?.platform === "pool" ? "/content-pool" : "/sites";
};

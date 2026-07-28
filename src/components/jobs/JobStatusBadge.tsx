import { useJob } from "../../hooks/useJobs";
import {
  isActiveJobStatus,
  jobStatusGroup,
  jobStatusLabel,
} from "../../lib/jobStatus";
import type { JobKind, JobStatus } from "../../types/job";

type JobSnapshot = Pick<JobStatus, "status" | "progress" | "error">;

function ActivityDots() {
  return (
    <span className="inline-flex items-center gap-0.5" aria-hidden="true">
      {[0, 1, 2].map((index) => (
        <span key={index} className={`job-activity-dot job-activity-dot-${index + 1}`} />
      ))}
    </span>
  );
}

export default function JobStatusBadge({
  jobId,
  kind,
  snapshot,
}: {
  jobId: string | null;
  kind: JobKind;
  snapshot?: JobSnapshot;
}) {
  const { data: polledJob } = useJob(snapshot ? null : jobId);
  const job = snapshot ?? polledJob;
  if (!job) return null;
  const active = isActiveJobStatus(job.status);
  const label = jobStatusLabel(kind, job.status, job.progress);
  const dotColor =
    jobStatusGroup(job.status) === "succeeded"
      ? "bg-success"
      : jobStatusGroup(job.status) === "failed"
        ? "bg-error"
        : "bg-primary";

  return (
    <span
      className="badge"
      title={job.error ?? undefined}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      {active ? <ActivityDots /> : <span className={`dot ${dotColor}`} />}
      {label}
    </span>
  );
}

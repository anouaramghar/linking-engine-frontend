import LogoLoadingAnimation from "../LogoLoadingAnimation";
import { useJob } from "../../hooks/useJobs";
import {
  isActiveJobStatus,
  jobStatusGroup,
  jobStatusLabel,
} from "../../lib/jobStatus";
import type { JobKind, JobStatus } from "../../types/job";

type JobSnapshot = Pick<JobStatus, "status" | "progress" | "error">;

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
      {active ? (
        <LogoLoadingAnimation size="xs" className="text-primary flex-none" aria-hidden="true" />
      ) : (
        <span className={`dot ${dotColor}`} />
      )}
      {label}
    </span>
  );
}

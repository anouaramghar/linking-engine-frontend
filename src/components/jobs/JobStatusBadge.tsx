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
  const group = jobStatusGroup(job.status);
  const dotColor =
    group === "succeeded"
      ? "bg-success"
      : group === "failed"
        ? "bg-error"
        : group === "cancelled"
          ? "bg-muted-soft"
          : "bg-primary";

  return (
    <span
      className="badge"
      title={job.error ?? undefined}
      role="status"
      aria-live="polite"
      // The tooltip is mouse-only, so a failure reason that lives only there is
      // a reason half the operators never read.
      aria-label={job.error ? `${label}. ${job.error}` : label}
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

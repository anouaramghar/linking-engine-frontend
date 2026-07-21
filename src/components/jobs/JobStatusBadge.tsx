import { useJob } from "../../hooks/useJobs";

const COLORS: Record<string, string> = {
  queued: "text-stone-600",
  started: "text-stone-800",
  finished: "text-green-800",
  failed: "text-red-800",
};

export default function JobStatusBadge({
  jobId,
  label,
}: {
  jobId: string | null;
  label?: string;
}) {
  const { data: job } = useJob(jobId);
  if (!jobId || !job) return null;
  return (
    <span
      className={`whitespace-nowrap rounded-full bg-chip px-2.5 py-0.5 text-[11px] font-medium ${COLORS[job.status] ?? "text-stone-600"}`}
      title={job.error ?? undefined}
    >
      {label ? `${label}: ${job.status}` : `job ${job.status}`}
    </span>
  );
}

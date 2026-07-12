import { useJob } from "../../hooks/useJobs";

const COLORS: Record<string, string> = {
  queued: "text-stone-500",
  started: "text-stone-800",
  finished: "text-green-600",
  failed: "text-red-600",
};

export default function JobStatusBadge({ jobId }: { jobId: string | null }) {
  const { data: job } = useJob(jobId);
  if (!jobId || !job) return null;
  return (
    <span
      className={`rounded-full bg-chip px-2.5 py-0.5 text-[11px] font-medium ${COLORS[job.status] ?? "text-stone-500"}`}
      title={job.error ?? undefined}
    >
      job {job.status}
    </span>
  );
}

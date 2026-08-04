import type { Site } from "../../types/site";

type PoolSourceState = Pick<
  Site,
  | "pool_source_approved"
  | "pool_source_approved_by"
  | "pool_source_consecutive_failures"
  | "pool_source_quarantined"
  | "pool_source_quarantine_reason"
>;

export default function PoolSourceStatusBadge({ site }: { site: PoolSourceState }) {
  if (site.pool_source_quarantined) {
    const failures = site.pool_source_consecutive_failures ?? 0;
    const reason = site.pool_source_quarantine_reason?.trim();
    const title = [
      `${failures} consecutive ${failures === 1 ? "failure" : "failures"}`,
      reason ? `Reason: ${reason}` : null,
      "Reactivate the source after checking it before crawling again.",
    ]
      .filter(Boolean)
      .join(". ");

    return (
      <span className="badge" title={title}>
        <span className="dot bg-error" />
        Quarantined
      </span>
    );
  }

  if (site.pool_source_approved) {
    return (
      <span
        className="badge"
        title={
          site.pool_source_approved_by
            ? `Approved by ${site.pool_source_approved_by}`
            : "Approved for manual and scheduled crawling"
        }
      >
        <span className="dot bg-success" />
        Approved
      </span>
    );
  }

  return (
    <span className="badge" title="Approve this source before manual or scheduled crawling">
      <span className="dot bg-muted-soft" />
      Pending approval
    </span>
  );
}

interface Props {
  /** Rows an editor has selected. Not publishable until an exact edit is approved. */
  selected: number;
  /** Artifacts already approved by a person, waiting only for a job. */
  approvedPlans: number;
  siteCount: number;
  busy: boolean;
  /** Only offered for a single site: approval is per exact edit, not per fleet. */
  onReview?: () => void;
  /** Retry for edits that were approved when the job could not be started. */
  onQueueApproved?: () => void;
}

/**
 * Selecting happens on this page, so this is where the backlog has to be
 * visible — but selecting is not approving, and this banner no longer offers a
 * way to publish straight from it. The only route on is to look at the exact
 * edits for one site and approve them.
 */
export default function PublishBanner({
  selected,
  approvedPlans,
  siteCount,
  busy,
  onReview,
  onQueueApproved,
}: Props) {
  if (selected === 0 && approvedPlans === 0) return null;

  const noun = selected === 1 ? "suggestion" : "suggestions";
  const scope = siteCount === 1 ? "1 site" : `${siteCount} sites`;

  return (
    // Raised on {colors.surface-strong} rather than tinted: the system carries
    // no warning hue, and the ink pill beside it is already the loud part.
    <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-hairline-strong bg-surface-strong px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="text-body-sm font-medium text-ink">
          {selected > 0
            ? `${selected} selected ${noun} across ${scope} ${selected === 1 ? "is" : "are"} waiting for review`
            : `${approvedPlans} approved ${approvedPlans === 1 ? "edit is" : "edits are"} waiting to be published`}
        </div>
        <div className="mt-1 text-caption text-body">
          {selected > 0
            ? "Selected links are not live, and are not scheduled. Review the exact edits for a site and approve them to publish."
            : "These exact edits were approved but no publish job is running for them yet."}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {approvedPlans > 0 && onQueueApproved && (
          <button
            type="button"
            onClick={onQueueApproved}
            disabled={busy}
            className="btn btn-outline btn-sm"
          >
            {busy ? "Queueing…" : "Queue approved edits"}
          </button>
        )}
        {onReview ? (
          <button type="button" onClick={onReview} disabled={busy} className="btn btn-primary btn-sm">
            Review publication changes
          </button>
        ) : (
          // Several sites have work. Approval names exact edits on exact
          // articles, so there is nothing honest a fleet-wide button could do.
          <span className="text-caption text-muted">
            Filter to one site to review its changes
          </span>
        )}
      </div>
    </div>
  );
}

interface Props {
  /** Rows an editor has selected. Not publishable until an exact edit is approved. */
  selected: number;
  /** Artifacts already approved by a person, waiting only for a job. */
  approvedPlans: number;
  sites: {
    id: number;
    name: string;
    selectedSuggestions: number;
    approvedPlans: number;
    canPublish?: boolean;
  }[];
  busy: boolean;
  onReview: (siteId: number) => void;
  onQueueApproved: (siteId: number) => void;
}

/**
 * Selecting happens on this page, so the next safe step stays attached to the
 * selection. Exact approval is still per site, but the editor no longer has to
 * change the queue filter to find the review action.
 */
export default function PublishBanner({
  selected,
  approvedPlans,
  sites,
  busy,
  onReview,
  onQueueApproved,
}: Props) {
  if (selected === 0 && approvedPlans === 0) return null;

  const reviewableSites = sites.filter(
    (site) => site.selectedSuggestions > 0 && site.canPublish !== false,
  );
  const unavailableSites = sites.filter(
    (site) => site.selectedSuggestions > 0 && site.canPublish === false,
  );

  return (
    <div className="sticky top-0 z-20 mb-3 rounded-xl border border-hairline-strong bg-surface-strong px-4 py-3 shadow-soft sm:px-5">
      <div className="min-w-0 flex-1">
        <div className="text-body-sm font-medium text-ink">
          {selected > 0 ? (
            <>
              {selected} selected {selected === 1 ? "suggestion is" : "suggestions are"} ready for
              exact-edit review
            </>
          ) : (
            <>
              {approvedPlans} approved {approvedPlans === 1 ? "edit is" : "edits are"} ready to queue
            </>
          )}
        </div>
        <div className="mt-1 text-caption text-body">
          {selected > 0
            ? "Review the exact change for each site before approving it. Selected links are not live or scheduled."
            : "These exact edits were approved, but no publish job is running for them yet."}
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-hairline-strong pt-3">
        {reviewableSites.map((site, index) => (
          <button
            key={site.id}
            type="button"
            onClick={() => onReview(site.id)}
            disabled={busy}
            aria-label={`Review ${site.name} ${site.selectedSuggestions} ${site.selectedSuggestions === 1 ? "link" : "links"}`}
            className={`btn btn-sm ${index === 0 ? "btn-primary" : "btn-outline"}`}
          >
            Review {site.name}
            <span className="text-caption opacity-75">
              {" "}
              {site.selectedSuggestions} {site.selectedSuggestions === 1 ? "link" : "links"}
            </span>
          </button>
        ))}

        {sites
          .filter((site) => site.approvedPlans > 0)
          .map((site) => (
            <button
              key={`queue-${site.id}`}
              type="button"
              onClick={() => onQueueApproved(site.id)}
              disabled={busy}
              className="btn btn-outline btn-sm"
            >
              {busy ? "Queueing…" : `Queue approved edits · ${site.name}`}
            </button>
          ))}

        {unavailableSites.length > 0 && (
          <span className="text-caption text-muted">
            Publication unavailable for {unavailableSites.map((site) => site.name).join(", ")}. Connect
            a WordPress account before reviewing.
          </span>
        )}
      </div>
    </div>
  );
}

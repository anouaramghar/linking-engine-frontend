import { Link } from "react-router-dom";

import { formatCount } from "../../lib/utils";

/**
 * What the operator has selected, and the way into the dedicated selection
 * workspace. The exact-edit review remains a second, protected page.
 *
 * Selecting a row used to leave no trace on this page: the only door to the
 * exact-edit review was a button inside one row's detail panel, so an editor who
 * selected twenty links and closed the panel had nowhere to go. This bar is that
 * door. It carries no publication control of its own — it opens the protected
 * review workspace and leaves the final approval there.
 */
export default function SelectionTray({
  selected,
  siteCount,
  siteId,
}: {
  selected: number;
  siteCount: number;
  siteId?: number;
}) {
  if (selected === 0) return null;

  const destination = siteId ? `/selected?site=${siteId}` : "/selected";

  return (
    <div className="z-20 border-t border-hairline bg-canvas-soft px-4 py-3 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1" aria-live="polite">
          <div className="text-body-sm font-medium text-ink">
            {formatCount(selected)} {selected === 1 ? "link" : "links"} selected on{" "}
            {siteCount} {siteCount === 1 ? "site" : "sites"}
          </div>
          <div className="text-caption text-muted">
            Nothing is live yet. Review the selected links before exact-edit approval.
          </div>
        </div>
        <Link to={destination} className="btn btn-primary flex-none">
          Open selected links
        </Link>
      </div>
    </div>
  );
}

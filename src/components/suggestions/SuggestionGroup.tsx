import type { ReactNode } from "react";

import type { ArticleBrief } from "../../types/suggestion";

interface Props {
  sourceArticle: ArticleBrief;
  siteId: number;
  siteName: string;
  count: number;
  visibleCount: number;
  canShowMore: boolean;
  collapsed: boolean;
  onToggle: () => void;
  onShowMore: () => void;
  itemLabel?: string;
  children: ReactNode;
}

const articlePath = (url: string) =>
  url.replace(/^https?:\/\/[^/]+/i, "") || url;

export default function SuggestionGroup({
  sourceArticle,
  siteId,
  siteName,
  count,
  visibleCount,
  canShowMore,
  collapsed,
  onToggle,
  onShowMore,
  itemLabel = "suggestion",
  children,
}: Props) {
  const headingId = `source-group-${siteId}-${sourceArticle.id}`;
  const listId = `${headingId}-suggestions`;
  const path = articlePath(sourceArticle.url);
  const action = collapsed ? "Expand" : "Collapse";
  const itemCountLabel = count === 1 ? itemLabel : `${itemLabel}s`;

  return (
    <section
      aria-labelledby={headingId}
      className="overflow-hidden rounded-xxl border border-hairline bg-surface-card"
    >
      <div className="flex flex-col items-stretch gap-3 border-b border-hairline bg-canvas-soft px-4 py-4 sm:flex-row sm:items-center sm:gap-4 sm:px-5">
        {/* A real heading, so the queue has structure a screen reader can jump
            through — the page's h1 is the PageHeader, each source article is an
            h2. The APG accordion shape: heading wraps the disclosure button. */}
        <h2 className="min-w-0 flex-1">
          <button
            type="button"
            aria-expanded={!collapsed}
            aria-controls={listId}
            aria-label={`${action} ${itemCountLabel} for ${sourceArticle.title} (${path})`}
            onClick={onToggle}
            className="flex w-full min-w-0 items-center gap-3 text-left"
          >
            <span
              aria-hidden
              className="flex h-7 w-7 flex-none items-center justify-center rounded-pill border border-hairline-strong bg-surface-card text-body-sm font-medium text-ink"
            >
              {collapsed ? "+" : "-"}
            </span>
            <span className="min-w-0">
              <span id={headingId} className="block truncate text-body-md font-medium text-ink">
                {sourceArticle.title}
              </span>
              <span className="mt-1 block truncate text-caption text-muted">
                {siteName} &middot; {path}
              </span>
            </span>
          </button>
        </h2>
        <span className="badge flex-none self-start">
          {count} {itemCountLabel}
        </span>
      </div>

      <div id={listId} hidden={collapsed}>
        <ul className="flex flex-col gap-2.5 p-2.5">{children}</ul>
        {visibleCount < count && (
          <div className="flex flex-col items-center gap-2 border-t border-hairline-soft px-3 py-3">
            <button
              type="button"
              onClick={onShowMore}
              disabled={!canShowMore}
              className="btn btn-outline btn-sm"
            >
              {canShowMore ? "Show more suggestions" : "Suggestion limit reached"}
            </button>
            <span className="text-caption text-muted" aria-live="polite">
              Showing {visibleCount} of {count}
            </span>
          </div>
        )}
      </div>
    </section>
  );
}

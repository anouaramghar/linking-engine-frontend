import type { ReactNode } from "react";

import type { ArticleBrief } from "../../types/suggestion";

interface Props {
  sourceArticle: ArticleBrief;
  siteId: number;
  siteName: string;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
  children: ReactNode;
}

const articlePath = (url: string) =>
  url.replace(/^https?:\/\/[^/]+/i, "") || url;

export default function SuggestionGroup({
  sourceArticle,
  siteId,
  siteName,
  count,
  collapsed,
  onToggle,
  children,
}: Props) {
  const headingId = `source-group-${siteId}-${sourceArticle.id}`;
  const listId = `${headingId}-suggestions`;
  const path = articlePath(sourceArticle.url);
  const action = collapsed ? "Expand" : "Collapse";

  return (
    <section
      aria-labelledby={headingId}
      className="overflow-hidden rounded-xxl border border-hairline bg-surface-card"
    >
      <div className="flex items-center gap-4 border-b border-hairline bg-canvas-soft px-5 py-4">
        <button
          type="button"
          aria-expanded={!collapsed}
          aria-controls={listId}
          aria-label={`${action} suggestions for ${sourceArticle.title} (${path})`}
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
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
        <span className="badge flex-none">
          {count} {count === 1 ? "suggestion" : "suggestions"}
        </span>
      </div>

      <div id={listId} hidden={collapsed}>
        <ul className="flex flex-col gap-2.5 p-2.5">{children}</ul>
      </div>
    </section>
  );
}

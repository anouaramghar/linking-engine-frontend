import { memo } from "react";

import {
  METHOD_LABEL,
  STATUS_META,
  TARGET_ORIGIN_LABEL,
  isReversible,
  pct,
} from "../../lib/utils";
import type { Suggestion } from "../../types/suggestion";

interface Props {
  suggestion: Suggestion;
  siteName: string;
  selected: boolean;
  /**
   * Handlers take the id rather than closing over it. A queue can hold hundreds
   * of mounted rows and the cursor moves on every `j`/`k`, so the parent has to
   * be able to hand down callbacks whose identity never changes — otherwise the
   * memo below compares fresh closures and every row re-renders per keypress.
   */
  onOpen: (id: number) => void;
  onAccept: (id: number) => void;
  onReject: (id: number) => void;
  onUndo: (id: number) => void;
  showSource?: boolean;
  /** Set on the keyboard cursor's row so the queue can scroll it into view. */
  containerRef?: React.Ref<HTMLLIElement>;
}

function SuggestionCard({
  suggestion: s,
  siteName,
  selected,
  onOpen,
  onAccept,
  onReject,
  onUndo,
  showSource = true,
  containerRef,
}: Props) {
  const meta = STATUS_META[s.status];

  const method = METHOD_LABEL[s.method] ?? s.method;

  return (
    <li
      ref={containerRef}
      aria-current={selected || undefined}
      className={`card flex animate-rowIn flex-col items-stretch gap-3 px-4 py-4 transition-shadow hover:shadow-soft lg:flex-row lg:items-center lg:gap-4 lg:px-5 ${
        selected ? "border-ink" : ""
      }`}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3 lg:items-center">
        <span aria-hidden="true" className={`dot mt-2 lg:mt-0 ${meta.dot}`} />
        {/* A real button so the preview is reachable by keyboard, with the row
            actions kept outside it rather than nested inside a control. */}
        <button
          type="button"
          onClick={() => onOpen(s.id)}
          aria-label={`Open suggestion: ${s.source_article.title} to ${s.target_article.title}`}
          className="flex min-w-0 flex-1 flex-col items-stretch gap-3 text-left sm:flex-row sm:items-center sm:gap-4"
        >
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-baseline gap-2 text-body-sm">
              {showSource ? (
                <>
                  <span className="font-medium text-ink">{s.source_article.title}</span>
                  <span aria-hidden className="text-muted">
                    &rarr;
                  </span>
                </>
              ) : (
                <span className="text-muted">Links to</span>
              )}
              <span className={showSource ? "text-body" : "font-medium text-ink"}>
                {s.target_article.title}
              </span>
              <span className="badge">{TARGET_ORIGIN_LABEL[s.target_origin]}</span>
            </span>
            <span className="mt-2 flex flex-wrap items-center gap-3">
              {s.anchor_text && (
                <span className="rounded-pill bg-surface-strong px-3 py-0.5 text-caption text-ink">
                  &ldquo;{s.anchor_text}&rdquo;
                </span>
              )}
              <span className="text-caption text-muted">{siteName}</span>
              {s.target_origin === "content_pool" && (
                <span className="text-caption text-muted">{s.target_site_name}</span>
              )}
              <span className="rounded-pill border border-hairline px-2.5 py-1 text-caption-upper uppercase text-muted">
                {method}
              </span>
            </span>
          </span>
          <span className="w-full flex-none text-left sm:w-[104px] sm:text-right">
            <span className="block text-body-md font-medium text-ink">{pct(s.score)}</span>
            <span className="mb-1 mt-2 block h-[3px] overflow-hidden rounded-pill bg-hairline">
              <span
                className="block h-full rounded-pill bg-primary"
                style={{ width: pct(s.score) }}
              />
            </span>
            <span className="block text-caption-sm text-muted">Semantic match</span>
          </span>
        </button>
      </div>
      {/* Fixed to the widest reversible state so the status badge and Undo
          stay inside their column instead of spilling over the score. */}
      <div className="flex w-full flex-none flex-wrap items-center justify-end gap-2 lg:w-[272px]">
        {s.status === "pending" ? (
          <>
            <button
              onClick={(event) => {
                event.stopPropagation();
                onAccept(s.id);
              }}
              className="btn btn-primary btn-sm"
            >
              Accept
            </button>
            <button
              onClick={(event) => {
                event.stopPropagation();
                onReject(s.id);
              }}
              className="btn btn-outline btn-sm"
            >
              Reject
            </button>
          </>
        ) : (
          <>
            <span className="badge">{meta.label}</span>
            {isReversible(s.status) && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onUndo(s.id);
                }}
                className="btn btn-outline btn-sm"
              >
                Undo
              </button>
            )}
          </>
        )}
      </div>
    </li>
  );
}

/**
 * Memoised because the queue mounts up to a full page of these and the cursor
 * moves through them one keystroke at a time. With stable handlers from the
 * parent, only the two rows whose `selected` actually flipped re-render.
 */
export default memo(SuggestionCard);

import { memo } from "react";

import { STATUS_META, TARGET_ORIGIN_LABEL, isReversible, pct } from "../../lib/utils";
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
  onReviewPublication?: (id: number) => void;
  actionsDisabled?: boolean;
  showSource?: boolean;
  showStatusBadge?: boolean;
}

function SuggestionCard({
  suggestion: s,
  siteName,
  selected,
  onOpen,
  onAccept,
  onReject,
  onUndo,
  onReviewPublication,
  actionsDisabled = false,
  showSource = true,
  showStatusBadge = true,
}: Props) {
  const meta = STATUS_META[s.status];

  return (
    <li
      data-suggestion-id={s.id}
      aria-current={selected || undefined}
      className={`card queue-row flex flex-col items-stretch gap-2.5 px-3.5 py-3 hover:shadow-soft sm:px-4 lg:flex-row lg:items-center lg:gap-4 ${
        selected ? "border-ink" : ""
      }`}
    >
      <div className="flex min-w-0 flex-1 items-start gap-2.5 lg:items-center">
        <span aria-hidden="true" className={`dot mt-1.5 flex-none lg:mt-0 ${meta.dot}`} />
        {/* A real button so the preview is reachable by keyboard, with the row
            actions kept outside it rather than nested inside a control. */}
        <button
          type="button"
          onClick={() => onOpen(s.id)}
          aria-label={`Open suggestion: ${s.source_article.title} to ${s.target_article.title}; rank score ${pct(s.rank_score)}`}
          className="flex min-w-0 flex-1 items-start gap-3 text-left sm:items-center"
        >
          <span className="min-w-0 flex-1">
            <span className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1 text-body-sm">
              {showSource ? (
                <>
                  <span className="font-medium text-ink">{s.source_article.title}</span>
                  <span aria-hidden className="text-muted">
                    &rarr;
                  </span>
                </>
              ) : (
                <span className="text-muted">Target</span>
              )}
              <span className={showSource ? "text-body" : "font-medium text-ink"}>
                {s.target_article.title}
              </span>
              <span className="badge">{TARGET_ORIGIN_LABEL[s.target_origin]}</span>
              {s.target_origin !== "internal" && (
                <span className="text-caption text-muted">{s.target_site_name}</span>
              )}
            </span>
          </span>
          <span className="flex w-score flex-none flex-col items-end text-right">
            <span className="block tabular-nums text-body-md font-medium text-ink">
              {pct(s.rank_score)}
            </span>
            <span className="mb-1 mt-1 block h-meter w-full overflow-hidden rounded-pill bg-hairline">
              {/* The rank score is the one measured quantity on the row, and it
                  used to arrive already drawn. Sweeping it out of the track from
                  the left makes a page of rows read as a page of readings — and
                  the sweep is `scaleX` on a span already sized to the score, so
                  the hundred meters the queue can mount cost transforms rather
                  than a hundred width-driven layouts. */}
              <span
                className="block h-full origin-left animate-meterFill rounded-pill bg-primary"
                style={{ width: pct(s.rank_score) }}
              />
            </span>
            {/* The queue is ordered by this number, so a page of rows descends
                visibly. Cosine similarity is still on the row's detail panel;
                it is not here because it barely moves — a whole queue lands in
                a band a few points wide, which draws a hundred identical
                meters and tells an editor nothing about which to read first. */}
            <span className="block text-caption-sm text-muted">Rank score</span>
          </span>
        </button>
      </div>
      {/* Keep the decision column stable so row content never shifts when a
          status badge or Undo action replaces Select and Reject. */}
      <div
        className={`flex w-full flex-none flex-wrap items-center justify-end gap-2 ${
          s.status === "approved" && onReviewPublication
            ? "lg:w-decision-review"
            : "lg:w-decision"
        }`}
      >
        {s.status === "pending" ? (
          <>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onAccept(s.id);
              }}
              aria-label={`Select suggestion from ${siteName}: ${s.source_article.title} to ${s.target_article.title}`}
              disabled={actionsDisabled}
              className="btn btn-primary btn-sm"
            >
              Select
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                onReject(s.id);
              }}
              aria-label={`Reject suggestion from ${siteName}: ${s.source_article.title} to ${s.target_article.title}`}
              disabled={actionsDisabled}
              className="btn btn-outline btn-sm"
            >
              Reject
            </button>
          </>
        ) : (
          <>
            {/* The tint is a utility over `.badge`'s component-layer fill, so
                a status with no tint keeps the neutral pill unchanged. */}
            {showStatusBadge && (
              <span className={`badge ${meta.tint}`}>{meta.label}</span>
            )}
            {s.status === "approved" && onReviewPublication && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onReviewPublication(s.id);
                }}
                aria-label={`Review exact edit for suggestion from ${siteName}: ${s.source_article.title} to ${s.target_article.title}`}
                disabled={actionsDisabled}
                className="btn btn-primary btn-sm"
              >
                Review exact edit
              </button>
            )}
            {isReversible(s.status) && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onUndo(s.id);
                }}
                aria-label={`Undo decision for suggestion from ${siteName}: ${s.source_article.title} to ${s.target_article.title}`}
                disabled={actionsDisabled}
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

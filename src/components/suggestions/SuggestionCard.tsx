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
  actionsDisabled?: boolean;
  showSource?: boolean;
}

function SuggestionCard({
  suggestion: s,
  siteName,
  selected,
  onOpen,
  onAccept,
  onReject,
  onUndo,
  actionsDisabled = false,
  showSource = true,
}: Props) {
  const meta = STATUS_META[s.status];

  return (
    <li
      data-suggestion-id={s.id}
      aria-current={selected || undefined}
      className={`card flex animate-rowIn flex-col items-stretch gap-2.5 px-3.5 py-3 transition-shadow hover:shadow-soft sm:px-4 lg:flex-row lg:items-center lg:gap-4 ${
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
          aria-label={`Open suggestion: ${s.source_article.title} to ${s.target_article.title}`}
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
                <span className="text-muted">Links to</span>
              )}
              <span className={showSource ? "text-body" : "font-medium text-ink"}>
                {s.target_article.title}
              </span>
              <span className="badge">{TARGET_ORIGIN_LABEL[s.target_origin]}</span>
            </span>
          </span>
          <span className="flex w-[72px] flex-none flex-col items-end text-right sm:w-[104px]">
            <span className="block text-body-md font-medium text-ink">{pct(s.score)}</span>
            <span className="mb-1 mt-1 block h-[3px] w-full overflow-hidden rounded-pill bg-hairline">
              <span
                className="block h-full rounded-pill bg-primary"
                style={{ width: pct(s.score) }}
              />
            </span>
            <span className="block text-caption-sm text-muted">Semantic match</span>
          </span>
        </button>
      </div>
      {/* Keep the decision column stable so row content never shifts when a
          status badge or Undo action replaces Select and Reject. */}
      <div className="flex w-full flex-none flex-wrap items-center justify-end gap-2 lg:w-[220px]">
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
            <span className="badge">{meta.label}</span>
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

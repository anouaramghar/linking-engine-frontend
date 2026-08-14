import { useRef } from "react";

import { useFocusTrap } from "../../hooks/useFocusTrap";
import { OVERLAY_PREVIEW_QUERY, useMediaQuery } from "../../hooks/useMediaQuery";
import {
  PUBLICATION_STATUS_MESSAGE,
  STATUS_META,
  TARGET_ORIGIN_LABEL,
  isReversible,
} from "../../lib/utils";
import type { Suggestion } from "../../types/suggestion";
import PlacementContextCard from "./PlacementContextCard";
import type { PlacementState } from "./PlacementContextCard";
import SuggestionTraceCard from "./SuggestionTraceCard";
import type { SuggestionTraceState } from "./SuggestionTraceCard";

interface Props {
  suggestion: Suggestion;
  siteName: string;
  /** Generated per suggestion, so it is fetched by the page that knows which
   *  one is open rather than by this component. */
  placement: PlacementState;
  /** Loaded lazily for the open drawer, just like placement context. */
  trace?: SuggestionTraceState;
  onClose: () => void;
  onAccept: () => void;
  onReject: () => void;
  onUndo: () => void;
  onReviewPublication?: () => void;
  actionsDisabled?: boolean;
}

export default function SuggestionPreview({
  suggestion: s,
  siteName,
  placement,
  trace,
  onClose,
  onAccept,
  onReject,
  onUndo,
  onReviewPublication,
  actionsDisabled = false,
}: Props) {
  const slug = s.target_article.url.replace(/^https?:\/\/[^/]+/, "") || s.target_article.url;
  const publicationMessage = PUBLICATION_STATUS_MESSAGE[s.status];
  // Beside the list this is ordinary page content; over the list it is a dialog.
  // The trap follows the same switch, so Tab only stops escaping once there is
  // something behind the panel to escape into.
  const overlaid = useMediaQuery(OVERLAY_PREVIEW_QUERY);
  const panel = useRef<HTMLElement>(null);
  const onKeyDown = useFocusTrap(panel, onClose, overlaid);

  const panelClass =
    "h-full min-h-0 w-full flex-none overflow-y-auto border-l border-hairline bg-canvas-soft p-5 sm:w-[410px] sm:p-8";

  const body = (
    <>
      <div className="mb-5 flex items-center justify-between">
        <div className="eyebrow">Suggestion #{String(s.id).padStart(3, "0")}</div>
        <div className="-mr-2 -mt-2 flex items-center">
          <button
            aria-label="Close preview"
            onClick={onClose}
            className="inline-flex h-11 w-11 items-center justify-center rounded-pill text-title-md leading-none text-muted hover:bg-surface-strong hover:text-ink"
          >
            &times;
          </button>
        </div>
      </div>

      <div className="eyebrow mb-2">Source article</div>
      <div className="break-words font-serif text-display-sm text-ink">{s.source_article.title}</div>
      <div className="mb-4 mt-2 text-caption text-muted">
        {siteName} &middot;{" "}
        <a
          href={s.source_article.url}
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2 hover:text-ink"
        >
          Open source article
        </a>
      </div>

      <PlacementContextCard placement={placement} />

      <div className="eyebrow mb-2 mt-5">Target article</div>
      <div className="rounded-xl bg-surface-strong p-4">
        <div className="break-words text-body-sm font-medium leading-snug text-ink">
          {s.target_article.title}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="badge">{TARGET_ORIGIN_LABEL[s.target_origin]}</span>
          {s.target_origin !== "internal" && (
            <span className="text-caption text-muted">{s.target_site_name}</span>
          )}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-caption text-muted">
          <span className="min-w-0 max-w-full break-all">{slug}</span>
          <a
            href={s.target_article.url}
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2 hover:text-ink"
          >
            Open target article
          </a>
        </div>
        {s.anchor_text && (
          <div className="mt-2 text-caption text-muted">
            Suggested anchor: <span className="font-medium text-ink">{s.anchor_text}</span>
          </div>
        )}
        {s.target_origin === "web_search" && s.external_snippet && (
          <p className="mt-3 text-caption leading-relaxed text-body">{s.external_snippet}</p>
        )}
        {s.target_origin === "web_search" && s.search_query && (
          <div className="mt-2 text-caption-sm text-muted">Search query: {s.search_query}</div>
        )}
      </div>

      {trace && <SuggestionTraceCard suggestion={s} trace={trace} />}

      {s.status === "pending" ? (
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            onClick={onAccept}
            disabled={actionsDisabled}
            className="btn btn-primary flex-1"
          >
            Select for review
          </button>
          <button
            type="button"
            onClick={onReject}
            disabled={actionsDisabled}
            className="btn btn-outline"
          >
            Reject
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex min-h-10 items-center justify-center gap-2 rounded-pill bg-surface-strong px-4 text-caption-upper uppercase text-ink">
            <span className={`dot ${STATUS_META[s.status].dot}`} />
            {STATUS_META[s.status].label}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            {s.status === "approved" && onReviewPublication && (
              <button
                type="button"
                onClick={onReviewPublication}
                disabled={actionsDisabled}
                className="btn btn-primary flex-1"
              >
                Review exact edit
              </button>
            )}
            {isReversible(s.status) && (
              <button
                type="button"
                onClick={onUndo}
                disabled={actionsDisabled}
                className="btn btn-outline"
              >
                Undo
              </button>
            )}
          </div>
        </div>
      )}

      {publicationMessage && (
        <div aria-label="Publish status" className="card mt-3 px-4 py-3">
          <div className="eyebrow">Publish status</div>
          <div className="mt-1 text-caption font-medium text-body">{publicationMessage}</div>
          {s.status === "failed" && s.publish_error && (
            <div className="mt-2 break-words text-caption leading-normal text-error-ink">
              {s.publish_error}
            </div>
          )}
        </div>
      )}

      {s.status === "pending" && (
        <div className="mt-3 text-caption leading-normal text-muted">
          Selection adds this suggestion to the review tray; it is not published until the exact
          edit is approved.
        </div>
      )}
      {s.status === "rejected" && (
        <div className="mt-3 text-caption leading-normal text-muted">
          Rejected suggestions are not published.
        </div>
      )}
    </>
  );

  if (!overlaid) {
    return (
      <aside
        data-suggestion-id={s.id}
        aria-label="Suggestion detail"
        className={panelClass}
      >
        {body}
      </aside>
    );
  }

  return (
    // Covers the queue pane rather than the whole window, so the nav stays
    // reachable — this is a detail drawer, not a task that blocks the app.
    <div
      className="absolute inset-0 z-30 flex justify-end bg-canvas-deep/40"
      // mousedown, not click: releasing a selection made inside the panel must
      // not count as a click on the backdrop and shut it.
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside
        ref={panel}
        data-suggestion-id={s.id}
        role="dialog"
        aria-modal="true"
        aria-label="Suggestion detail"
        tabIndex={-1}
        onKeyDown={onKeyDown}
        // A strip of the list stays visible so the panel reads as covering it
        // rather than as the page having navigated somewhere else.
        className={`${panelClass} max-w-[calc(100%-1rem)] shadow-drawer focus:outline-none sm:max-w-[calc(100%-2rem)]`}
      >
        {body}
      </aside>
    </div>
  );
}

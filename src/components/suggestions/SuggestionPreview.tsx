import { useRef } from "react";

import { useFocusTrap } from "../../hooks/useFocusTrap";
import { OVERLAY_PREVIEW_QUERY, useMediaQuery } from "../../hooks/useMediaQuery";
import {
  PUBLICATION_STATUS_MESSAGE,
  STATUS_META,
  isReversible,
  pct,
} from "../../lib/utils";
import type { Suggestion } from "../../types/suggestion";

interface Props {
  suggestion: Suggestion;
  siteName: string;
  onClose: () => void;
  onAccept: () => void;
  onReject: () => void;
  onUndo: () => void;
}

export default function SuggestionPreview({
  suggestion: s,
  siteName,
  onClose,
  onAccept,
  onReject,
  onUndo,
}: Props) {
  const slug = s.target_article.url.replace(/^https?:\/\/[^/]+/, "") || s.target_article.url;
  const publicationMessage = PUBLICATION_STATUS_MESSAGE[s.status];
  const scoringSignals = [
    "Semantic relevance",
    "Shared taxonomy",
    "Target need",
    "Direction fit",
  ] as const;
  // Beside the list this is ordinary page content; over the list it is a dialog.
  // The trap follows the same switch, so Tab only stops escaping once there is
  // something behind the panel to escape into.
  const overlaid = useMediaQuery(OVERLAY_PREVIEW_QUERY);
  const panel = useRef<HTMLElement>(null);
  const onKeyDown = useFocusTrap(panel, onClose, overlaid);

  const panelClass =
    "w-[410px] flex-none overflow-y-auto border-l border-hairline bg-canvas-soft p-8";

  const body = (
    <>
      <div className="mb-5 flex items-center justify-between">
        <div className="eyebrow">Suggestion #{String(s.id).padStart(3, "0")}</div>
        <button
          aria-label="Close preview"
          onClick={onClose}
          className="rounded-pill px-2 py-1 text-title-md leading-none text-muted hover:bg-surface-strong hover:text-ink"
        >
          &times;
        </button>
      </div>

      <div className="eyebrow mb-2">Source article</div>
      <div className="font-serif text-display-sm text-ink">{s.source_article.title}</div>
      <div className="mb-4 mt-2 text-caption text-muted">
        {siteName} &middot;{" "}
        <a
          href={s.source_article.url}
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2 hover:text-ink"
        >
          open article
        </a>
      </div>

      <div className="card px-5 py-4">
        <div className="eyebrow">Placement context</div>
        <div className="mt-2 text-body-sm font-medium text-ink">Soon</div>
      </div>

      <div className="eyebrow mb-2 mt-5">Links to &rarr;</div>
      <div className="rounded-xl bg-surface-strong p-4">
        <div className="text-body-sm font-medium leading-snug text-ink">
          {s.target_article.title}
        </div>
        <div className="mt-1 text-caption text-muted">{slug}</div>
        {s.anchor_text && (
          <div className="mt-2 text-caption text-muted">
            Suggested anchor: <span className="font-medium text-ink">{s.anchor_text}</span>
          </div>
        )}
      </div>

      <div className="my-5 grid grid-cols-2 gap-2.5">
        <div className="relative overflow-hidden rounded-xxl border border-hairline bg-canvas-soft p-4">
          <div className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-[radial-gradient(circle,theme(colors.orb-sky/40%),transparent_70%)]" />
          <div className="eyebrow">Cosine baseline</div>
          <div className="mt-2 font-serif text-display-md text-ink">{pct(s.score)}</div>
        </div>
        <div className="rounded-xxl border border-hairline bg-surface-card p-4">
          <div className="eyebrow">GraphSAGE</div>
          <div className="mt-2 font-serif text-display-md text-muted">Soon</div>
        </div>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-2.5 text-caption">
        {scoringSignals.map((label) => (
          <div className="card px-4 py-3" key={label}>
            <div className="text-muted">{label}</div>
            <div className="mt-1 font-medium text-ink">Soon</div>
          </div>
        ))}
      </div>

      {s.status === "pending" ? (
        <div className="flex gap-2">
          <button onClick={onAccept} className="btn btn-primary flex-1">
            Accept & queue placement
          </button>
          <button onClick={onReject} className="btn btn-outline">
            Reject
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <div className="flex h-10 flex-1 items-center justify-center gap-2 rounded-pill bg-surface-strong px-4 text-caption-upper uppercase text-ink">
            <span className={`dot ${STATUS_META[s.status].dot}`} />
            {STATUS_META[s.status].label}
          </div>
          {isReversible(s.status) && (
            <button type="button" onClick={onUndo} className="btn btn-outline">
              Undo
            </button>
          )}
        </div>
      )}

      {publicationMessage && (
        <div aria-label="Publish status" className="card mt-3 px-4 py-3">
          <div className="eyebrow">Publish status</div>
          <div className="mt-1 text-caption font-medium text-body">{publicationMessage}</div>
        </div>
      )}

      {s.status === "pending" && (
        <div className="mt-3 text-caption leading-normal text-muted">
          Accepting this suggestion queues it for a future publish batch.
        </div>
      )}
      {s.status === "rejected" && (
        <div className="mt-3 text-caption leading-normal text-muted">
          Rejected suggestions are not included in publish batches.
        </div>
      )}
    </>
  );

  if (!overlaid) {
    return (
      <aside aria-label="Suggestion detail" className={panelClass}>
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
        role="dialog"
        aria-modal="true"
        aria-label="Suggestion detail"
        tabIndex={-1}
        onKeyDown={onKeyDown}
        // A strip of the list stays visible so the panel reads as covering it
        // rather than as the page having navigated somewhere else.
        className={`${panelClass} max-w-[calc(100%-2rem)] shadow-drawer focus:outline-none`}
      >
        {body}
      </aside>
    </div>
  );
}

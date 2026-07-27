import { useRef } from "react";

import { useFocusTrap } from "../../hooks/useFocusTrap";
import { OVERLAY_PREVIEW_QUERY, useMediaQuery } from "../../hooks/useMediaQuery";
import {
  METHOD_LABEL,
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
  // Beside the list this is ordinary page content; over the list it is a dialog.
  // The trap follows the same switch, so Tab only stops escaping once there is
  // something behind the panel to escape into.
  const overlaid = useMediaQuery(OVERLAY_PREVIEW_QUERY);
  const panel = useRef<HTMLElement>(null);
  const onKeyDown = useFocusTrap(panel, onClose, overlaid);

  const panelClass =
    "w-[410px] flex-none overflow-y-auto border-l border-stone-200 bg-stone-50 p-7";

  const body = (
    <>
      <div className="mb-5 flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-widest text-stone-600">
          Suggestion #{String(s.id).padStart(3, "0")}
        </div>
        <button
          aria-label="Close preview"
          onClick={onClose}
          className="rounded-full px-2 py-1 text-lg leading-none text-stone-600 hover:bg-chip hover:text-stone-950"
        >
          &times;
        </button>
      </div>

      <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-stone-600">
        Source article
      </div>
      <div className="font-serif text-2xl leading-snug">{s.source_article.title}</div>
      <div className="mb-4 mt-1.5 text-[13px] text-stone-600">
        {siteName} &middot;{" "}
        <a
          href={s.source_article.url}
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2"
        >
          open article
        </a>
      </div>

      <div className="mb-2 mt-5 text-xs font-semibold uppercase tracking-widest text-stone-600">
        Links to &rarr;
      </div>
      <div className="rounded-2xl bg-chip px-4 py-4">
        <div className="text-[15px] font-medium leading-snug text-stone-950">
          {s.target_article.title}
        </div>
        <div className="mt-1 text-[12.5px] text-stone-600">{slug}</div>
        {s.anchor_text && (
          <div className="mt-2 text-[12.5px] text-stone-600">
            Suggested anchor: <span className="font-medium">{s.anchor_text}</span>
          </div>
        )}
      </div>

      <div className="my-5">
        <div className="relative overflow-hidden rounded-2xl border border-stone-200 bg-white px-4 py-4">
          <div className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-[radial-gradient(circle,rgba(168,200,232,.4),transparent_70%)]" />
          <div className="text-[11px] font-semibold uppercase tracking-widest text-stone-600">
            {METHOD_LABEL[s.method] ?? s.method}
          </div>
          <div className="mt-1.5 font-serif text-3xl text-stone-950">{pct(s.score)}</div>
        </div>
      </div>

      {s.status === "pending" ? (
        <div className="flex gap-2">
          <button
            onClick={onAccept}
            className="flex-1 rounded-full border border-stone-800 bg-stone-800 py-3 text-[15px] font-medium text-white hover:bg-stone-950"
          >
            Accept & queue placement
          </button>
          <button
            onClick={onReject}
            className="rounded-full border border-stone-300 px-[18px] py-3 text-[15px] font-medium text-stone-950 hover:border-stone-950"
          >
            Reject
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <div
            className={`flex-1 rounded-full bg-chip px-4 py-3 text-center text-sm font-medium ${STATUS_META[s.status].fg}`}
          >
            {STATUS_META[s.status].label}
          </div>
          {isReversible(s.status) && (
            <button
              type="button"
              onClick={onUndo}
              className="rounded-full border border-stone-300 px-[18px] py-3 text-sm font-medium text-stone-950 hover:border-stone-950"
            >
              Undo
            </button>
          )}
        </div>
      )}

      {publicationMessage && (
        <div
          aria-label="Publish status"
          className="mt-3 rounded-2xl border border-stone-200 bg-white px-4 py-3"
        >
          <div className="text-[11px] font-semibold uppercase tracking-widest text-stone-600">
            Publish status
          </div>
          <div className="mt-1 text-[13px] font-medium text-stone-700">
            {publicationMessage}
          </div>
        </div>
      )}

      {s.status === "pending" && (
        <div className="mt-3 text-[12.5px] leading-normal text-stone-600">
          Accepting this suggestion queues it for a future publish batch.
        </div>
      )}
      {s.status === "rejected" && (
        <div className="mt-3 text-[12.5px] leading-normal text-stone-600">
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
      className="absolute inset-0 z-30 flex justify-end bg-stone-950/40"
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
        className={`${panelClass} max-w-[calc(100%-2rem)] shadow-[0_8px_40px_rgba(0,0,0,.16)] focus:outline-none`}
      >
        {body}
      </aside>
    </div>
  );
}

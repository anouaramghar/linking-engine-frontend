import { useEffect, useRef } from "react";

export type NoticeTone = "info" | "error";

export interface NoticeState {
  message: string;
  tone: NoticeTone;
  /** Suggestions this notice can walk back, when the action is reversible. */
  undoIds?: number[];
  /** Server-side cohort used when a filtered operation is too large to return IDs. */
  undoOperationId?: string;
}

/**
 * A successful operation uses the success fill; a failure uses the error fill.
 *
 * Both invert, so both flip the focus ring with them — the app's ink ring is
 * invisible on either, and Undo is the last control that should be hard to
 * find with a keyboard.
 */
const TONE: Record<NoticeTone, string> = {
  info: "bg-success text-on-dark focus-ring-inverse",
  error: "bg-error text-on-dark focus-ring-inverse",
};

/** Keep operation feedback brief and out of the editor's way. */
const AUTO_DISMISS_MS = 2000;

interface Props {
  notice: NoticeState;
  onDismiss: () => void;
  onUndo?: () => void;
  undoPending?: boolean;
  onRetry?: () => void;
  retryPending?: boolean;
}

export default function Notice({
  notice,
  onDismiss,
  onUndo,
  undoPending,
  onRetry,
  retryPending,
}: Props) {
  const canUndo =
    !!onUndo && (!!notice.undoIds?.length || !!notice.undoOperationId);

  // Held in a ref so an inline parent callback can't restart the countdown on
  // every re-render — the timer belongs to this notice, not to this render.
  // Assigned in an effect, never during render, so a discarded concurrent
  // render cannot leave the ref pointing at a callback that never committed.
  const dismiss = useRef(onDismiss);
  useEffect(() => {
    dismiss.current = onDismiss;
  });

  useEffect(() => {
    const timer = setTimeout(() => dismiss.current(), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  return (
    <div
      // A failure interrupts; a confirmation waits its turn. `alert` is
      // assertive, so it reaches a screen reader at the moment it matters
      // rather than after whatever is already being read.
      role={notice.tone === "error" ? "alert" : "status"}
      className={`fixed right-4 top-4 z-[70] flex max-w-[calc(100vw-2rem)] items-center gap-2 rounded-lg px-3 py-2 text-caption shadow-drawer sm:max-w-sm ${TONE[notice.tone]}`}
    >
      <span className="min-w-0 flex-1">{notice.message}</span>
      {canUndo && (
        <button
          type="button"
          onClick={onUndo}
          disabled={undoPending}
          className="inline-flex min-h-8 flex-none items-center rounded-pill border border-on-dark/40 px-2.5 text-caption-sm font-medium hover:bg-on-dark/15 disabled:opacity-50"
        >
          {undoPending ? "Undoing…" : "Undo"}
        </button>
      )}
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          disabled={retryPending}
          className="inline-flex min-h-8 flex-none items-center rounded-pill border border-on-dark/40 px-2.5 text-caption-sm font-medium hover:bg-on-dark/15 disabled:opacity-50"
        >
          {retryPending ? "Retrying…" : "Retry failed only"}
        </button>
      )}
      <button
        type="button"
        aria-label="Dismiss message"
        onClick={onDismiss}
        className="inline-flex h-8 w-8 flex-none items-center justify-center rounded-pill text-body-md leading-none text-on-dark hover:bg-on-dark/15"
      >
        &times;
      </button>
    </div>
  );
}

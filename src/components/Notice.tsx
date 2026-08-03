import { useEffect, useRef } from "react";

export type NoticeTone = "info" | "error";

export interface NoticeState {
  message: string;
  tone: NoticeTone;
  /** Suggestions this notice can walk back, when the action is reversible. */
  undoIds?: number[];
}

/**
 * A confirmation is the ink surface the system already uses for its dark
 * inversions; a failure is the one place {colors.semantic-error} earns a fill.
 *
 * Both invert, so both flip the focus ring with them — the app's ink ring is
 * invisible on either, and Undo is the last control that should be hard to
 * find with a keyboard.
 */
const TONE: Record<NoticeTone, string> = {
  info: "bg-surface-dark text-on-dark focus-ring-inverse",
  error: "bg-error text-on-dark focus-ring-inverse",
};

/** Long enough to read and act on an undo; errors stay until dismissed. */
const AUTO_DISMISS_MS = 8000;

interface Props {
  notice: NoticeState;
  onDismiss: () => void;
  onUndo?: () => void;
  undoPending?: boolean;
}

export default function Notice({ notice, onDismiss, onUndo, undoPending }: Props) {
  const canUndo = !!onUndo && !!notice.undoIds?.length;

  // Held in a ref so an inline parent callback can't restart the countdown on
  // every re-render — the timer belongs to this notice, not to this render.
  // Assigned in an effect, never during render, so a discarded concurrent
  // render cannot leave the ref pointing at a callback that never committed.
  const dismiss = useRef(onDismiss);
  useEffect(() => {
    dismiss.current = onDismiss;
  });

  useEffect(() => {
    if (notice.tone === "error") return;
    const timer = setTimeout(() => dismiss.current(), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  return (
    <div
      // A failure interrupts; a confirmation waits its turn. `alert` is
      // assertive, so it reaches a screen reader at the moment it matters
      // rather than after whatever is already being read.
      role={notice.tone === "error" ? "alert" : "status"}
      className={`mb-3 flex flex-wrap items-center gap-3 rounded-lg px-4 py-2.5 text-caption ${TONE[notice.tone]}`}
    >
      <span className="min-w-0 flex-1">{notice.message}</span>
      {canUndo && (
        <button
          type="button"
          onClick={onUndo}
          disabled={undoPending}
          className="touch-target inline-flex min-h-11 items-center rounded-pill border border-on-dark/40 px-3 text-caption font-medium hover:bg-on-dark/15 disabled:opacity-50 sm:min-h-8"
        >
          {undoPending ? "Undoing…" : "Undo"}
        </button>
      )}
      <button
        type="button"
        aria-label="Dismiss message"
        onClick={onDismiss}
        className="inline-flex h-11 w-11 items-center justify-center rounded-pill text-body-md leading-none text-on-dark-soft hover:bg-on-dark/15 hover:text-on-dark"
      >
        &times;
      </button>
    </div>
  );
}

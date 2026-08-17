import { useCallback, useEffect, useRef } from "react";

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

/** Informational notices without recovery stay visible long enough to read. */
const AUTO_DISMISS_MS = 8000;

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

  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const timerStartedAt = useRef<number | null>(null);
  const remainingMs = useRef(AUTO_DISMISS_MS);
  const hovering = useRef(false);
  const focused = useRef(false);

  const clearAutoDismiss = useCallback(() => {
    if (timer.current === undefined) return;
    clearTimeout(timer.current);
    timer.current = undefined;
    if (timerStartedAt.current !== null) {
      remainingMs.current = Math.max(
        0,
        remainingMs.current - (Date.now() - timerStartedAt.current),
      );
      timerStartedAt.current = null;
    }
  }, []);

  const startAutoDismiss = useCallback(() => {
    if (
      timer.current !== undefined ||
      hovering.current ||
      focused.current ||
      remainingMs.current <= 0
    ) {
      return;
    }

    timerStartedAt.current = Date.now();
    timer.current = setTimeout(() => {
      timer.current = undefined;
      timerStartedAt.current = null;
      remainingMs.current = 0;
      dismiss.current();
    }, remainingMs.current);
  }, []);

  useEffect(() => {
    clearAutoDismiss();
    remainingMs.current = AUTO_DISMISS_MS;

    // A recoverable decision must remain available until the operator chooses
    // Undo or dismisses it; a timer would make the recovery path disappear.
    if (notice.tone === "error" || canUndo) return;
    startAutoDismiss();
    return clearAutoDismiss;
  }, [canUndo, clearAutoDismiss, notice, startAutoDismiss]);

  return (
    <div
      // A failure interrupts; a confirmation waits its turn. `alert` is
      // assertive, so it reaches a screen reader at the moment it matters
      // rather than after whatever is already being read.
      role={notice.tone === "error" ? "alert" : "status"}
      onMouseEnter={() => {
        hovering.current = true;
        clearAutoDismiss();
      }}
      onMouseLeave={() => {
        hovering.current = false;
        if (!focused.current) startAutoDismiss();
      }}
      onFocus={() => {
        focused.current = true;
        clearAutoDismiss();
      }}
      onBlur={(event) => {
        const next = event.relatedTarget;
        if (next instanceof Node && event.currentTarget.contains(next)) return;
        focused.current = false;
        if (!hovering.current) startAutoDismiss();
      }}
      className={`mb-3 flex flex-wrap items-center gap-3 rounded-lg px-4 py-2.5 text-caption ${TONE[notice.tone]}`}
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

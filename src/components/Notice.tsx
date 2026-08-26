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
 * The notice stays on the card surface so it can acknowledge an action
 * without becoming a full-width band of colour. The small mark and semantic
 * border carry the tone; the message carries the state.
 */
const TONE: Record<NoticeTone, { container: string; icon: string }> = {
  info: {
    container: "border-success/30 bg-surface-card text-ink",
    icon: "border-success/25 bg-tint-positive text-success",
  },
  error: {
    container: "border-error/30 bg-surface-card text-error-ink",
    icon: "border-error/25 bg-tint-negative text-error-ink",
  },
};

const ACTION_CLASS =
  "touch-target inline-flex min-h-9 flex-none items-center justify-center whitespace-nowrap rounded-pill border border-hairline-strong bg-surface-card px-3 text-caption-sm font-medium text-ink transition-[background-color,border-color,color,transform] duration-feedback ease-settle hover:border-ink hover:bg-surface-strong active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50";

function NoticeIcon({ tone }: { tone: NoticeTone }) {
  return (
    <span
      aria-hidden="true"
      className={`flex h-8 w-8 flex-none items-center justify-center rounded-full border ${TONE[tone].icon}`}
    >
      <svg
        className="h-4 w-4"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {tone === "error" ? (
          <>
            <path d="M8 2.5 14 13H2L8 2.5Z" />
            <path d="M8 6v3.25M8 11.25h.01" />
          </>
        ) : (
          <path d="m4 8.25 2.5 2.5L12 5.25" />
        )}
      </svg>
    </span>
  );
}

/** Informational notices without recovery stay visible long enough to read. */
const AUTO_DISMISS_MS = 8000;

interface Props {
  notice: NoticeState;
  onDismiss: () => void;
  onUndo?: () => void;
  undoPending?: boolean;
  onRetry?: () => void;
  retryPending?: boolean;
  retryLabel?: string;
}

export default function Notice({
  notice,
  onDismiss,
  onUndo,
  undoPending,
  onRetry,
  retryPending,
  retryLabel = "Retry failed only",
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
      // The notice drops in from the edge it is anchored to rather than
      // appearing between two frames. It reports something that just happened —
      // a batch approved, a publish rejected — and an outcome that materialises
      // with no arrival is one an operator can miss entirely while looking at
      // the row they were working on.
      className={`mb-4 flex w-full max-w-full animate-noticeIn flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border px-3.5 py-3 text-caption transition-[border-color,box-shadow] duration-state ease-settle hover:shadow-soft sm:px-4 ${TONE[notice.tone].container}`}
    >
      <NoticeIcon tone={notice.tone} />
      <span className="min-w-0 flex-1 leading-snug">{notice.message}</span>
      <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
        {canUndo && (
          <button type="button" onClick={onUndo} disabled={undoPending} className={ACTION_CLASS}>
            {undoPending ? "Undoing…" : "Undo"}
          </button>
        )}
        {onRetry && (
          <button type="button" onClick={onRetry} disabled={retryPending} className={ACTION_CLASS}>
            {retryPending ? "Retrying…" : retryLabel}
          </button>
        )}
        <button
          type="button"
          aria-label="Dismiss message"
          onClick={onDismiss}
          className="touch-target inline-flex h-9 w-9 flex-none items-center justify-center rounded-full border border-transparent text-muted transition-[background-color,color,transform] duration-feedback ease-settle hover:bg-surface-strong hover:text-ink active:scale-[0.97]"
        >
          <svg
            aria-hidden="true"
            className="h-4 w-4"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          >
            <path d="m4.25 4.25 7.5 7.5M11.75 4.25l-7.5 7.5" />
          </svg>
        </button>
      </div>
    </div>
  );
}

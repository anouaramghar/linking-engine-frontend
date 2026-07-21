import { useEffect, useRef } from "react";

export type NoticeTone = "info" | "error";

export interface NoticeState {
  message: string;
  tone: NoticeTone;
  /** Suggestions this notice can walk back, when the action is reversible. */
  undoIds?: number[];
}

const TONE: Record<NoticeTone, string> = {
  info: "bg-stone-800 text-white",
  error: "bg-red-700 text-white",
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
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;

  useEffect(() => {
    if (notice.tone === "error") return;
    const timer = setTimeout(() => dismiss.current(), AUTO_DISMISS_MS);
    return () => clearTimeout(timer);
  }, [notice]);

  return (
    <div
      role="status"
      className={`mb-3 flex flex-wrap items-center gap-3 rounded-xl px-4 py-2 text-sm ${TONE[notice.tone]}`}
    >
      <span className="min-w-0 flex-1">{notice.message}</span>
      {canUndo && (
        <button
          type="button"
          onClick={onUndo}
          disabled={undoPending}
          className="rounded-full border border-white/40 px-3 py-1 text-[13px] font-medium hover:bg-white/15 disabled:opacity-50"
        >
          {undoPending ? "Undoing…" : "Undo"}
        </button>
      )}
      <button
        type="button"
        aria-label="Dismiss message"
        onClick={onDismiss}
        className="rounded-full px-2 py-1 text-base leading-none text-white/70 hover:bg-white/15 hover:text-white"
      >
        &times;
      </button>
    </div>
  );
}

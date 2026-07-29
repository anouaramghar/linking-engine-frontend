import { useEffect, useRef } from "react";

export interface QueueShortcutHandlers {
  onNext: () => void;
  onPrevious: () => void;
  onAccept: () => void;
  onReject: () => void;
  onUndo: () => void;
  onEscape: () => void;
}

/** Typing in a field, or working inside a dialog, must never trigger a review. */
const isTyping = (target: EventTarget | null) => {
  const el = target as HTMLElement | null;
  if (!el?.tagName) return false;
  return (
    ["INPUT", "SELECT", "TEXTAREA"].includes(el.tagName) ||
    el.isContentEditable ||
    !!el.closest?.("[role='dialog']")
  );
};

const KEYS: Record<string, keyof QueueShortcutHandlers> = {
  j: "onNext",
  ArrowDown: "onNext",
  k: "onPrevious",
  ArrowUp: "onPrevious",
  a: "onAccept",
  r: "onReject",
  u: "onUndo",
  Escape: "onEscape",
};

/**
 * Review-queue keyboard control. The queue is a high-volume screen, so every
 * decision is reachable without leaving the home row.
 */
export const useQueueShortcuts = (handlers: QueueShortcutHandlers, enabled = true) => {
  // Committed in an effect rather than during render, so the listener always
  // calls handlers from a render that actually made it to the screen.
  const latest = useRef(handlers);
  useEffect(() => {
    latest.current = handlers;
  });

  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTyping(event.target)) return;

      const handler = KEYS[event.key];
      if (!handler) return;
      event.preventDefault();
      latest.current[handler]();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [enabled]);
};

export const SHORTCUT_HINT = "j/k move - a accept - r reject - u undo - Esc close";

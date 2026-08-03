import { useCallback, useEffect, useRef, useState } from "react";

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

export const SHORTCUT_HINT = "j/k move · a accept · r reject · u undo · Esc close";

const STORAGE_KEY = "linkmesh.queue-shortcuts";

/**
 * The on/off switch WCAG 2.1.4 asks for.
 *
 * `a` and `r` are unmodified single characters bound to the window, which is
 * the fast path this screen is built around — and also exactly the binding that
 * fires by accident under speech input or an unsteady hand. `isTyping` keeps
 * them out of fields, but a review is still one stray keystroke away, so the
 * editor gets to turn them off and have that stick.
 */
export const useShortcutsEnabled = () => {
  const [enabled, setEnabled] = useState(() => {
    try {
      return window.localStorage?.getItem(STORAGE_KEY) !== "off";
    } catch {
      // Storage can throw outright under a restrictive privacy setting.
      return true;
    }
  });

  const toggle = useCallback(
    () =>
      setEnabled((current) => {
        const next = !current;
        try {
          window.localStorage?.setItem(STORAGE_KEY, next ? "on" : "off");
        } catch {
          // The preference still holds for this session.
        }
        return next;
      }),
    [],
  );

  return { enabled, toggle };
};

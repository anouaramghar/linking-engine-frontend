import { useEffect, useRef } from "react";

export interface QueueShortcutHandlers {
  onNext: () => void;
  onPrevious: () => void;
  onAccept: () => void;
  onReject: () => void;
  onUndo: () => void;
  onEscape: () => void;
}

const isTyping = (target: EventTarget | null) => {
  const element = target as HTMLElement | null;
  return Boolean(
    element &&
      (["INPUT", "SELECT", "TEXTAREA"].includes(element.tagName) ||
        element.isContentEditable ||
        element.closest("[role='dialog'], [role='alertdialog']")),
  );
};

/**
 * High-volume queue controls using standard/navigation or modified keys only.
 * Avoiding unmodified character shortcuts keeps the feature compliant without
 * adding another visible settings control to the focused queue toolbar.
 */
export const useQueueShortcuts = (handlers: QueueShortcutHandlers) => {
  const latest = useRef(handlers);
  useEffect(() => {
    latest.current = handlers;
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTyping(event.target)) return;
      let action: keyof QueueShortcutHandlers | undefined;
      if (!event.altKey && !event.ctrlKey && !event.metaKey && event.key === "ArrowDown") {
        action = "onNext";
      } else if (!event.altKey && !event.ctrlKey && !event.metaKey && event.key === "ArrowUp") {
        action = "onPrevious";
      } else if (event.altKey && event.key === "ArrowRight") {
        action = "onAccept";
      } else if (event.altKey && event.key === "ArrowLeft") {
        action = "onReject";
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        action = "onUndo";
      } else if (event.key === "Escape") {
        action = "onEscape";
      }
      if (!action) return;
      event.preventDefault();
      latest.current[action]();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
};

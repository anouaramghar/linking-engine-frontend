import { useEffect } from "react";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/**
 * Hold keyboard focus inside a panel until it closes, then give it back.
 *
 * Shared by the dialog and the overlaid queue preview so there is one trap to
 * reason about rather than two that drift. The preview only traps below the
 * breakpoint where it overlays the list — beside the list it is ordinary page
 * content and Tab must pass straight through it — hence `active`.
 *
 * Returns the panel's `onKeyDown`; the effect owns focus and body scroll.
 */
export const useFocusTrap = (
  panel: React.RefObject<HTMLElement | null>,
  onClose: () => void,
  active = true,
) => {
  useEffect(() => {
    if (!active) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const items = [...(panel.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
    // Prefer the first real control over the close button, so a form dialog
    // opens with the cursor already in its first field.
    const target = items.find((item) => item.dataset.modalDismiss === undefined);
    (target ?? items[0] ?? panel.current)?.focus();

    // Today's shell is `h-[100dvh] overflow-hidden` with every scroller an
    // inner pane, so `body` does not scroll and this lock changes nothing. It
    // stays because it is the guard that keeps that true: the day a layout
    // change lets the page behind a dialog scroll, this is what stops it.
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = overflow;
      if (previouslyFocused && document.contains(previouslyFocused)) {
        previouslyFocused.focus();
      } else {
        document.getElementById("main")?.focus();
      }
    };
  }, [active, panel]);

  // Tab must not escape into the page behind the panel.
  return (event: React.KeyboardEvent) => {
    if (!active) return;
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;

    const items = [...(panel.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
    if (!items.length) return;
    const edge = event.shiftKey ? items[0] : items[items.length - 1];
    if (document.activeElement === edge) {
      event.preventDefault();
      (event.shiftKey ? items[items.length - 1] : items[0]).focus();
    }
  };
};

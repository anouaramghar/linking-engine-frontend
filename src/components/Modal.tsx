import { useEffect, useId, useRef } from "react";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

interface Props {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  /** Sizing and layout for the panel; the chrome is owned by this component. */
  panelClassName?: string;
}

export default function Modal({ title, onClose, children, panelClassName = "" }: Props) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const items = [...(panel.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? [])];
    // Prefer the first real control over the close button, so a form dialog
    // opens with the cursor already in its first field.
    const target = items.find((item) => item.dataset.modalDismiss === undefined);
    (target ?? items[0] ?? panel.current)?.focus();

    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = overflow;
      previouslyFocused?.focus?.();
    };
  }, []);

  // Tab must not escape into the page behind the dialog.
  const onKeyDown = (event: React.KeyboardEvent) => {
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/40 p-4"
      // mousedown, not click: releasing a text selection outside the panel must
      // not count as a click on the backdrop and discard the user's input.
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className={`flex max-h-[85vh] w-full flex-col rounded-2xl border border-stone-200 bg-stone-50 p-7 focus:outline-none ${panelClassName}`}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <h2 id={titleId} className="font-serif text-2xl">
            {title}
          </h2>
          <button
            type="button"
            aria-label="Close dialog"
            data-modal-dismiss=""
            onClick={onClose}
            className="-mr-1 -mt-1 rounded-full px-2 py-1 text-lg leading-none text-stone-600 hover:bg-chip hover:text-stone-950"
          >
            &times;
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

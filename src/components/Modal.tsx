import { useId, useRef } from "react";

import { useFocusTrap } from "../hooks/useFocusTrap";

interface Props {
  title: string;
  /**
   * What the dialog is for, in the header rather than in the body.
   *
   * The body scrolls; the header does not. A description left in the body
   * slides under the title the moment anything below it grows, which is exactly
   * how the CSV import ended up with its column list half-hidden behind the
   * heading.
   */
  description?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  /** Sizing and layout for the panel; the chrome is owned by this component. */
  panelClassName?: string;
  role?: "dialog" | "alertdialog";
  ariaLabel?: string;
  /** Protected workflows should close only through an explicit action. */
  dismissOnBackdrop?: boolean;
}

export default function Modal({
  title,
  description,
  onClose,
  children,
  panelClassName = "",
  role = "dialog",
  ariaLabel,
  dismissOnBackdrop = true,
}: Props) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();

  const onKeyDown = useFocusTrap(panel, onClose);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-canvas-deep/40 p-4"
      // mousedown, not click: releasing a text selection outside the panel must
      // not count as a click on the backdrop and discard the user's input.
      onMouseDown={(event) => {
        if (dismissOnBackdrop && event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panel}
        role={role}
        aria-modal="true"
        aria-label={ariaLabel}
        aria-labelledby={ariaLabel ? undefined : titleId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className={`flex max-h-[85vh] w-full flex-col rounded-xl border border-hairline bg-canvas-soft p-5 focus:outline-none sm:p-8 ${panelClassName}`}
      >
        <div className="mb-5 flex-none">
          <div className="flex items-start justify-between gap-4">
            <h2 id={titleId} className="font-serif text-display-sm text-ink">
              {title}
            </h2>
            <button
              type="button"
              aria-label="Close dialog"
              data-modal-dismiss=""
              onClick={onClose}
              className="-mr-2 -mt-2 inline-flex h-11 w-11 items-center justify-center rounded-pill text-title-md leading-none text-muted hover:bg-surface-strong hover:text-ink"
            >
              &times;
            </button>
          </div>
          {/* Held clear of the close control, which overhangs the header by its
              own touch target. */}
          {description && (
            <div className="mt-2 pr-10 text-caption leading-normal text-muted">{description}</div>
          )}
        </div>
        {/* The panel is capped at 85vh, so its body has to be the thing that
            scrolls. Without this the tallest form (a WordPress site, with
            credentials) measures ~634px and simply overflows the backdrop on
            any viewport under ~746px tall — a 1366x768 laptop included — taking
            its submit button off-screen with no way to reach it.

            The negative margin buys back room for a 2px focus ring at 2px
            offset, which an overflow container would otherwise shave. */}
        <div className="-mx-2 flex min-h-0 flex-1 flex-col overflow-y-auto px-2">
          {children}
        </div>
      </div>
    </div>
  );
}

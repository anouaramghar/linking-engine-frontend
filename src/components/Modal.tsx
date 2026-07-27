import { useId, useRef } from "react";

import { useFocusTrap } from "../hooks/useFocusTrap";

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

  const onKeyDown = useFocusTrap(panel, onClose);

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

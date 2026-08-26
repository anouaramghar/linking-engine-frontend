import { useEffect, useRef } from "react";
import type { ReactNode } from "react";

interface HelpHintProps {
  label: string;
  children: ReactNode;
}

export default function HelpHint({ label, children }: HelpHintProps) {
  const detailsRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const details = detailsRef.current;
      if (!details?.open || details.contains(event.target as Node)) return;
      details.open = false;
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      const details = detailsRef.current;
      if (event.key !== "Escape" || !details?.open) return;
      event.preventDefault();
      details.open = false;
      details.querySelector<HTMLElement>("summary")?.focus();
    };

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  return (
    <details ref={detailsRef} className="help-hint ml-1">
      <summary
        aria-label={label}
        className="disclosure-summary touch-target inline-flex h-5 w-5 items-center justify-center rounded-pill border border-hairline text-caption-sm normal-case text-muted hover:bg-surface-strong hover:text-ink"
      >
        ?
      </summary>
      <div className="help-hint-popover">
        {children}
      </div>
    </details>
  );
}

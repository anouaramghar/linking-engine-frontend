import { useEffect, useRef } from "react";
import type { ReactNode, SyntheticEvent } from "react";

const AUTO_CLOSE_MS = 5_000;

interface HelpHintProps {
  label: string;
  children: ReactNode;
}

export default function HelpHint({ label, children }: HelpHintProps) {
  const closeTimer = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (closeTimer.current !== null) {
        window.clearTimeout(closeTimer.current);
      }
    };
  }, []);

  const handleToggle = (event: SyntheticEvent<HTMLDetailsElement>) => {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }

    if (!event.currentTarget.open) return;

    const details = event.currentTarget;
    closeTimer.current = window.setTimeout(() => {
      details.open = false;
      closeTimer.current = null;
    }, AUTO_CLOSE_MS);
  };

  return (
    <details className="help-hint ml-1" onToggle={handleToggle}>
      <summary
        aria-label={label}
        className="disclosure-summary inline-flex h-5 w-5 items-center justify-center rounded-pill border border-hairline text-caption-sm normal-case text-muted hover:bg-surface-strong hover:text-ink"
      >
        ?
      </summary>
      <div className="help-hint-popover">
        {children}
      </div>
    </details>
  );
}

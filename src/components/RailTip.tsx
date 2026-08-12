import type { ReactNode } from "react";

/**
 * The label a collapsed rail control shows on hover or keyboard focus.
 *
 * It is `aria-hidden` on purpose. A collapsed control keeps its real name in an
 * `sr-only` span, so assistive tech already reads "Review queue" — echoing it
 * here would announce the same word twice. This bubble exists for the sighted
 * pointer user, who otherwise has nothing but a 18px mark to go on.
 *
 * `group-focus-within` rather than `group-hover` alone: tabbing through a
 * collapsed rail is exactly the case where the marks are least legible, and a
 * hover-only tip is invisible to the keyboard.
 *
 * `title` is deliberately not used for this. It cannot be styled, never appears
 * on focus, and on a touch-capable laptop it appears only after a long press.
 */
export default function RailTip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="group relative flex justify-center">
      {children}
      <span
        aria-hidden="true"
        role="presentation"
        className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2
          scale-95 whitespace-nowrap rounded-md border border-hairline bg-surface-card px-2.5
          py-1.5 text-caption text-ink opacity-0 shadow-lift transition duration-150
          group-hover:scale-100 group-hover:opacity-100 group-focus-within:scale-100
          group-focus-within:opacity-100 motion-reduce:transition-none"
      >
        {label}
      </span>
    </div>
  );
}

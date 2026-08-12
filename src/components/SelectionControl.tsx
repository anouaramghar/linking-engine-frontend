import type { Ref } from "react";

/**
 * The one selection checkbox in the product.
 *
 * The native input stays in the accessibility tree and keeps the keyboard and
 * the "mixed" state; the painted box is a sibling driven by `peer-*`, because a
 * styled `appearance: none` checkbox loses the indeterminate dash on Safari.
 * Shared by the Sites list and the publication review so that selecting rows
 * looks and behaves the same wherever a batch is assembled.
 */
export default function SelectionControl({
  label,
  checked,
  indeterminate = false,
  disabled = false,
  inputRef,
  onChange,
}: {
  label: string;
  checked: boolean;
  indeterminate?: boolean;
  disabled?: boolean;
  inputRef?: Ref<HTMLInputElement>;
  onChange: () => void;
}) {
  const active = checked || indeterminate;

  return (
    <>
      <input
        ref={inputRef}
        type="checkbox"
        className="peer sr-only"
        aria-label={label}
        aria-checked={indeterminate ? "mixed" : checked}
        checked={checked}
        disabled={disabled}
        onChange={onChange}
      />
      <span
        aria-hidden="true"
        className={`pointer-events-none flex h-5 w-5 flex-none items-center justify-center rounded-md border transition-colors peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ink peer-disabled:opacity-50 ${
          active
            ? "border-primary bg-primary text-on-primary"
            : "border-hairline-control bg-surface-card"
        }`}
      >
        {indeterminate ? (
          <span className="h-0.5 w-2.5 rounded-pill bg-on-primary" />
        ) : checked ? (
          <svg aria-hidden="true" className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none">
            <path
              d="m3 8 3 3 7-7"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : null}
      </span>
    </>
  );
}

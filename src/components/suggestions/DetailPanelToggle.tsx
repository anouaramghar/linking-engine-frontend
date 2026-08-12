/**
 * Put the queue's detail column away, or bring it back.
 *
 * The same control the rail carries at the other edge, drawn the same way: a
 * chevron against the edge it folds into, mirrored when it points back out. It
 * belongs to the panel rather than to the list, so wherever the panel is — open
 * on a suggestion, resting on its placeholder, or reduced to a strip — the
 * control is in the same place.
 */
export default function DetailPanelToggle({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  const label = collapsed ? "Expand suggestion detail" : "Collapse suggestion detail";

  return (
    <button
      type="button"
      onClick={onToggle}
      title={label}
      className="touch-target inline-flex h-11 w-11 flex-none items-center justify-center rounded-pill
        text-muted transition-colors hover:bg-surface-strong hover:text-ink"
    >
      <svg
        aria-hidden="true"
        width="18"
        height="18"
        viewBox="0 0 18 18"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`transition-transform duration-200 motion-reduce:transition-none ${
          collapsed ? "rotate-180" : ""
        }`}
      >
        <path d="M7 5.5 L10.5 9 L7 12.5" />
        <path d="M4 4.5 V13.5" />
      </svg>
      <span className="sr-only">{label}</span>
    </button>
  );
}

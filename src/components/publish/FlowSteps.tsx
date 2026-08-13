const STEPS = ["Select links", "Review exact edits & approve"];

/**
 * The two user-facing pages between a suggestion and a live link.
 *
 * Selecting a row does not publish anything, and that is the one thing the
 * queue has to say out loud before the protected review opens.
 */
export default function FlowSteps({ current }: { current: 1 | 2 }) {
  return (
    <ol
      aria-label="Review flow"
      className="flex flex-wrap items-center gap-2 text-caption"
    >
      {STEPS.map((label, index) => {
        const step = index + 1;
        const active = step === current;
        return (
          <li key={label} className="flex items-center gap-2">
            {index > 0 && (
              <span aria-hidden="true" className="text-muted">
                &rarr;
              </span>
            )}
            <span
              aria-current={active ? "step" : undefined}
              className={`rounded-pill px-3 py-1.5 ${
                active
                  ? "bg-primary font-medium text-on-primary"
                  : step < current
                    ? "bg-surface-strong text-ink"
                    : "bg-surface-strong text-muted"
              }`}
            >
              {step}. {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

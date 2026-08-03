const PANEL =
  "rounded-xl border border-dashed border-hairline-strong bg-canvas-soft px-5 py-14 text-center";

/** A failed load, told apart from an empty result and offering a way forward. */
export function ErrorPanel({
  title,
  description,
  onRetry,
  retrying,
}: {
  title: string;
  description: string;
  onRetry: () => void;
  retrying?: boolean;
}) {
  return (
    // The one place a whole surface goes chromatic, at the alpha the system's
    // hairline weight implies rather than a saturated fill.
    <div role="alert" className={`${PANEL} border-error/30 bg-error/5`}>
      <div className="text-body-sm font-medium text-error-ink">{title}</div>
      <div className="mx-auto mt-2 max-w-md text-caption text-body">{description}</div>
      <button
        type="button"
        onClick={onRetry}
        disabled={retrying}
        className="btn btn-outline mt-5 border-error/40 bg-surface-card text-error-ink hover:border-error"
      >
        {retrying ? "Retrying…" : "Try again"}
      </button>
    </div>
  );
}

export function EmptyPanel({ children }: { children: React.ReactNode }) {
  return <div className={`${PANEL} text-body-sm text-muted`}>{children}</div>;
}

/** Placeholder rows shaped like the list they stand in for. */
export function SkeletonRows({ count = 4, label }: { count?: number; label: string }) {
  return (
    <div aria-busy="true" aria-label={label} className="flex flex-col gap-2.5">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="card flex animate-pulse items-center gap-4 px-5 py-4">
          <div className="h-8 w-8 flex-none rounded-full bg-hairline" />
          <div className="min-w-0 flex-1">
            <div className="h-3.5 w-1/2 rounded-xs bg-hairline" />
            <div className="mt-2 h-3 w-1/3 rounded-xs bg-hairline-soft" />
          </div>
          <div className="h-8 w-24 flex-none rounded-pill bg-hairline-soft" />
        </div>
      ))}
    </div>
  );
}

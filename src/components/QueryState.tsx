import LogoLoadingAnimation from "./LogoLoadingAnimation";

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
/**
 * An empty result is the barest thing this dashboard draws: a dashed rectangle
 * with one grey sentence in it. The bloom gives it a floor to sit on.
 *
 * Only the empty panel takes it. `ErrorPanel` shares the same box but already
 * goes chromatic in the semantic error hue, and a mint bloom under a failure
 * would be the app disagreeing with itself about how bad the news is.
 *
 * 18% at the centre stop: the panel's copy is {colors.muted}, which measures
 * 5.10:1 on the untinted soft canvas and 4.82:1 through the densest part of
 * this wash, so the reading floor survives the decoration.
 */
export function EmptyPanel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={`${PANEL} bg-[radial-gradient(ellipse_at_50%_35%,theme(colors.orb-mint/18%),transparent_62%),radial-gradient(ellipse_at_78%_88%,theme(colors.orb-sky/14%),transparent_58%)] text-body-sm text-muted`}
    >
      {children}
    </div>
  );
}

/**
 * Placeholder rows shaped like the list they stand in for, featuring the brand
 * loading logo.
 *
 * This is the only loading panel, because it is the better of the two this file
 * used to offer: a generic centred spinner panel says "wait", while rows the
 * width of the rows that follow also say what is coming and stop the page
 * jumping when it arrives. Nothing ever imported the generic one.
 */
export function SkeletonRows({ count = 4, label }: { count?: number; label: string }) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={label}
      className="flex flex-col gap-2.5"
    >
      <span className="sr-only">{label}</span>
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="card flex animate-pulse items-center gap-4 px-5 py-4">
          {index === 0 ? (
            <LogoLoadingAnimation size={32} className="text-primary/70 flex-none" aria-hidden="true" />
          ) : (
            <div className="h-8 w-8 flex-none rounded-full bg-hairline" />
          )}
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

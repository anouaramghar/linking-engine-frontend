const PANEL =
  "rounded-2xl border border-dashed border-stone-300 bg-stone-50 px-5 py-14 text-center";

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
    <div role="alert" className={`${PANEL} border-red-200 bg-red-50`}>
      <div className="text-[15px] font-medium text-red-800">{title}</div>
      <div className="mx-auto mt-1 max-w-md text-sm text-red-700">{description}</div>
      <button
        type="button"
        onClick={onRetry}
        disabled={retrying}
        className="mt-4 rounded-full border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-800 hover:border-red-800 disabled:opacity-50"
      >
        {retrying ? "Retrying…" : "Try again"}
      </button>
    </div>
  );
}

export function EmptyPanel({ children }: { children: React.ReactNode }) {
  return <div className={`${PANEL} text-[15px] text-stone-600`}>{children}</div>;
}

/** Placeholder rows shaped like the list they stand in for. */
export function SkeletonRows({ count = 4, label }: { count?: number; label: string }) {
  return (
    <div aria-busy="true" aria-label={label} className="flex flex-col gap-2.5">
      {Array.from({ length: count }, (_, index) => (
        <div
          key={index}
          className="flex animate-pulse items-center gap-4 rounded-2xl border border-stone-200 bg-white px-5 py-4"
        >
          <div className="h-8 w-8 flex-none rounded-full bg-stone-200" />
          <div className="min-w-0 flex-1">
            <div className="h-3.5 w-1/2 rounded bg-stone-200" />
            <div className="mt-2 h-3 w-1/3 rounded bg-stone-100" />
          </div>
          <div className="h-8 w-24 flex-none rounded-full bg-stone-100" />
        </div>
      ))}
    </div>
  );
}

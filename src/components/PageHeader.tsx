import ThemeToggle from "./ThemeToggle";

/** `badge` is opt-in: it describes status or mode on specific pages. */
export default function PageHeader({
  title,
  sub,
  badge,
}: {
  title: string;
  sub: string;
  badge?: string;
}) {
  return (
    <div className="relative flex flex-none flex-wrap items-center justify-between gap-3 border-b border-hairline px-4 py-4 sm:px-6 lg:px-8 lg:py-5">
      <div className="min-w-0">
        <h1 className="font-serif text-display-sm text-ink sm:text-display-md">{title}</h1>
        <div className="mt-1 text-caption leading-relaxed text-muted">{sub}</div>
      </div>
      <div className="flex items-center gap-3">
        {badge && <div className="badge">{badge}</div>}
        <ThemeToggle />
      </div>
    </div>
  );
}

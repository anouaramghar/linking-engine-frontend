/**
 * `badge` is opt-in: it describes status or mode on specific pages.
 *
 * The theme control used to sit here too, and was inert: it was rendered
 * without props against a `ThemeContext` no provider ever mounted, so it always
 * showed "Match system" and its `onChange` went nowhere — while the rail's real
 * control, a few hundred pixels away, showed the true preference. Two controls
 * for one global setting is already a question the operator should not have to
 * answer; two that disagree is a bug. The live one lives in the shell, which is
 * also the only place that owns the hook.
 */
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
      {badge && <div className="badge">{badge}</div>}
    </div>
  );
}

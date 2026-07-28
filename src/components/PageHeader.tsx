/** `badge` is opt-in: it describes the scoring method, which only the queue uses. */
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
    <div className="relative flex flex-none flex-wrap items-center justify-between gap-4 border-b border-hairline px-8 py-5">
      <div>
        <h1 className="font-serif text-display-md text-ink">{title}</h1>
        <div className="mt-1 text-caption text-muted">{sub}</div>
      </div>
      {badge && <div className="badge">{badge}</div>}
    </div>
  );
}

/**
 * Crawl state as a {component.badge-pill}. The dot carries the colour so the
 * label can stay ink and clear contrast at 12px — the system has no tinted
 * text on tinted fill.
 */
const DOTS: Record<string, string> = {
  succeeded: "bg-success",
  running: "bg-primary animate-pulse",
  failed: "bg-error",
};

const LABELS: Record<string, string> = {
  succeeded: "Indexed",
  running: "Crawling…",
  failed: "Crawl failed",
};

export default function SiteStatusBadge({ status }: { status: string | null }) {
  return (
    <span className="badge">
      <span className={`dot ${(status && DOTS[status]) ?? "bg-muted-soft"}`} />
      {status ? LABELS[status] ?? status : "Never crawled"}
    </span>
  );
}

const COLORS: Record<string, string> = {
  succeeded: "text-green-800",
  running: "text-stone-600",
  failed: "text-red-800",
};

const LABELS: Record<string, string> = {
  succeeded: "Indexed",
  running: "Crawling…",
  failed: "Crawl failed",
};

export default function SiteStatusBadge({ status }: { status: string | null }) {
  return (
    <span
      className={`rounded-full bg-chip px-3 py-1 text-xs font-medium ${
        status ? COLORS[status] ?? "text-stone-600" : "text-stone-600"
      }`}
    >
      {status ? LABELS[status] ?? status : "Never crawled"}
    </span>
  );
}

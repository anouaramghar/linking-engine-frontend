const COLORS: Record<string, string> = {
  succeeded: "text-green-600",
  running: "text-stone-500",
  failed: "text-red-600",
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
        status ? COLORS[status] ?? "text-stone-500" : "text-stone-500"
      }`}
    >
      {status ? LABELS[status] ?? status : "Never crawled"}
    </span>
  );
}

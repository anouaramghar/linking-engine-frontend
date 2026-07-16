import { useMemo, useState } from "react";

import PageHeader from "../components/PageHeader";
import BulkActions from "../components/suggestions/BulkActions";
import SuggestionCard from "../components/suggestions/SuggestionCard";
import SuggestionPreview from "../components/suggestions/SuggestionPreview";
import { useReview, useSuggestions } from "../hooks/useSuggestions";
import { useSites, useStats } from "../hooks/useSites";

const CHIP_DEFS = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "applied", label: "Applied" },
  { key: "rejected", label: "Rejected" },
];

export default function ValidationPage() {
  const [statusFilter, setStatusFilter] = useState("pending");
  const [siteFilter, setSiteFilter] = useState(0); // 0 = all sites
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const { data: sites } = useSites();
  const { data: stats } = useStats();
  const review = useReview();

  const filters = useMemo(
    () => ({
      site_id: siteFilter || undefined,
      status: statusFilter === "all" ? undefined : statusFilter,
      limit: 100,
    }),
    [siteFilter, statusFilter],
  );
  const { data: suggestions, isLoading } = useSuggestions(filters);

  const siteName = (id: number) => sites?.find((s) => s.id === id)?.name ?? `site ${id}`;

  const scoped = stats?.filter((s) => !siteFilter || s.site_id === siteFilter) ?? [];
  const countBy = (status: string) =>
    scoped.reduce((n, s) => n + (s.suggestions_by_status[status] ?? 0), 0);
  const chips = [
    ...CHIP_DEFS.map((c) => ({ ...c, count: countBy(c.key) })),
    { key: "all", label: "All", count: CHIP_DEFS.reduce((n, c) => n + countBy(c.key), 0) },
  ];
  const pendingTotal =
    stats?.reduce((n, s) => n + (s.suggestions_by_status.pending ?? 0), 0) ?? 0;

  const decide = (id: number, status: "approved" | "rejected" | "pending") => {
    review.mutate({ id, status });
    if (selectedId === id && status !== "pending") {
      const next = suggestions?.find((s) => s.id !== id && s.status === "pending");
      setSelectedId(next?.id ?? null);
    }
  };

  const selected = suggestions?.find((s) => s.id === selectedId) ?? null;

  return (
    <>
      <PageHeader
        title="Link suggestions"
        sub={`${pendingTotal} pending across ${sites?.length ?? 0} sites — accepted links are queued for write-back`}
      />
      <div className="relative flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 overflow-y-auto px-8 py-6">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <BulkActions chips={chips} active={statusFilter} onSelect={setStatusFilter} />
            <div className="flex-1" />
            <select
              value={siteFilter}
              onChange={(e) => setSiteFilter(Number(e.target.value))}
              className="cursor-pointer rounded-full border border-stone-300 bg-white px-3.5 py-2 text-sm"
            >
              <option value={0}>All sites</option>
              {sites?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-2.5 pb-6">
            {suggestions?.map((s) => (
              <SuggestionCard
                key={s.id}
                suggestion={s}
                siteName={siteName(s.site_id)}
                selected={s.id === selectedId}
                onOpen={() => setSelectedId(s.id)}
                onAccept={() => decide(s.id, "approved")}
                onReject={() => decide(s.id, "rejected")}
                onUndo={() => decide(s.id, "pending")}
              />
            ))}
            {!isLoading && suggestions?.length === 0 && (
              <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 px-5 py-14 text-center text-[15px] text-stone-500">
                No suggestions match these filters. Run an analysis from the Sites page, or try
                another status or site.
              </div>
            )}
          </div>
        </div>

        {selected && (
          <SuggestionPreview
            suggestion={selected}
            siteName={siteName(selected.site_id)}
            onClose={() => setSelectedId(null)}
            onAccept={() => decide(selected.id, "approved")}
            onReject={() => decide(selected.id, "rejected")}
          />
        )}
      </div>
    </>
  );
}

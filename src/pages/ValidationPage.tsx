import { useEffect, useMemo, useState } from "react";

import PageHeader from "../components/PageHeader";
import BulkActions from "../components/suggestions/BulkActions";
import type { BulkConfirmation } from "../components/suggestions/BulkActions";
import SuggestionCard from "../components/suggestions/SuggestionCard";
import SuggestionPreview from "../components/suggestions/SuggestionPreview";
import { useBulkReview, useReview, useSuggestions } from "../hooks/useSuggestions";
import { useSites } from "../hooks/useSites";
import {
  clampThreshold,
  filterSuggestions,
  getBulkTargets,
  resolveSuggestionStatuses,
} from "../lib/suggestionReview";
import type {
  BulkReviewAction,
  StatusFilter,
  StatusOverrides,
} from "../lib/suggestionReview";
import type { ReviewStatus, SuggestionStatus } from "../types/suggestion";

const CHIP_DEFS: { key: SuggestionStatus; label: string }[] = [
  { key: "pending", label: "Pending review" },
  { key: "approved", label: "Queued for publish" },
  { key: "applying", label: "Publishing" },
  { key: "applied", label: "Published live" },
  { key: "rejected", label: "Rejected" },
];

interface ConfirmationState extends BulkConfirmation {
  ids: number[];
}

export default function ValidationPage() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending");
  const [siteFilter, setSiteFilter] = useState(0);
  const [threshold, setThreshold] = useState(80);
  const [statusOverrides, setStatusOverrides] = useState<StatusOverrides>({});
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [confirmation, setConfirmation] = useState<ConfirmationState | null>(null);
  const [notice, setNotice] = useState("");

  const { data: sites } = useSites();
  const siteIds = useMemo(() => sites?.map((site) => site.id) ?? [], [sites]);
  const { data: sourceSuggestions = [], isLoading } = useSuggestions(siteIds);
  const review = useReview();
  const bulkReview = useBulkReview();

  const resolvedSuggestions = useMemo(
    () => resolveSuggestionStatuses(sourceSuggestions, statusOverrides),
    [sourceSuggestions, statusOverrides],
  );

  // Overrides bridge the short refetch after a successful review. Once the backend
  // reports any non-pending state, trust it so publish progress can advance normally.
  useEffect(() => {
    setStatusOverrides((current) => {
      const next = { ...current };
      let changed = false;
      sourceSuggestions.forEach((suggestion) => {
        if (next[suggestion.id] && suggestion.status !== "pending") {
          delete next[suggestion.id];
          changed = true;
        }
      });
      return changed ? next : current;
    });
  }, [sourceSuggestions]);
  const suggestions = useMemo(
    () =>
      filterSuggestions(resolvedSuggestions, {
        siteId: siteFilter,
        status: statusFilter,
      }),
    [resolvedSuggestions, siteFilter, statusFilter],
  );

  const siteName = (id: number) =>
    sites?.find((site) => site.id === id)?.name ?? `site ${id}`;
  const countBy = (status: SuggestionStatus, siteId = siteFilter) =>
    resolvedSuggestions.filter(
      (suggestion) =>
        (siteId === 0 || suggestion.site_id === siteId) && suggestion.status === status,
    ).length;
  const scopedTotal = resolvedSuggestions.filter(
    (suggestion) => siteFilter === 0 || suggestion.site_id === siteFilter,
  ).length;
  const chips = [
    ...CHIP_DEFS.map((chip) => ({ ...chip, count: countBy(chip.key) })),
    { key: "all", label: "All", count: scopedTotal },
  ];
  const pendingTotal = countBy("pending", 0);

  const acceptTargets = getBulkTargets(resolvedSuggestions, {
    action: "approve",
    siteId: siteFilter,
    threshold,
  });
  const rejectTargets = getBulkTargets(resolvedSuggestions, {
    action: "reject",
    siteId: siteFilter,
    threshold,
  });

  const setLocalStatuses = (ids: number[], status: ReviewStatus, message: string) => {
    setStatusOverrides((current) => {
      const next = { ...current };
      ids.forEach((id) => {
        next[id] = status;
      });
      return next;
    });
    setNotice(message);
  };

  const decide = (id: number, status: ReviewStatus) => {
    const message =
      status === "approved"
        ? "1 suggestion queued for publish."
        : "1 suggestion rejected.";
    setNotice("");
    review.mutate(
      { id, status },
      {
        onSuccess: () => setLocalStatuses([id], status, message),
        onError: () => setNotice("The review decision could not be saved. Please try again."),
      },
    );
  };

  const requestBulk = (action: BulkReviewAction) => {
    const targets = action === "approve" ? acceptTargets : rejectTargets;
    setConfirmation({
      action,
      ids: targets.map((suggestion) => suggestion.id),
      count: targets.length,
      threshold,
      siteLabel: siteFilter === 0 ? "All sites" : siteName(siteFilter),
    });
  };

  const confirmBulk = () => {
    if (!confirmation) return;
    const status: ReviewStatus =
      confirmation.action === "approve" ? "approved" : "rejected";
    const noun = confirmation.count === 1 ? "suggestion" : "suggestions";
    const message =
      confirmation.action === "approve"
        ? `${confirmation.count} ${noun} queued for publish.`
        : `${confirmation.count} ${noun} rejected.`;
    const ids = confirmation.ids;
    setNotice("");
    setConfirmation(null);
    bulkReview.mutate(
      { ids, status },
      {
        onSuccess: () => setLocalStatuses(ids, status, message),
        onError: () => setNotice("The bulk review could not be saved. Please try again."),
      },
    );
  };

  const selected =
    resolvedSuggestions.find((suggestion) => suggestion.id === selectedId) ?? null;

  return (
    <>
      <PageHeader
        title="Link suggestions"
        sub={`${pendingTotal} pending across ${sites?.length ?? 0} sites - queued links are not live until published`}
      />
      <div className="relative flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 overflow-y-auto px-8 py-6">
          <div className="mb-4 flex items-start gap-3">
            <BulkActions
              chips={chips}
              active={statusFilter}
              onSelect={(status) => {
                setStatusFilter(status as StatusFilter);
                setConfirmation(null);
              }}
              threshold={threshold}
              onThresholdChange={(value) => {
                setThreshold(clampThreshold(value));
                setConfirmation(null);
              }}
              acceptCount={acceptTargets.length}
              rejectCount={rejectTargets.length}
              confirmation={confirmation}
              onRequest={requestBulk}
              onConfirm={confirmBulk}
              onCancel={() => setConfirmation(null)}
            />
            <select
              aria-label="Site filter"
              value={siteFilter}
              onChange={(event) => {
                setSiteFilter(Number(event.target.value));
                setConfirmation(null);
              }}
              className="cursor-pointer rounded-full border border-stone-300 bg-white px-3.5 py-2 text-sm"
            >
              <option value={0}>All sites</option>
              {sites?.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name}
                </option>
              ))}
            </select>
          </div>

          {notice && (
            <div
              role="status"
              className="mb-3 rounded-xl bg-stone-800 px-4 py-2 text-sm text-white"
            >
              {notice}
            </div>
          )}

          <div className="flex flex-col gap-2.5 pb-6">
            {suggestions.map((suggestion) => (
              <SuggestionCard
                key={suggestion.id}
                suggestion={suggestion}
                siteName={siteName(suggestion.site_id)}
                selected={suggestion.id === selectedId}
                onOpen={() => setSelectedId(suggestion.id)}
                onAccept={() => decide(suggestion.id, "approved")}
                onReject={() => decide(suggestion.id, "rejected")}
              />
            ))}
            {!isLoading && suggestions.length === 0 && (
              <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 px-5 py-14 text-center text-[15px] text-stone-500">
                No suggestions match these filters. Run baseline suggestions from the Sites page,
                or try another status or site.
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

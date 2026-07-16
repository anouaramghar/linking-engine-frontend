import { useMemo, useState } from "react";

import PageHeader from "../components/PageHeader";
import BulkActions from "../components/suggestions/BulkActions";
import type { BulkConfirmation } from "../components/suggestions/BulkActions";
import SuggestionCard from "../components/suggestions/SuggestionCard";
import SuggestionPreview from "../components/suggestions/SuggestionPreview";
import { useSuggestions } from "../hooks/useSuggestions";
import { useSites, useStats } from "../hooks/useSites";
import {
  adjustedStatusCount,
  clampThreshold,
  filterSuggestions,
  getBulkTargets,
  resolveSuggestionStatuses,
} from "../lib/suggestionReview";
import type {
  BulkReviewAction,
  StatusFilter,
  StatusOverrides,
  SuggestionMethodFilter,
} from "../lib/suggestionReview";
import type { SuggestionStatus } from "../types/suggestion";

const CHIP_DEFS: { key: SuggestionStatus; label: string }[] = [
  { key: "pending", label: "Pending review" },
  { key: "approved", label: "Queued for publish" },
  { key: "applied", label: "Published live" },
  { key: "rejected", label: "Rejected" },
];

const METHOD_LABELS: Record<SuggestionMethodFilter, string> = {
  all: "All methods",
  baseline_cosine: "Baseline",
  gnn_graphsage: "GNN",
};

interface ConfirmationState extends BulkConfirmation {
  ids: number[];
}

export default function ValidationPage() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending");
  const [siteFilter, setSiteFilter] = useState(0);
  const [methodFilter, setMethodFilter] = useState<SuggestionMethodFilter>("all");
  const [threshold, setThreshold] = useState(80);
  const [statusOverrides, setStatusOverrides] = useState<StatusOverrides>({});
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [confirmation, setConfirmation] = useState<ConfirmationState | null>(null);
  const [notice, setNotice] = useState("");

  const { data: sites } = useSites();
  const { data: stats } = useStats();
  const { data: sourceSuggestions = [], isLoading } = useSuggestions({ limit: 100 });

  const resolvedSuggestions = useMemo(
    () => resolveSuggestionStatuses(sourceSuggestions, statusOverrides),
    [sourceSuggestions, statusOverrides],
  );
  const suggestions = useMemo(
    () =>
      filterSuggestions(resolvedSuggestions, {
        siteId: siteFilter,
        status: statusFilter,
        method: methodFilter,
      }),
    [methodFilter, resolvedSuggestions, siteFilter, statusFilter],
  );

  const siteName = (id: number) =>
    sites?.find((site) => site.id === id)?.name ?? `site ${id}`;
  const baseCountBy = (status: SuggestionStatus, siteId: number) =>
    stats
      ?.filter((site) => siteId === 0 || site.site_id === siteId)
      .reduce((count, site) => count + (site.suggestions_by_status[status] ?? 0), 0) ?? 0;
  const countBy = (status: SuggestionStatus, siteId = siteFilter) =>
    adjustedStatusCount(
      baseCountBy(status, siteId),
      sourceSuggestions,
      statusOverrides,
      status,
      siteId,
    );
  const chips = [
    ...CHIP_DEFS.map((chip) => ({ ...chip, count: countBy(chip.key) })),
    {
      key: "all",
      label: "All",
      count: CHIP_DEFS.reduce((count, chip) => count + countBy(chip.key), 0),
    },
  ];
  const pendingTotal = countBy("pending", 0);

  const acceptTargets = getBulkTargets(resolvedSuggestions, {
    action: "approve",
    siteId: siteFilter,
    method: methodFilter,
    threshold,
  });
  const rejectTargets = getBulkTargets(resolvedSuggestions, {
    action: "reject",
    siteId: siteFilter,
    method: methodFilter,
    threshold,
  });

  const setLocalStatuses = (ids: number[], status: SuggestionStatus, message: string) => {
    setStatusOverrides((current) => {
      const next = { ...current };
      ids.forEach((id) => {
        next[id] = status;
      });
      return next;
    });
    setNotice(message);
  };

  const decide = (id: number, status: "approved" | "rejected" | "pending") => {
    const messages: Record<typeof status, string> = {
      approved: "1 suggestion queued for publish.",
      rejected: "1 suggestion rejected.",
      pending: "1 suggestion returned to pending review.",
    };
    setLocalStatuses([id], status, messages[status]);
  };

  const requestBulk = (action: BulkReviewAction) => {
    const targets = action === "approve" ? acceptTargets : rejectTargets;
    setConfirmation({
      action,
      ids: targets.map((suggestion) => suggestion.id),
      count: targets.length,
      threshold,
      methodLabel: METHOD_LABELS[methodFilter],
      siteLabel: siteFilter === 0 ? "All sites" : siteName(siteFilter),
    });
  };

  const confirmBulk = () => {
    if (!confirmation) return;
    const status = confirmation.action === "approve" ? "approved" : "rejected";
    const noun = confirmation.count === 1 ? "suggestion" : "suggestions";
    const message =
      confirmation.action === "approve"
        ? `${confirmation.count} ${noun} queued for publish.`
        : `${confirmation.count} ${noun} rejected.`;
    setLocalStatuses(confirmation.ids, status, message);
    setConfirmation(null);
  };

  const selected =
    resolvedSuggestions.find((suggestion) => suggestion.id === selectedId) ?? null;

  return (
    <>
      <PageHeader
        title="Link suggestions"
        sub={`${pendingTotal} pending across ${sites?.length ?? 0} sites · queued links are not live until published`}
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
              method={methodFilter}
              onMethodChange={(method) => {
                setMethodFilter(method);
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
                onUndo={() => decide(suggestion.id, "pending")}
              />
            ))}
            {!isLoading && suggestions.length === 0 && (
              <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 px-5 py-14 text-center text-[15px] text-stone-500">
                No suggestions match these filters. Run an analysis from the Sites page, or try
                another status, method, or site.
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

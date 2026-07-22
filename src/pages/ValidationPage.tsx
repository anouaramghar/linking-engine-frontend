import { useEffect, useMemo, useRef, useState } from "react";

import Notice from "../components/Notice";
import type { NoticeState } from "../components/Notice";
import PageHeader from "../components/PageHeader";
import { EmptyPanel, ErrorPanel, SkeletonRows } from "../components/QueryState";
import BulkActions from "../components/suggestions/BulkActions";
import type { BulkConfirmation } from "../components/suggestions/BulkActions";
import SuggestionCard from "../components/suggestions/SuggestionCard";
import SuggestionPreview from "../components/suggestions/SuggestionPreview";
import PublishBanner from "../components/suggestions/PublishBanner";
import { useIncrementalList } from "../hooks/useIncrementalList";
import { usePublishSites } from "../hooks/usePublish";
import { SHORTCUT_HINT, useQueueShortcuts } from "../hooks/useQueueShortcuts";
import { useBulkReview, useReview, useSuggestions } from "../hooks/useSuggestions";
import { useSites } from "../hooks/useSites";
import { isConflict } from "../lib/errors";
import { isReversible } from "../lib/utils";
import {
  clampThreshold,
  filterSuggestions,
  getBulkTargets,
  pruneStatusOverrides,
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

const plural = (count: number) => (count === 1 ? "suggestion" : "suggestions");

export default function ValidationPage() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending");
  const [siteFilter, setSiteFilter] = useState(0);
  const [threshold, setThreshold] = useState(80);
  const [statusOverrides, setStatusOverrides] = useState<StatusOverrides>({});
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [confirmation, setConfirmation] = useState<ConfirmationState | null>(null);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const cursorRef = useRef<HTMLLIElement>(null);

  const sitesQuery = useSites();
  const sites = sitesQuery.data;
  const siteIds = useMemo(() => sites?.map((site) => site.id) ?? [], [sites]);
  const suggestionsQuery = useSuggestions(siteIds);
  const { data: sourceSuggestions = [] } = suggestionsQuery;
  const review = useReview();
  const bulkReview = useBulkReview();
  const publish = usePublishSites();

  const hasSites = siteIds.length > 0;
  // The suggestions query stays disabled until sites arrive, so it reports
  // "pending" before it has any work to do — gate it on the sites we have.
  const loading = sitesQuery.isPending || (hasSites && suggestionsQuery.isPending);
  const failed = sitesQuery.isError || suggestionsQuery.isError;
  const retry = () => {
    void sitesQuery.refetch();
    if (hasSites) void suggestionsQuery.refetch();
  };

  // Overrides bridge the short refetch after a review. Resolution ignores any
  // the server has caught up with, so no cleanup pass is needed to stay
  // correct; pruning only keeps the map from growing across a long session.
  const resolvedSuggestions = useMemo(
    () => resolveSuggestionStatuses(sourceSuggestions, statusOverrides),
    [sourceSuggestions, statusOverrides],
  );

  const suggestions = useMemo(
    () =>
      filterSuggestions(resolvedSuggestions, {
        siteId: siteFilter,
        status: statusFilter,
      }),
    [resolvedSuggestions, siteFilter, statusFilter],
  );

  const {
    visible: visibleSuggestions,
    shown,
    total,
    hasMore,
    showMore,
    sentinel,
    autoLoadPaused,
  } = useIncrementalList(suggestions, `${statusFilter}:${siteFilter}`);

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

  const bulkScope = { siteId: siteFilter, status: statusFilter, threshold };
  const acceptTargets = getBulkTargets(resolvedSuggestions, {
    ...bulkScope,
    action: "approve",
  });
  const rejectTargets = getBulkTargets(resolvedSuggestions, {
    ...bulkScope,
    action: "reject",
  });

  const applyStatuses = (ids: number[], status: ReviewStatus, notice: NoticeState) => {
    setStatusOverrides((current) => {
      // Housekeeping on write rather than in an effect: drop the overrides the
      // server has already caught up with as we add the new ones.
      const next = { ...pruneStatusOverrides(sourceSuggestions, current) };
      ids.forEach((id) => {
        next[id] = status;
      });
      return next;
    });
    setNotice(notice);
  };

  /**
   * Report a batch the engine only partly applied. A row the publication worker
   * has claimed can no longer be reviewed, and the rest of the batch still went
   * through — so override only what actually moved and name what did not,
   * rather than claiming a clean result or offering a retry that cannot work.
   */
  const applyBatch = (
    ids: number[],
    status: ReviewStatus,
    skipped: number[],
    describe: (count: number) => string,
  ) => {
    const blocked = new Set(skipped);
    const applied = ids.filter((id) => !blocked.has(id));
    const aside = skipped.length
      ? `${skipped.length} ${skipped.length === 1 ? "was" : "were"} already publishing and could not be changed.`
      : "";

    if (!applied.length) {
      setNotice({
        message: `Nothing changed. ${aside || "Those suggestions are no longer reviewable."}`,
        tone: "error",
      });
      return;
    }
    applyStatuses(applied, status, {
      message: [describe(applied.length), aside].filter(Boolean).join(" "),
      // A partial result needs attention, so it stays until dismissed.
      tone: skipped.length ? "error" : "info",
      // Undoing an undo is just a re-review; only decisions offer it.
      undoIds: status === "pending" ? undefined : applied,
    });
  };

  /**
   * The row that will hold the cursor once `id` leaves the filtered list. A
   * reviewed suggestion drops out of every filter but "all", so handing the
   * cursor forward here is what lets `a a a` walk the queue — without it the
   * selection stops resolving and `j` restarts from the top.
   */
  const successorOf = (id: number) => {
    const index = suggestions.findIndex((item) => item.id === id);
    if (index === -1) return null;
    return (suggestions[index + 1] ?? suggestions[index - 1])?.id ?? null;
  };

  const decide = (id: number, status: ReviewStatus) => {
    const message =
      status === "approved" ? "1 suggestion queued for publish." : "1 suggestion rejected.";
    // Only when the cursor row is the one being decided — clicking Accept on
    // some other card should not move the editor's place in the queue.
    const successor = id === selectedId ? successorOf(id) : undefined;
    setNotice(null);
    review.mutate(
      { id, status },
      {
        onSuccess: () => {
          applyStatuses([id], status, { message, tone: "info", undoIds: [id] });
          if (successor !== undefined) setSelectedId(successor);
        },
        onError: (error) =>
          setNotice({
            message: isConflict(error)
              ? "That suggestion is already publishing, so it can no longer be reviewed."
              : "The review decision could not be saved. Please try again.",
            tone: "error",
          }),
      },
    );
  };

  const undo = (ids: number[]) => {
    setNotice(null);
    bulkReview.mutate(
      { ids, status: "pending" },
      {
        onSuccess: ({ skipped }) =>
          applyBatch(
            ids,
            "pending",
            skipped,
            (count) => `${count} ${plural(count)} restored to pending review.`,
          ),
        onError: () =>
          setNotice({
            message: "That undo could not be saved. Please try again.",
            tone: "error",
          }),
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
    const approving = confirmation.action === "approve";
    const status: ReviewStatus = approving ? "approved" : "rejected";
    const ids = confirmation.ids;
    setNotice(null);
    setConfirmation(null);
    bulkReview.mutate(
      { ids, status },
      {
        onSuccess: ({ skipped }) =>
          applyBatch(ids, status, skipped, (count) =>
            approving
              ? `${count} ${plural(count)} queued for publish.`
              : `${count} ${plural(count)} rejected.`,
          ),
        onError: () =>
          setNotice({
            message: "The bulk review could not be saved. Please try again.",
            tone: "error",
          }),
      },
    );
  };

  // Sites carrying an approved backlog, scoped to whatever the editor is viewing.
  const awaitingPublish = [
    ...new Set(
      resolvedSuggestions
        .filter(
          (suggestion) =>
            suggestion.status === "approved" &&
            (siteFilter === 0 || suggestion.site_id === siteFilter),
        )
        .map((suggestion) => suggestion.site_id),
    ),
  ];
  const approvedCount = countBy("approved");

  const startPublish = () => {
    setNotice(null);
    publish.mutate(awaitingPublish, {
      onSuccess: ({ queued, alreadyRunning, failed }) =>
        setNotice({
          message: [
            queued > 0 && `Publish queued for ${queued} ${queued === 1 ? "site" : "sites"}.`,
            alreadyRunning > 0 && `${alreadyRunning} already publishing.`,
            failed > 0 && `${failed} could not be queued.`,
          ]
            .filter(Boolean)
            .join(" "),
          tone: failed > 0 ? "error" : "info",
        }),
      onError: () =>
        setNotice({ message: "Publishing could not be started.", tone: "error" }),
    });
  };

  const selected =
    resolvedSuggestions.find((suggestion) => suggestion.id === selectedId) ?? null;

  // The position the cursor last held. Tracked in an effect rather than during
  // render so a discarded concurrent render cannot record a place the editor
  // never saw.
  const lastIndex = useRef(0);
  useEffect(() => {
    const index = suggestions.findIndex((item) => item.id === selectedId);
    if (index !== -1) lastIndex.current = index;
  }, [suggestions, selectedId]);

  // Move the cursor within the visible list, seeding it at the top on first use.
  const step = (delta: number) => {
    if (!suggestions.length) return;
    const current = suggestions.findIndex((item) => item.id === selectedId);
    // A bulk review can pull the cursor row out from under the selection. The
    // row that slid into its index is the one to resume on — snapping back to
    // the top of the queue would lose the editor's place entirely.
    const target = current === -1 ? lastIndex.current : current + delta;
    const next = Math.min(suggestions.length - 1, Math.max(0, target));
    // Keep the cursor inside what is mounted, so paging never strands it on a
    // row that has no card to scroll to.
    if (next >= shown) showMore();
    setSelectedId(suggestions[next].id);
  };

  useQueueShortcuts({
    onNext: () => step(1),
    onPrevious: () => step(-1),
    onAccept: () => selected?.status === "pending" && decide(selected.id, "approved"),
    onReject: () => selected?.status === "pending" && decide(selected.id, "rejected"),
    onUndo: () => {
      if (selected && isReversible(selected.status)) undo([selected.id]);
      else if (notice?.undoIds?.length) undo(notice.undoIds);
    },
    onEscape: () => {
      if (confirmation) setConfirmation(null);
      else setSelectedId(null);
    },
  });

  useEffect(() => {
    // Optional-called: not every environment implements scrollIntoView.
    cursorRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [selectedId]);

  return (
    <>
      <PageHeader
        title="Link suggestions"
        sub={`${pendingTotal} pending across ${sites?.length ?? 0} sites · queued links are not live until published`}
        badge="Baseline cosine"
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
              actionable={statusFilter === "all" || statusFilter === "pending"}
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

          <p className="mb-3 text-[12.5px] text-stone-600">
            Keyboard: <span className="rounded bg-chip px-1.5 py-0.5">{SHORTCUT_HINT}</span>
          </p>

          <PublishBanner
            approved={approvedCount}
            siteCount={awaitingPublish.length}
            publishing={publish.isPending}
            onPublish={startPublish}
          />

          {notice && (
            <Notice
              notice={notice}
              onDismiss={() => setNotice(null)}
              onUndo={notice.undoIds ? () => undo(notice.undoIds!) : undefined}
              undoPending={bulkReview.isPending}
            />
          )}

          <div className="flex flex-col gap-2.5 pb-6">
            {loading && <SkeletonRows count={5} label="Loading suggestions" />}

            {!loading && failed && (
              <ErrorPanel
                title="The review queue could not be loaded"
                description="LinkMesh could not reach the engine, so this list is not showing your real suggestions."
                onRetry={retry}
                retrying={sitesQuery.isFetching || suggestionsQuery.isFetching}
              />
            )}

            {!loading && !failed && (
              <>
                <ul className="flex flex-col gap-2.5">
                  {visibleSuggestions.map((suggestion) => (
                    <SuggestionCard
                      key={suggestion.id}
                      suggestion={suggestion}
                      siteName={siteName(suggestion.site_id)}
                      selected={suggestion.id === selectedId}
                      containerRef={suggestion.id === selectedId ? cursorRef : undefined}
                      onOpen={() => setSelectedId(suggestion.id)}
                      onAccept={() => decide(suggestion.id, "approved")}
                      onReject={() => decide(suggestion.id, "rejected")}
                      onUndo={() => undo([suggestion.id])}
                    />
                  ))}
                </ul>
                {hasMore && (
                  <div ref={sentinel} className="flex flex-col items-center gap-2 py-2">
                    <button
                      type="button"
                      onClick={showMore}
                      className="rounded-full border border-stone-300 px-4 py-2 text-sm font-medium hover:border-stone-950"
                    >
                      Show more
                    </button>
                    <span className="text-[12.5px] text-stone-600">
                      Showing {shown.toLocaleString()} of {total.toLocaleString()}
                      {autoLoadPaused && (
                        <>
                          {" "}
                          — paused here to keep the page responsive. Narrow the queue with
                          the filters above, or keep loading.
                        </>
                      )}
                    </span>
                  </div>
                )}
                {suggestions.length === 0 && (
                  <EmptyPanel>
                    {hasSites
                      ? "No suggestions match these filters. Run baseline suggestions from the Sites page, or try another status or site."
                      : "No sites are connected yet. Connect a site on the Sites page, crawl it, then run baseline suggestions."}
                  </EmptyPanel>
                )}
              </>
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
            onUndo={() => undo([selected.id])}
          />
        )}
      </div>
    </>
  );
}

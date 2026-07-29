import { useEffect, useMemo, useRef, useState } from "react";

import Notice from "../components/Notice";
import type { NoticeState } from "../components/Notice";
import PageHeader from "../components/PageHeader";
import { EmptyPanel, ErrorPanel, SkeletonRows } from "../components/QueryState";
import { BulkReviewChunkError } from "../api/suggestions";
import { ENGINE_PAGE_LIMIT } from "../api/engineLimits";
import type {
  SuggestionCounts,
  SuggestionQueueFilters,
} from "../api/suggestions";
import BulkActions from "../components/suggestions/BulkActions";
import type { BulkConfirmation } from "../components/suggestions/BulkActions";
import SuggestionCard from "../components/suggestions/SuggestionCard";
import SuggestionGroup from "../components/suggestions/SuggestionGroup";
import SuggestionPreview from "../components/suggestions/SuggestionPreview";
import PublishBanner from "../components/suggestions/PublishBanner";
import { useIncrementalList } from "../hooks/useIncrementalList";
import { usePendingPublication, usePublishSites } from "../hooks/usePublish";
import { useQueueShortcuts } from "../hooks/useQueueShortcuts";
import {
  useBulkReview,
  useFilteredBulkReview,
  useReview,
  useSuggestionCounts,
  useSuggestions,
} from "../hooks/useSuggestions";
import { useSites } from "../hooks/useSites";
import { isConflict } from "../lib/errors";
import {
  groupSuggestionsBySource,
  suggestionGroupKey,
} from "../lib/suggestionGroups";
import { isReversible, scorePercent } from "../lib/utils";
import {
  clampThreshold,
  filterSuggestions,
  pruneStatusOverrides,
  resolveSuggestionStatuses,
} from "../lib/suggestionReview";
import type {
  BulkReviewAction,
  StatusFilter,
  StatusOverrides,
} from "../lib/suggestionReview";
import type {
  ReviewStatus,
  Suggestion,
  SuggestionStatus,
} from "../types/suggestion";

const CHIP_DEFS: { key: SuggestionStatus; label: string }[] = [
  { key: "pending", label: "Pending review" },
  { key: "approved", label: "Queued for publish" },
  { key: "applying", label: "Publishing" },
  { key: "applied", label: "Published live" },
  { key: "rejected", label: "Rejected" },
];

interface BatchFailure {
  failed: number;
  notAttempted: number;
}

const plural = (count: number) => (count === 1 ? "suggestion" : "suggestions");
const STATUS_OVERRIDE_LIMIT = 5_000;
const SOURCE_GROUP_PAGE_SIZE = 20;
const SOURCE_GROUP_AUTO_LOAD_LIMIT = 100;

const EMPTY_COUNTS: SuggestionCounts = {
  pending: 0,
  approved: 0,
  rejected: 0,
  applying: 0,
  applied: 0,
  expired: 0,
  total: 0,
};

/**
 * Keep server counts responsive while a committed mutation is refetching.
 * The server remains the base; only rows present in the current cursor cache can
 * contribute a known delta.
 */
const resolveCounts = (
  counts: SuggestionCounts | undefined,
  suggestions: Suggestion[],
  overrides: StatusOverrides,
  filters: SuggestionQueueFilters,
) => {
  const resolved = { ...(counts ?? EMPTY_COUNTS) };
  suggestions.forEach((suggestion) => {
    const status = overrides[suggestion.id];
    if (!status || status === suggestion.status) return;
    if (filters.siteId !== undefined && suggestion.site_id !== filters.siteId) return;
    const percent = scorePercent(suggestion.score);
    if (filters.minPercent !== undefined && percent < filters.minPercent) return;
    if (filters.maxPercent !== undefined && percent >= filters.maxPercent) return;

    const previous = suggestion.status as SuggestionStatus;
    resolved[previous] = Math.max(0, resolved[previous] - 1);
    resolved[status] += 1;
  });
  return resolved;
};

export default function ValidationPage() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending");
  const [siteFilter, setSiteFilter] = useState(0);
  const [threshold, setThreshold] = useState(80);
  const [statusOverrides, setStatusOverrides] = useState<StatusOverrides>({});
  const [collapsedSources, setCollapsedSources] = useState<Set<string>>(
    () => new Set(),
  );
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [confirmation, setConfirmation] = useState<BulkConfirmation | null>(null);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const cursorRef = useRef<HTMLLIElement>(null);
  const lastIndex = useRef(0);
  const overrideOrder = useRef<number[]>([]);

  const sitesQuery = useSites();
  const sites = sitesQuery.data;
  const hasSites = Boolean(sites?.length);
  const scope = useMemo<SuggestionQueueFilters>(
    () => (siteFilter === 0 ? {} : { siteId: siteFilter }),
    [siteFilter],
  );
  const queueFilters = useMemo<SuggestionQueueFilters>(
    () => ({
      ...scope,
      ...(statusFilter === "all" ? {} : { status: statusFilter }),
    }),
    [scope, statusFilter],
  );
  const suggestionsQuery = useSuggestions(queueFilters, hasSites);
  const sourceSuggestions = suggestionsQuery.items;
  const fleetCountsQuery = useSuggestionCounts({}, hasSites);
  const scopedCountsQuery = useSuggestionCounts(scope, hasSites);
  const acceptCountsQuery = useSuggestionCounts(
    { ...scope, minPercent: threshold },
    hasSites,
  );
  const rejectCountsQuery = useSuggestionCounts(
    { ...scope, maxPercent: threshold },
    hasSites,
  );
  const pendingPublicationQuery = usePendingPublication(hasSites);
  const review = useReview();
  const bulkReview = useBulkReview();
  const filteredReview = useFilteredBulkReview();
  const publish = usePublishSites();

  // The suggestions query stays disabled until sites arrive, so it reports
  // "pending" before it has any work to do — gate it on the sites we have.
  const queueQueries = [
    suggestionsQuery,
    fleetCountsQuery,
    scopedCountsQuery,
    acceptCountsQuery,
    rejectCountsQuery,
    pendingPublicationQuery,
  ];
  const loading =
    sitesQuery.isPending ||
    (hasSites && queueQueries.some((query) => query.isPending));
  const failed =
    sitesQuery.isError || queueQueries.some((query) => query.isError);
  const fetching = queueQueries.some((query) => query.isFetching);
  const retry = () => {
    void sitesQuery.refetch();
    if (hasSites) queueQueries.forEach((query) => void query.refetch());
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

  const suggestionGroups = useMemo(
    () => groupSuggestionsBySource(suggestions),
    [suggestions],
  );
  const navigableSuggestions = useMemo(
    () =>
      suggestionGroups
        .filter((group) => !collapsedSources.has(group.key))
        .flatMap((group) => group.suggestions),
    [collapsedSources, suggestionGroups],
  );

  const {
    visible: visibleGroups,
    hasMore: hasMoreLoaded,
    showMore: showMoreLoaded,
    sentinel,
    autoLoadPaused,
  } = useIncrementalList(
    suggestionGroups,
    `${statusFilter}:${siteFilter}`,
    SOURCE_GROUP_PAGE_SIZE,
    SOURCE_GROUP_AUTO_LOAD_LIMIT,
  );
  const visibleSuggestions = useMemo(
    () => visibleGroups.flatMap((group) => group.suggestions),
    [visibleGroups],
  );
  const visibleSuggestionIds = useMemo(
    () => new Set(visibleSuggestions.map((suggestion) => suggestion.id)),
    [visibleSuggestions],
  );
  const shown = visibleSuggestions.length;

  const hasMore =
    !suggestionsQuery.isPlaceholderData &&
    (hasMoreLoaded || Boolean(suggestionsQuery.hasNextPage));
  const queueAutoLoadPaused =
    autoLoadPaused ||
    (!hasMoreLoaded && Boolean(suggestionsQuery.hasNextPage));
  const showMore = () => {
    if (suggestionsQuery.isPlaceholderData) return;
    // Reserve the next rendered slice before the request resolves, so the new
    // page appears immediately rather than requiring a second click.
    showMoreLoaded();
    if (!hasMoreLoaded && suggestionsQuery.hasNextPage) {
      void suggestionsQuery.fetchNextPage();
    }
  };

  const siteName = (id: number) =>
    sites?.find((site) => site.id === id)?.name ?? `site ${id}`;
  const fleetCounts = resolveCounts(
    fleetCountsQuery.data,
    sourceSuggestions,
    statusOverrides,
    {},
  );
  const scopedCounts = resolveCounts(
    scopedCountsQuery.data,
    sourceSuggestions,
    statusOverrides,
    scope,
  );
  const acceptCounts = resolveCounts(
    acceptCountsQuery.data,
    sourceSuggestions,
    statusOverrides,
    { ...scope, minPercent: threshold },
  );
  const rejectCounts = resolveCounts(
    rejectCountsQuery.data,
    sourceSuggestions,
    statusOverrides,
    { ...scope, maxPercent: threshold },
  );
  const chips = [
    ...CHIP_DEFS.map((chip) => ({ ...chip, count: scopedCounts[chip.key] })),
    { key: "all", label: "All", count: scopedCounts.total },
  ];
  const pendingTotal = fleetCounts.pending;
  const acceptCount = acceptCounts.pending;
  const rejectCount = rejectCounts.pending;
  const queueTotal =
    statusFilter === "all" ? scopedCounts.total : scopedCounts[statusFilter];

  const applyStatuses = (ids: number[], status: ReviewStatus, notice: NoticeState) => {
    setStatusOverrides((current) => {
      // Housekeeping on write rather than in an effect: drop the overrides the
      // server has already caught up with as we add the new ones.
      const next = { ...pruneStatusOverrides(sourceSuggestions, current) };
      const retained = new Set(Object.keys(next).map(Number));
      const refreshed = new Set(ids);
      overrideOrder.current = overrideOrder.current.filter(
        (id) => retained.has(id) && !refreshed.has(id),
      );
      ids.forEach((id) => {
        delete next[id];
        next[id] = status;
        overrideOrder.current.push(id);
      });
      while (overrideOrder.current.length > STATUS_OVERRIDE_LIMIT) {
        const oldest = overrideOrder.current.shift();
        if (oldest !== undefined) delete next[oldest];
      }
      return next;
    });
    setNotice(notice);
  };

  /**
   * Report a batch the engine only partly applied. The engine's reviewed list
   * is authoritative: skipped or unknown ids must never receive a local
   * override merely because the client requested them.
   */
  const applyBatch = (
    reviewed: number[],
    status: ReviewStatus,
    skipped: number[] | number,
    describe: (count: number) => string,
    failure?: BatchFailure,
  ) => {
    const applied = reviewed;
    const skippedCount = Array.isArray(skipped) ? skipped.length : skipped;
    const aside = skippedCount
      ? `${skippedCount} ${plural(skippedCount)} ${skippedCount === 1 ? "was" : "were"} already picked up for publishing or had expired, so ${skippedCount === 1 ? "it" : "they"} could not be changed.`
      : "";
    const failureMessage = failure
      ? [
          `${applied.length} ${applied.length === 1 ? "decision was" : "decisions were"} saved before the bulk review failed.`,
          `${failure.failed} ${plural(failure.failed)} in the failed request could not be confirmed.`,
          `${failure.notAttempted} later ${plural(failure.notAttempted)} ${failure.notAttempted === 1 ? "was" : "were"} not attempted.`,
        ].join(" ")
      : "";

    if (!applied.length) {
      setNotice({
        message: failure
          ? [failureMessage, aside].filter(Boolean).join(" ")
          : `Nothing changed. ${aside || "Those suggestions are no longer reviewable."}`,
        tone: "error",
      });
      return;
    }

    if (selectedId !== null && applied.includes(selectedId)) {
      const selectedIndex = navigableSuggestions.findIndex(
        (item) => item.id === selectedId,
      );
      if (selectedIndex !== -1) {
        const removed = new Set(applied);
        // Resume at the true vacated position after every reviewed row above
        // the cursor has also left the filtered list.
        lastIndex.current = navigableSuggestions
          .slice(0, selectedIndex)
          .filter((suggestion) => !removed.has(suggestion.id)).length;
      }
    }

    applyStatuses(applied, status, {
      message: [failureMessage || describe(applied.length), aside]
        .filter(Boolean)
        .join(" "),
      // A partial result needs attention, so it stays until dismissed.
      tone: skippedCount || failure ? "error" : "info",
      // Undoing an undo is just a re-review; only decisions offer it.
      undoIds: status === "pending" ? undefined : applied,
    });
  };

  const applyChunkFailure = (
    error: unknown,
    status: ReviewStatus,
    describe: (count: number) => string,
  ) => {
    if (!(error instanceof BulkReviewChunkError)) return false;
    applyBatch(
      error.completed.reviewed,
      status,
      error.completed.skipped,
      describe,
      {
        failed: error.failedIds.length,
        notAttempted: error.notAttemptedIds.length,
      },
    );
    return true;
  };

  /**
   * The row that will hold the cursor once `id` leaves the filtered list. A
   * reviewed suggestion drops out of every filter but "all", so handing the
   * cursor forward here is what lets `a a a` walk the queue — without it the
   * selection stops resolving and `j` restarts from the top.
   */
  const successorOf = (id: number) => {
    const index = navigableSuggestions.findIndex((item) => item.id === id);
    if (index === -1) return null;
    return (
      navigableSuggestions[index + 1] ?? navigableSuggestions[index - 1]
    )?.id ?? null;
  };

  const decide = (id: number, status: ReviewStatus) => {
    const message =
      status === "approved" ? "1 suggestion queued for publish." : "1 suggestion rejected.";
    // Deliberate tri-state: undefined leaves a non-cursor selection alone;
    // null clears a cursor whose removed row has no successor.
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
        onSuccess: ({ reviewed, skipped }) =>
          applyBatch(
            reviewed,
            "pending",
            skipped,
            (count) => `${count} ${plural(count)} restored to pending review.`,
          ),
        onError: (error) => {
          if (
            applyChunkFailure(
              error,
              "pending",
              (count) => `${count} ${plural(count)} restored to pending review.`,
            )
          ) {
            return;
          }
          setNotice({
            message: "That undo could not be saved. Please try again.",
            tone: "error",
          });
        },
      },
    );
  };

  const requestBulk = (action: BulkReviewAction) => {
    const count = action === "approve" ? acceptCount : rejectCount;
    setConfirmation({
      action,
      count,
      threshold,
      siteLabel: siteFilter === 0 ? "All sites" : siteName(siteFilter),
      undoAvailable: count <= ENGINE_PAGE_LIMIT,
    });
  };

  const confirmBulk = () => {
    if (!confirmation) return;
    const approving = confirmation.action === "approve";
    const status = approving ? "approved" : "rejected";
    const describe = (count: number) =>
      approving
        ? `${count} ${plural(count)} queued for publish.`
        : `${count} ${plural(count)} rejected.`;
    setNotice(null);
    setConfirmation(null);
    filteredReview.mutate(
      {
        siteId: siteFilter === 0 ? undefined : siteFilter,
        status,
        thresholdPercent: confirmation.threshold,
      },
      {
        onSuccess: ({ reviewed, skipped, reviewed_ids: reviewedIds }) => {
          if (reviewedIds !== null) {
            applyBatch(reviewedIds, status, skipped, describe);
            return;
          }
          setSelectedId(null);
          setNotice({
            message: [
              describe(reviewed),
              skipped
                ? `${skipped} ${plural(skipped)} could not be changed because publishing had already claimed them or they had expired.`
                : "",
              "This change was too large to undo in one step. The queue has been refreshed.",
            ]
              .filter(Boolean)
              .join(" "),
            tone: skipped ? "error" : "info",
          });
        },
        onError: () =>
          setNotice({
            message: "The bulk review could not be saved. Please try again.",
            tone: "error",
          }),
      },
    );
  };

  const pendingPublication = (pendingPublicationQuery.data ?? []).filter(
    (entry) => siteFilter === 0 || entry.site_id === siteFilter,
  );
  const awaitingPublish = pendingPublication.map((entry) => entry.site_id);
  const approvedCount = pendingPublication.reduce(
    (total, entry) => total + entry.awaiting_publication,
    0,
  );

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
  useEffect(() => {
    const index = navigableSuggestions.findIndex(
      (item) => item.id === selectedId,
    );
    if (index !== -1) lastIndex.current = index;
  }, [navigableSuggestions, selectedId]);

  // Move the cursor within the visible list, seeding it at the top on first use.
  const step = (delta: number) => {
    if (!navigableSuggestions.length) return;
    const current = navigableSuggestions.findIndex(
      (item) => item.id === selectedId,
    );
    // A bulk review can pull the cursor row out from under the selection. The
    // row that slid into its index is the one to resume on — snapping back to
    // the top of the queue would lose the editor's place entirely.
    const target = current === -1 ? lastIndex.current : current + delta;
    const next = Math.min(
      navigableSuggestions.length - 1,
      Math.max(0, target),
    );
    // Keep the cursor inside what is mounted, so paging never strands it on a
    // row that has no card to scroll to.
    const nextSuggestion = navigableSuggestions[next];
    if (!visibleSuggestionIds.has(nextSuggestion.id)) showMore();
    setSelectedId(nextSuggestion.id);
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

  const toggleSourceGroup = (groupKey: string) => {
    const isCollapsing = !collapsedSources.has(groupKey);
    setCollapsedSources((current) => {
      const next = new Set(current);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
      return next;
    });
    if (
      isCollapsing &&
      selected &&
      suggestionGroupKey(selected) === groupKey
    ) {
      setSelectedId(null);
    }
  };

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
              acceptCount={acceptCount}
              rejectCount={rejectCount}
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
              className="h-8 cursor-pointer rounded-pill border border-hairline-strong bg-surface-card px-3.5 text-caption text-ink"
            >
              <option value={0}>All sites</option>
              {sites?.map((site) => (
                <option key={site.id} value={site.id}>
                  {site.name}
                </option>
              ))}
            </select>
          </div>

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
              undoPending={bulkReview.isPending || filteredReview.isPending}
            />
          )}

          <div className="flex flex-col gap-2.5 pb-6">
            {loading && <SkeletonRows count={5} label="Loading suggestions" />}

            {!loading && failed && (
              <ErrorPanel
                title="The review queue could not be loaded"
                description="LinkMesh could not reach the engine, so this list is not showing your real suggestions."
                onRetry={retry}
                retrying={sitesQuery.isFetching || fetching}
              />
            )}

            {!loading && !failed && (
              <>
                <div className="flex flex-col gap-3">
                  {visibleGroups.map((group) => (
                    <SuggestionGroup
                      key={group.key}
                      sourceArticle={group.sourceArticle}
                      siteId={group.siteId}
                      siteName={siteName(group.siteId)}
                      count={group.suggestions.length}
                      collapsed={collapsedSources.has(group.key)}
                      onToggle={() => toggleSourceGroup(group.key)}
                    >
                      {group.suggestions.map((suggestion) => (
                        <SuggestionCard
                          key={suggestion.id}
                          suggestion={suggestion}
                          siteName={siteName(suggestion.site_id)}
                          selected={suggestion.id === selectedId}
                          showSource={false}
                          containerRef={
                            suggestion.id === selectedId ? cursorRef : undefined
                          }
                          onOpen={() => setSelectedId(suggestion.id)}
                          onAccept={() => decide(suggestion.id, "approved")}
                          onReject={() => decide(suggestion.id, "rejected")}
                          onUndo={() => undo([suggestion.id])}
                        />
                      ))}
                    </SuggestionGroup>
                  ))}
                </div>
                {hasMore && (
                  <div ref={sentinel} className="flex flex-col items-center gap-2 py-2">
                    <button
                      type="button"
                      onClick={showMore}
                      disabled={suggestionsQuery.isFetchingNextPage}
                      className="btn btn-outline"
                    >
                      {suggestionsQuery.isFetchingNextPage ? "Loading more..." : "Show more"}
                    </button>
                    <span className="text-caption text-muted">
                      Showing {shown.toLocaleString()} of {queueTotal.toLocaleString()}
                      {queueAutoLoadPaused && (
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

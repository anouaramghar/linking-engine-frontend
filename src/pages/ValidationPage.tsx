import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
import QueueFilters from "../components/suggestions/QueueFilters";
import { useQueueFilters } from "../hooks/useQueueFilters";
import SuggestionCard from "../components/suggestions/SuggestionCard";
import SuggestionGroup from "../components/suggestions/SuggestionGroup";
import SuggestionPreview from "../components/suggestions/SuggestionPreview";
import PublishBanner from "../components/suggestions/PublishBanner";
import PublicationPreviewModal from "../components/suggestions/PublicationPreviewModal";
import { useIncrementalList } from "../hooks/useIncrementalList";
import {
  usePendingPublication,
  usePublicationDryRun,
  usePublishSites,
} from "../hooks/usePublish";
import {
  SHORTCUT_HINT,
  useQueueShortcuts,
  useShortcutsEnabled,
} from "../hooks/useQueueShortcuts";
import {
  useBulkReview,
  useFilteredBulkReview,
  usePlacement,
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
import { formatCount, isReversible, scorePercent } from "../lib/utils";
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
  { key: "failed", label: "Publishing failed" },
  { key: "rejected", label: "Rejected" },
  { key: "expired", label: "Expired" },
];

interface BatchFailure {
  failed: number;
  notAttempted: number;
}

const plural = (count: number) => (count === 1 ? "suggestion" : "suggestions");
const STATUS_OVERRIDE_LIMIT = 5_000;
const SOURCE_GROUP_PAGE_SIZE = 20;
const SOURCE_GROUP_AUTO_LOAD_LIMIT = 100;
const SOURCE_SUGGESTION_PAGE_SIZE = 20;
const SOURCE_SUGGESTION_AUTO_LOAD_LIMIT = 100;
const SOURCE_SUGGESTION_HARD_LIMIT = 1_000;

const EMPTY_COUNTS: SuggestionCounts = {
  pending: 0,
  approved: 0,
  rejected: 0,
  applying: 0,
  applied: 0,
  expired: 0,
  failed: 0,
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
  const { filters, setFilters, reset: clearFilters, isFiltered } = useQueueFilters();
  const {
    status: statusFilter,
    siteId: siteFilter,
    threshold,
  } = filters;
  const [statusOverrides, setStatusOverrides] = useState<StatusOverrides>({});
  const [collapsedSources, setCollapsedSources] = useState<Set<string>>(
    () => new Set(),
  );
  const [groupLimits, setGroupLimits] = useState<Record<string, number>>({});
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [confirmation, setConfirmation] = useState<BulkConfirmation | null>(null);
  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [previewSiteId, setPreviewSiteId] = useState<number | null>(null);
  const cursorRef = useRef<HTMLLIElement>(null);
  const lastIndex = useRef(0);
  const overrideOrder = useRef<number[]>([]);
  const pendingNavigationAfterId = useRef<number | null>(null);
  const focusAfterReview = useRef<number | "main" | null>(null);

  const { enabled: shortcutsEnabled, toggle: toggleShortcuts } = useShortcutsEnabled();

  const sitesQuery = useSites();
  // Every site, because this list is also what resolves a suggestion's site
  // name — dropping pool sources here would label their groups "site 12".
  const sites = sitesQuery.data;
  // Only owned sites are counted in the header: a pool source contributes
  // articles to link *from*, it is not somewhere links get published.
  const ownedSiteCount =
    sites?.filter((site) => site.platform !== "pool").length ?? 0;
  const hasSites = Boolean(sites?.length);

  /**
   * Everything that narrows the queue except its score window and its status.
   *
   * The bulk rule is defined over exactly this set plus its own threshold, so
   * anything added here is automatically carried into the rule as well — which
   * is what keeps "accept the 412 shown" from drifting back into a promise the
   * dashboard cannot keep.
   */
  const scope = useMemo<SuggestionQueueFilters>(
    () => ({
      ...(siteFilter === 0 ? {} : { siteId: siteFilter }),
      ...(filters.q.trim() === "" ? {} : { q: filters.q.trim() }),
      ...(filters.targetOrigin === "" ? {} : { targetOrigin: filters.targetOrigin }),
      ...(filters.hideReciprocal ? { excludeReciprocal: true } : {}),
    }),
    [siteFilter, filters.q, filters.targetOrigin, filters.hideReciprocal],
  );

  /**
   * The score window the list is actually showing.
   *
   * While a bulk rule is being confirmed, the queue switches to that rule's own
   * window — the whole point of the confirmation is that the editor can look at
   * the rows before agreeing to review them in one go. The browse filter comes
   * back the moment the confirmation is cancelled.
   */
  const scoreWindow = useMemo<SuggestionQueueFilters>(() => {
    if (confirmation) {
      return confirmation.action === "approve"
        ? { minPercent: confirmation.threshold }
        : { maxPercent: confirmation.threshold };
    }
    return filters.minScore === 0 ? {} : { minPercent: filters.minScore };
  }, [confirmation, filters.minScore]);

  // A rule only ever matches pending rows, so previewing one has to look at
  // pending rows regardless of which chip is selected.
  const effectiveStatus: StatusFilter = confirmation ? "pending" : statusFilter;

  const queueFilters = useMemo<SuggestionQueueFilters>(
    () => ({
      ...scope,
      ...scoreWindow,
      ...(effectiveStatus === "all" ? {} : { status: effectiveStatus }),
    }),
    [scope, scoreWindow, effectiveStatus],
  );
  const suggestionsQuery = useSuggestions(queueFilters, hasSites);
  const sourceSuggestions = suggestionsQuery.items;
  const refreshingQueueData = Boolean(suggestionsQuery.isPlaceholderData);
  const fleetCountsQuery = useSuggestionCounts({}, hasSites);
  // The chips label the list, so they count inside the same window it shows —
  // otherwise "Pending review · 805" sits above a filtered queue of nine.
  const scopedFilters = useMemo(
    () => ({ ...scope, ...scoreWindow }),
    [scope, scoreWindow],
  );
  const scopedCountsQuery = useSuggestionCounts(scopedFilters, hasSites);
  const acceptCountsQuery = useSuggestionCounts(
    { ...scope, minPercent: threshold },
    hasSites,
  );
  const rejectCountsQuery = useSuggestionCounts(
    { ...scope, maxPercent: threshold },
    hasSites,
  );
  const pendingPublicationQuery = usePendingPublication(hasSites);
  // Only a *stale* answer pauses review: `isPlaceholderData` means these counts
  // still describe the previous filter, so acting on them would act on the
  // wrong rows. A background refetch is not that — reviewing a row invalidates
  // this whole key namespace, so gating on `isFetching` here would freeze the
  // queue for four round-trips after every single decision.
  const refreshingCounts = [
    fleetCountsQuery,
    scopedCountsQuery,
    acceptCountsQuery,
    rejectCountsQuery,
  ].some((query) => query.isPlaceholderData);
  const queueUpdating = refreshingQueueData || refreshingCounts;
  const publicationPreview = usePublicationDryRun(previewSiteId);
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
    (hasSites && suggestionsQuery.isPending);
  const failed = sitesQuery.isError || suggestionsQuery.isError;
  const bulkCountQueryFailed = [
    fleetCountsQuery,
    scopedCountsQuery,
    acceptCountsQuery,
    rejectCountsQuery,
  ].some((query) => query.isError);
  const supportQueryFailed =
    bulkCountQueryFailed || pendingPublicationQuery.isError;
  const actionMutationPending = Boolean(
    review.isPending || bulkReview.isPending || filteredReview.isPending,
  );
  const bulkControlsBlocked =
    failed || queueUpdating || bulkCountQueryFailed || actionMutationPending;
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
        status: effectiveStatus,
      }),
    [resolvedSuggestions, siteFilter, effectiveStatus],
  );

  const suggestionGroups = useMemo(
    () => groupSuggestionsBySource(suggestions),
    [suggestions],
  );

  const {
    visible: visibleGroups,
    hasMore: hasMoreLoaded,
    showMore: showMoreLoaded,
    sentinel,
    autoLoadPaused,
    renderLimitReached,
  } = useIncrementalList(
    suggestionGroups,
    // Every filter belongs in this key: a narrowed queue that kept the previous
    // window would open already scrolled past rows the editor has not seen.
    JSON.stringify([effectiveStatus, queueFilters]),
    SOURCE_GROUP_PAGE_SIZE,
    SOURCE_GROUP_AUTO_LOAD_LIMIT,
  );
  const renderedGroups = useMemo(
    () =>
      visibleGroups.map((group) => ({
        ...group,
        visibleSuggestions: group.suggestions.slice(
          0,
          groupLimits[group.key] ?? SOURCE_SUGGESTION_PAGE_SIZE,
        ),
      })),
    [groupLimits, visibleGroups],
  );
  const navigableSuggestions = useMemo(
    () =>
      renderedGroups
        .filter((group) => !collapsedSources.has(group.key))
        .flatMap((group) => group.visibleSuggestions),
    [collapsedSources, renderedGroups],
  );
  const visibleSuggestions = useMemo(
    () => renderedGroups.flatMap((group) => group.visibleSuggestions),
    [renderedGroups],
  );
  const visibleSuggestionIds = useMemo(
    () => new Set(visibleSuggestions.map((suggestion) => suggestion.id)),
    [visibleSuggestions],
  );
  const shown = visibleSuggestions.length;

  const hasMore =
    !suggestionsQuery.isPlaceholderData &&
    (renderLimitReached || hasMoreLoaded || Boolean(suggestionsQuery.hasNextPage));
  const queueAutoLoadPaused =
    autoLoadPaused ||
    renderLimitReached ||
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

  // Names are looked up per rendered row, so the linear scan is hoisted into a
  // map rather than repeated for every suggestion in the queue.
  const siteNames = useMemo(
    () => new Map(sites?.map((site) => [site.id, site.name])),
    [sites],
  );
  const siteName = useCallback(
    (id: number) => siteNames.get(id) ?? `site ${id}`,
    [siteNames],
  );

  // Each of these walks the whole loaded queue. Unmemoised they ran four full
  // passes on every render — including every cursor move — which is what made
  // holding `j` down feel heavy once a few hundred rows were mounted.
  const fleetCounts = useMemo(
    () => resolveCounts(fleetCountsQuery.data, sourceSuggestions, statusOverrides, {}),
    [fleetCountsQuery.data, sourceSuggestions, statusOverrides],
  );
  const scopedCounts = useMemo(
    () =>
      resolveCounts(
        scopedCountsQuery.data,
        sourceSuggestions,
        statusOverrides,
        scopedFilters,
      ),
    [scopedCountsQuery.data, sourceSuggestions, statusOverrides, scopedFilters],
  );
  const acceptCounts = useMemo(
    () =>
      resolveCounts(acceptCountsQuery.data, sourceSuggestions, statusOverrides, {
        ...scope,
        minPercent: threshold,
      }),
    [acceptCountsQuery.data, sourceSuggestions, statusOverrides, scope, threshold],
  );
  const rejectCounts = useMemo(
    () =>
      resolveCounts(rejectCountsQuery.data, sourceSuggestions, statusOverrides, {
        ...scope,
        maxPercent: threshold,
      }),
    [rejectCountsQuery.data, sourceSuggestions, statusOverrides, scope, threshold],
  );
  const scopedCountsUnavailable =
    scopedCountsQuery.isPending ||
    scopedCountsQuery.isError ||
    scopedCountsQuery.isPlaceholderData;
  const chips = [
    ...CHIP_DEFS.map((chip) => ({
      ...chip,
      count: scopedCountsUnavailable ? "—" : scopedCounts[chip.key],
    })),
    {
      key: "all",
      label: "All",
      count: scopedCountsUnavailable ? "—" : scopedCounts.total,
    },
  ];
  const pendingTotal = fleetCountsQuery.isPending || fleetCountsQuery.isError
    ? null
    : fleetCounts.pending;
  const acceptCount = acceptCountsQuery.isPending || acceptCountsQuery.isError
    ? null
    : acceptCounts.pending;
  const rejectCount = rejectCountsQuery.isPending || rejectCountsQuery.isError
    ? null
    : rejectCounts.pending;
  const queueTotal =
    scopedCountsQuery.isPending || scopedCountsQuery.isError
      ? null
      : effectiveStatus === "all"
        ? scopedCounts.total
        : scopedCounts[effectiveStatus];

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
    reviewedCount = reviewed.length,
  ) => {
    const applied = reviewed;
    const confirmedCount = Math.max(reviewedCount, applied.length);
    const unknownIdCount = confirmedCount - applied.length;
    const skippedCount = Array.isArray(skipped) ? skipped.length : skipped;
    const aside = skippedCount
      ? `${skippedCount} ${plural(skippedCount)} ${skippedCount === 1 ? "was" : "were"} already picked up for publishing or had expired, so ${skippedCount === 1 ? "it" : "they"} could not be changed.`
      : "";
    const failureMessage = failure
      ? [
          `${confirmedCount} ${confirmedCount === 1 ? "decision was" : "decisions were"} saved before the bulk review failed.`,
          `${failure.failed} ${plural(failure.failed)} in the failed request could not be confirmed.`,
          `${failure.notAttempted} later ${plural(failure.notAttempted)} ${failure.notAttempted === 1 ? "was" : "were"} not attempted.`,
        ].join(" ")
      : "";
    const legacyMessage = unknownIdCount
      ? `The older engine confirmed ${unknownIdCount} ${unknownIdCount === 1 ? "decision" : "decisions"} without returning ${unknownIdCount === 1 ? "its suggestion ID" : "their suggestion IDs"}. The queue has been refreshed, and no further undo is available from this message.`
      : "";

    if (!confirmedCount) {
      setNotice({
        message: failure
          ? [failureMessage, aside].filter(Boolean).join(" ")
          : `Nothing changed. ${aside || "Those suggestions are no longer reviewable."}`,
        tone: "error",
      });
      return;
    }

    if (unknownIdCount) {
      focusAfterReview.current = "main";
      setSelectedId(null);
    } else if (selectedId !== null && applied.includes(selectedId)) {
      if (status === "pending") {
        // Undo puts the row back into the current pending queue, so keep the
        // editor on that row and put focus on its new decision control.
        focusAfterReview.current = selectedId;
      } else {
        const selectedIndex = navigableSuggestions.findIndex(
          (item) => item.id === selectedId,
        );
        if (selectedIndex !== -1) {
          const removed = new Set(applied);
          const next =
            navigableSuggestions
              .slice(selectedIndex + 1)
              .find((suggestion) => !removed.has(suggestion.id)) ??
            [...navigableSuggestions]
              .slice(0, selectedIndex)
              .reverse()
              .find((suggestion) => !removed.has(suggestion.id));
          // Resume at the true vacated position after every reviewed row above
          // the cursor has also left the filtered list.
          lastIndex.current = navigableSuggestions
            .slice(0, selectedIndex)
            .filter((suggestion) => !removed.has(suggestion.id)).length;
          focusAfterReview.current = next?.id ?? "main";
        }
      }
    }

    applyStatuses(applied, status, {
      message: [failureMessage || describe(confirmedCount), aside, legacyMessage]
        .filter(Boolean)
        .join(" "),
      // A partial result needs attention, so it stays until dismissed.
      tone: skippedCount || failure ? "error" : "info",
      // Undoing an undo is just a re-review; only decisions offer it.
      undoIds: status === "pending" || unknownIdCount ? undefined : applied,
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
      error.completed.reviewedCount,
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
    if (queueUpdating || confirmation || actionMutationPending) return;
    const message =
      status === "approved" ? "1 suggestion queued for publish." : "1 suggestion rejected.";
    // Deliberate tri-state: undefined leaves a non-cursor selection alone;
    // null clears a cursor whose removed row has no successor.
    const successor = successorOf(id);
    setNotice(null);
    review.mutate(
      { id, status },
      {
        onSuccess: () => {
          applyStatuses([id], status, { message, tone: "info", undoIds: [id] });
          focusAfterReview.current = successor ?? "main";
          if (id === selectedId) {
            setSelectedId(successor);
          }
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
    if (queueUpdating || confirmation || actionMutationPending) return;
    setNotice(null);
    bulkReview.mutate(
      { ids, status: "pending" },
      {
        onSuccess: ({ reviewed, reviewedCount, skipped }) =>
          applyBatch(
            reviewed,
            "pending",
            skipped,
            (count) => `${count} ${plural(count)} restored to pending review.`,
            undefined,
            reviewedCount,
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

  /**
   * Row handlers that never change identity.
   *
   * `decide` and `undo` close over the cursor and the filtered list, so they
   * are rebuilt on every render — handed to a memoised card that defeats the
   * memo entirely. Latching them in a ref (the same trick `useQueueShortcuts`
   * and `Notice` already use for their timers) gives every row one stable
   * callback for the life of the page, so a cursor move re-renders the two
   * rows whose selection actually changed instead of all of them.
   */
  const rowActions = useRef({ decide, undo });
  useEffect(() => {
    rowActions.current = { decide, undo };
  });
  const openRow = useCallback((id: number) => setSelectedId(id), []);
  const acceptRow = useCallback((id: number) => rowActions.current.decide(id, "approved"), []);
  const rejectRow = useCallback((id: number) => rowActions.current.decide(id, "rejected"), []);
  const undoRow = useCallback((id: number) => rowActions.current.undo([id]), []);

  const requestBulk = (action: BulkReviewAction) => {
    if (bulkControlsBlocked) return;
    const count = action === "approve" ? acceptCount : rejectCount;
    if (count === null) return;
    setConfirmation({
      action,
      count,
      threshold,
      siteLabel: siteFilter === 0 ? "All sites" : siteName(siteFilter),
      undoAvailable: count <= ENGINE_PAGE_LIMIT,
    });
  };

  const confirmBulk = () => {
    if (!confirmation || bulkControlsBlocked) return;
    const approving = confirmation.action === "approve";
    const status = approving ? "approved" : "rejected";
    const describe = (count: number) =>
      approving
        ? `${count} ${plural(count)} queued for publish.`
        : `${count} ${plural(count)} rejected.`;
    setNotice(null);
    focusAfterReview.current = "main";
    setConfirmation(null);
    filteredReview.mutate(
      {
        // Exactly the filters the queue was showing while this was confirmed.
        siteId: scope.siteId,
        q: scope.q,
        targetOrigin: scope.targetOrigin,
        excludeReciprocal: scope.excludeReciprocal,
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

  // Same rule as the counts: reviewing a row invalidates this query, so a
  // refetch in flight is the normal state after every decision. Only "no answer
  // yet" and "the answer failed" hide the publish controls.
  const publicationUnavailable =
    pendingPublicationQuery.isPending || pendingPublicationQuery.isError;
  const pendingPublication = publicationUnavailable
    ? []
    : (pendingPublicationQuery.data ?? []).filter(
        (entry) => siteFilter === 0 || entry.site_id === siteFilter,
      );
  const awaitingPublish = pendingPublication.map((entry) => entry.site_id);
  const approvedCount = pendingPublication.reduce(
    (total, entry) => total + entry.awaiting_publication,
    0,
  );

  const startPublish = () => {
    if (publicationUnavailable || publish.isPending || awaitingPublish.length === 0) return;
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

  // Keyed to the open suggestion, so the queue itself never triggers one:
  // generating a placement runs a model, and a page of rows would run one each.
  const placementQuery = usePlacement(selected?.id ?? null);

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
    if (queueUpdating || !navigableSuggestions.length) return;
    const current = navigableSuggestions.findIndex(
      (item) => item.id === selectedId,
    );
    const currentGroup = renderedGroups.find((group) =>
      group.visibleSuggestions.some((item) => item.id === selectedId),
    );
    const currentGroupLimit = currentGroup
      ? groupLimits[currentGroup.key] ?? SOURCE_SUGGESTION_PAGE_SIZE
      : 0;
    const groupHasMore = Boolean(
      currentGroup &&
        currentGroup.visibleSuggestions.length < currentGroup.suggestions.length &&
        currentGroupLimit < SOURCE_SUGGESTION_AUTO_LOAD_LIMIT,
    );
    if (
      delta > 0 &&
      current === navigableSuggestions.length - 1 &&
      (groupHasMore || suggestionsQuery.hasNextPage)
    ) {
      if (!groupHasMore && autoLoadPaused) {
        setNotice({
          message: "More suggestions are available. Use Show more to keep loading.",
          tone: "info",
        });
        return;
      }
      if (
        suggestionsQuery.isFetchingNextPage ||
        pendingNavigationAfterId.current !== null
      ) {
        return;
      }
      pendingNavigationAfterId.current = navigableSuggestions[current].id;
      if (groupHasMore && currentGroup) {
        setGroupLimits((current) => ({
          ...current,
          [currentGroup.key]:
            (current[currentGroup.key] ?? SOURCE_SUGGESTION_PAGE_SIZE) +
            SOURCE_SUGGESTION_PAGE_SIZE,
        }));
      } else {
        showMoreLoaded();
        void suggestionsQuery.fetchNextPage().catch(() => {
          pendingNavigationAfterId.current = null;
          setNotice({
            message: "The next queue page could not be loaded. Please try again.",
            tone: "error",
          });
        });
      }
      return;
    }
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

  useEffect(() => {
    const afterId = pendingNavigationAfterId.current;
    if (afterId === null || suggestionsQuery.isFetchingNextPage) return;
    const index = navigableSuggestions.findIndex((item) => item.id === afterId);
    const next = index === -1 ? undefined : navigableSuggestions[index + 1];
    if (next) {
      pendingNavigationAfterId.current = null;
      setSelectedId(next.id);
    } else if (!suggestionsQuery.hasNextPage) {
      pendingNavigationAfterId.current = null;
    }
  }, [
    navigableSuggestions,
    suggestionsQuery.hasNextPage,
    suggestionsQuery.isFetchingNextPage,
  ]);

  useQueueShortcuts(
    {
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
    },
    shortcutsEnabled,
  );

  useEffect(() => {
    // Optional-called: not every environment implements scrollIntoView.
    cursorRef.current?.scrollIntoView?.({ block: "nearest" });
  }, [selectedId]);

  useEffect(() => {
    const target = focusAfterReview.current;
    if (target === null) return;
    if (target === "main") {
      document.getElementById("main")?.focus();
      focusAfterReview.current = null;
      return;
    }
    const preview = document.querySelector<HTMLElement>(
      `[role="dialog"][aria-label="Suggestion detail"][data-suggestion-id="${target}"], aside[aria-label="Suggestion detail"][data-suggestion-id="${target}"]`,
    );
    const control = preview
      ? preview.querySelector<HTMLElement>("button:not([aria-label='Close preview'])")
      : document.querySelector<HTMLElement>(`[data-suggestion-id="${target}"] button`);
    if (control) {
      control.focus();
      focusAfterReview.current = null;
    }
  }, [selectedId, visibleSuggestions]);

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
        sub={`${pendingTotal === null ? "Pending count unavailable" : `${formatCount(pendingTotal)} pending`} across ${ownedSiteCount} ${
          ownedSiteCount === 1 ? "site" : "sites"
        } · queued links are not live until published`}
      />
      <div className="relative flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5 lg:px-8 lg:py-6">
          {/* Any filter change invalidates a confirmation in flight: the rule it
              describes was defined over the previous set of rows. */}
          <div className="mb-5 flex flex-col gap-4">
            <QueueFilters
              filters={filters}
              onChange={(patch) => {
                setFilters(patch);
                setConfirmation(null);
              }}
              sites={sites}
              isFiltered={isFiltered}
              onClear={() => {
                clearFilters();
                setConfirmation(null);
              }}
            />
            <BulkActions
              chips={chips}
              active={statusFilter}
              onSelect={(status) => {
                setFilters({ status: status as StatusFilter });
                setConfirmation(null);
              }}
              threshold={threshold}
              onThresholdChange={(value) => {
                setFilters({ threshold: clampThreshold(value) });
                setConfirmation(null);
              }}
              acceptCount={acceptCount}
              rejectCount={rejectCount}
              actionable={
                !bulkControlsBlocked &&
                (statusFilter === "all" || statusFilter === "pending")
              }
              confirmation={confirmation}
              confirmationBlocked={bulkControlsBlocked}
              onRequest={requestBulk}
              onConfirm={confirmBulk}
              onCancel={() => setConfirmation(null)}
            />
          </div>

          {/* The queue's fast path, said out loud. It was reachable but written
              down nowhere, and a single unmodified key that files a review is
              also one an editor has to be able to switch off. */}
          <details className="mb-4 text-caption text-muted">
            <summary className="inline-flex cursor-pointer list-none items-center gap-2 rounded-md px-3 py-2 hover:bg-surface-strong">
              <span aria-hidden="true">⌨</span>
              <span className="font-medium text-ink">Keyboard shortcuts</span>
              <span>({shortcutsEnabled ? "on" : "off"})</span>
            </summary>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 px-3">
              {shortcutsEnabled ? (
                <span>
                  <span className="font-medium text-ink">{SHORTCUT_HINT}</span>
                </span>
              ) : (
                <span>Keyboard shortcuts are off.</span>
              )}
              <button
                type="button"
                onClick={toggleShortcuts}
                aria-pressed={shortcutsEnabled}
                className="font-medium text-ink underline underline-offset-2 hover:text-primary"
              >
                {shortcutsEnabled ? "Turn off" : "Turn on"}
              </button>
            </div>
          </details>

          <PublishBanner
            approved={approvedCount}
            siteCount={awaitingPublish.length}
            publishing={publish.isPending}
            onPublish={startPublish}
            onPreview={
              awaitingPublish.length === 1
                ? () => setPreviewSiteId(awaitingPublish[0])
                : undefined
            }
          />

          {notice && (
            <Notice
              notice={notice}
              onDismiss={() => setNotice(null)}
              onUndo={notice.undoIds ? () => undo(notice.undoIds!) : undefined}
              undoPending={bulkReview.isPending || filteredReview.isPending}
            />
          )}

          {queueUpdating && (
            <div
              role="status"
              aria-live="polite"
              className="mb-3 rounded-lg border border-hairline bg-surface-strong px-4 py-2.5 text-caption text-body"
            >
              Updating the queue for these filters. Review actions are paused until the current
              results arrive.
            </div>
          )}

          {supportQueryFailed && !failed && (
            <div
              role="alert"
              className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-error/30 bg-error/5 px-3 py-2 text-caption text-error-ink"
            >
              <span className="min-w-0 flex-1">
                Some queue totals or publication status could not be loaded. The current list is
                still available, but related bulk controls may be paused.
              </span>
              <button
                type="button"
                onClick={retry}
                className="btn btn-outline btn-sm border-error/40 bg-surface-card text-error-ink hover:border-error"
              >
                Retry supporting data
              </button>
            </div>
          )}

          {publicationUnavailable && !pendingPublicationQuery.isError && (
            <div
              role="status"
              aria-live="polite"
              className="mb-3 rounded-lg border border-hairline bg-surface-strong px-4 py-2.5 text-caption text-body"
            >
              Loading publication status. Publishing is paused until it arrives.
            </div>
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
                  {renderedGroups.map((group) => (
                    <SuggestionGroup
                      key={group.key}
                      sourceArticle={group.sourceArticle}
                      siteId={group.siteId}
                      siteName={siteName(group.siteId)}
                      count={group.suggestions.length}
                      visibleCount={group.visibleSuggestions.length}
                      canShowMore={
                        group.visibleSuggestions.length <
                        Math.min(group.suggestions.length, SOURCE_SUGGESTION_HARD_LIMIT)
                      }
                      onShowMore={() =>
                        setGroupLimits((current) => ({
                          ...current,
                          [group.key]: Math.min(
                            SOURCE_SUGGESTION_HARD_LIMIT,
                            (current[group.key] ?? SOURCE_SUGGESTION_PAGE_SIZE) +
                              SOURCE_SUGGESTION_PAGE_SIZE,
                          ),
                        }))
                      }
                      collapsed={collapsedSources.has(group.key)}
                      onToggle={() => toggleSourceGroup(group.key)}
                    >
                      {group.visibleSuggestions.map((suggestion) => (
                        <SuggestionCard
                          key={suggestion.id}
                          suggestion={suggestion}
                          siteName={siteName(suggestion.site_id)}
                          selected={suggestion.id === selectedId}
                          actionsDisabled={queueUpdating || actionMutationPending}
                          showSource={false}
                          containerRef={
                            suggestion.id === selectedId ? cursorRef : undefined
                          }
                          onOpen={openRow}
                          onAccept={acceptRow}
                          onReject={rejectRow}
                          onUndo={undoRow}
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
                      disabled={renderLimitReached || suggestionsQuery.isFetchingNextPage}
                      className="btn btn-outline"
                    >
                      {renderLimitReached
                        ? "Render limit reached"
                        : suggestionsQuery.isFetchingNextPage
                          ? "Loading more..."
                          : "Show more"}
                    </button>
                    {/* Paging and filtering both change this line and nothing
                        else on screen, so it has to announce itself. Bare
                        aria-live rather than role="status": the notice above is
                        the page's status region, and two of them would make
                        "the status message" ambiguous to a screen reader. */}
                    <span aria-live="polite" className="text-caption text-muted">
                      Showing {formatCount(shown)} of{" "}
                      {queueTotal === null ? "—" : formatCount(queueTotal)}
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
                    {!hasSites ? (
                      "No sites are connected yet. Connect a site on the Sites page, crawl it, then generate suggestions."
                    ) : isFiltered ? (
                      <>
                        No suggestions match these filters.{" "}
                        <button
                          type="button"
                          onClick={clearFilters}
                          className="font-medium text-ink underline underline-offset-2 hover:text-primary"
                        >
                          Clear filters
                        </button>{" "}
                        to see the whole queue.
                      </>
                    ) : (
                      "This queue is empty. Generate suggestions from the Sites page."
                    )}
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
            placement={{
              data: placementQuery.data,
              // `isFetching` too, so a retry replaces the error with progress
              // instead of leaving the old message under a dead button.
              isLoading: placementQuery.isPending || placementQuery.isFetching,
              error: placementQuery.error,
              onRetry: () => void placementQuery.refetch(),
            }}
            actionsDisabled={queueUpdating || actionMutationPending}
            onClose={() => setSelectedId(null)}
            onAccept={() => decide(selected.id, "approved")}
            onReject={() => decide(selected.id, "rejected")}
            onUndo={() => undo([selected.id])}
          />
        )}

        {previewSiteId !== null && (
          <PublicationPreviewModal
            siteName={siteName(previewSiteId)}
            data={publicationPreview.data}
            loading={publicationPreview.isPending || publicationPreview.isFetching}
            error={publicationPreview.isError}
            publishing={publish.isPending}
            onRetry={() => void publicationPreview.refetch()}
            onClose={() => setPreviewSiteId(null)}
            onPublish={() => {
              setNotice(null);
              publish.mutate([previewSiteId], {
                onSuccess: ({ queued, alreadyRunning, failed }) => {
                  setPreviewSiteId(null);
                  setNotice({
                    message: [
                      queued > 0 && "Publish queued for 1 site.",
                      alreadyRunning > 0 && "This site is already publishing.",
                      failed > 0 && "Publishing could not be queued.",
                    ]
                      .filter(Boolean)
                      .join(" "),
                    tone: failed > 0 ? "error" : "info",
                  });
                },
                onError: () =>
                  setNotice({ message: "Publishing could not be started.", tone: "error" }),
              });
            }}
          />
        )}
      </div>
    </>
  );
}

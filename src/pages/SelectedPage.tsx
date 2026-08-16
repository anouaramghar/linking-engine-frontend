import { useCallback, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import type { SuggestionQueueFilters } from "../api/suggestions";
import Notice from "../components/Notice";
import type { NoticeState } from "../components/Notice";
import PageHeader from "../components/PageHeader";
import QueueLink from "../components/QueueLink";
import { EmptyPanel, ErrorPanel, SkeletonRows } from "../components/QueryState";
import FlowSteps from "../components/publish/FlowSteps";
import SuggestionCard from "../components/suggestions/SuggestionCard";
import SuggestionGroup from "../components/suggestions/SuggestionGroup";
import SuggestionPreview from "../components/suggestions/SuggestionPreview";
import QueueFilters from "../components/suggestions/QueueFilters";
import { useIncrementalList } from "../hooks/useIncrementalList";
import { usePageState } from "../hooks/usePageState";
import { useQueueFilters } from "../hooks/useQueueFilters";
import {
  usePlacement,
  useReview,
  useSuggestionCounts,
  useSuggestionEvents,
  useSuggestions,
} from "../hooks/useSuggestions";
import { useSites } from "../hooks/useSites";
import { isConflict } from "../lib/errors";
import { groupSuggestionsBySource } from "../lib/suggestionGroups";
import { formatCount } from "../lib/utils";

const SOURCE_GROUP_PAGE_SIZE = 20;
const SOURCE_GROUP_AUTO_LOAD_LIMIT = 100;
const SOURCE_SUGGESTION_PAGE_SIZE = 20;

/**
 * The selected-links page is intentionally a review inbox, not a second
 * approval surface. It answers three questions in one place: what was
 * selected, what can be filtered, and where one-item or site-batch exact
 * review starts.
 */
export default function SelectedPage() {
  const navigate = useNavigate();
  const { filters, setFilters, reset: clearFilters } = useQueueFilters();
  const { siteId: siteFilter, q, targetOrigin, hideReciprocal } = filters;
  const sitesQuery = useSites();
  const sites = sitesQuery.data;
  const hasSites = Boolean(sites?.length);
  // The same three things the queue keeps in `useQueueWorkspace`, for the same
  // reason: which link is open, which source groups were folded away, and how
  // far each group was expanded are the shape an operator gave this inbox before
  // stepping out to a site or a policy. Rebuilding it by hand on every return is
  // the work this page is supposed to be saving them.
  const [selectedId, setSelectedId] = usePageState<number | null>("selected.previewId", null);
  const [collapsedSources, setCollapsedSources] = usePageState<Set<string>>(
    "selected.collapsedSources",
    () => new Set(),
  );
  const [groupLimits, setGroupLimits] = usePageState<Record<string, number>>(
    "selected.groupLimits",
    {},
  );
  const [notice, setNotice] = useState<NoticeState | null>(null);

  const scope = useMemo<SuggestionQueueFilters>(
    () => ({
      ...(siteFilter === 0 ? {} : { siteId: siteFilter }),
      ...(q.trim() === "" ? {} : { q: q.trim() }),
      ...(targetOrigin === "" ? {} : { targetOrigin }),
      ...(hideReciprocal ? { excludeReciprocal: true } : {}),
      status: "approved",
    }),
    [hideReciprocal, q, siteFilter, targetOrigin],
  );
  // Suggestions and counts are tenant-scoped and safely return empty results
  // when there are no sites. They should not wait for the labels query above.
  const suggestionsQuery = useSuggestions(scope);
  const countsQuery = useSuggestionCounts(scope);
  const review = useReview();
  const sourceSuggestions = suggestionsQuery.items;

  const siteNames = useMemo(
    () => new Map(sites?.map((site) => [site.id, site.name])),
    [sites],
  );
  const siteName = useCallback(
    (id: number) => siteNames.get(id) ?? `site ${id}`,
    [siteNames],
  );

  const groups = useMemo(
    () => groupSuggestionsBySource(sourceSuggestions),
    [sourceSuggestions],
  );
  const {
    visible: visibleGroups,
    hasMore: hasMoreGroups,
    showMore: showMoreGroups,
    sentinel,
    autoLoadPaused,
    renderLimitReached,
  } = useIncrementalList(
    groups,
    JSON.stringify(scope),
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
  const selected =
    sourceSuggestions.find((suggestion) => suggestion.id === selectedId) ?? null;
  const placementQuery = usePlacement(selected?.id ?? null);
  const traceQuery = useSuggestionEvents(selected?.id ?? null);
  const noop = useCallback(() => undefined, []);
  const selectedTotal = countsQuery.data?.approved ?? null;
  const isFiltered =
    siteFilter !== 0 || q.trim() !== "" || targetOrigin !== "" || hideReciprocal;
  const selectionUpdating = Boolean(
    suggestionsQuery.isPlaceholderData || countsQuery.isPlaceholderData,
  );
  const batchReviewReady =
    selectedTotal !== null &&
    selectedTotal > 0 &&
    !selectionUpdating &&
    !countsQuery.isError;
  const actionsDisabled = review.isPending || selectionUpdating;
  const batchDestination = siteFilter > 0 ? `/publish/${siteFilter}` : "/publish";
  const batchLabel =
    siteFilter > 0 ? `Review ${siteName(siteFilter)} exact edits` : "Review selected exact edits";
  const selectedSummary =
    selectedTotal === null
      ? "Selected count unavailable"
      : `${formatCount(selectedTotal)} selected ${selectedTotal === 1 ? "link" : "links"}`;

  const loading = sitesQuery.isPending || (hasSites && suggestionsQuery.isPending);
  const failed = sitesQuery.isError || suggestionsQuery.isError;
  const retry = () => {
    void sitesQuery.refetch();
    if (hasSites) {
      void suggestionsQuery.refetch();
      void countsQuery.refetch();
    }
  };

  const showMore = () => {
    if (suggestionsQuery.isPlaceholderData) return;
    showMoreGroups();
    if (!hasMoreGroups && suggestionsQuery.hasNextPage) {
      void suggestionsQuery.fetchNextPage();
    }
  };

  const undo = useCallback(
    (id: number) => {
      if (review.isPending) return;
      setNotice({ message: "Removing the link from selection…", tone: "info" });
      review.mutate(
        { id, status: "pending" },
        {
          onSuccess: () => {
            setSelectedId((current) => (current === id ? null : current));
            setNotice({
              message: "The link is back in the review queue. It is not live.",
              tone: "info",
            });
          },
          onError: (error) => {
            setNotice({
              message: isConflict(error)
                ? "That link is already publishing, so its selection cannot be changed."
                : "The selection could not be changed. Please try again.",
              tone: "error",
            });
          },
        },
      );
    },
    // `setSelectedId` is as stable as a `useState` setter, but it comes from a
    // hook the lint rule cannot recognise as one, so it is named here.
    [review, setSelectedId],
  );

  const reviewOne = useCallback(
    (id: number) => {
      const suggestion = sourceSuggestions.find((item) => item.id === id);
      if (suggestion) navigate(`/publish/${suggestion.site_id}?suggestion=${id}`);
    },
    [navigate, sourceSuggestions],
  );

  const toggleGroup = (key: string) => {
    const isCollapsing = !collapsedSources.has(key);
    setCollapsedSources((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    if (
      isCollapsing &&
      selected &&
      `${selected.site_id}:${selected.source_article.id}` === key
    ) {
      setSelectedId(null);
    }
  };

  return (
    <>
      <PageHeader
        title="Selected links"
        sub={`${selectedSummary} · exact edits require approval`}
        actions={
          <>
            {batchReviewReady && (
              <Link to={batchDestination} className="btn btn-primary btn-sm">
                {batchLabel}
              </Link>
            )}
            <QueueLink className="btn btn-outline btn-sm">
              Back to review queue
            </QueueLink>
          </>
        }
      />

      <div className="relative flex min-h-0 flex-1">
        <div className="min-w-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5 lg:px-8 lg:py-6">
          <div className="mb-5">
            <FlowSteps current={1} />
          </div>

          <div className="card mb-4 flex flex-col gap-3 p-3 sm:p-4">
            <QueueFilters
              filters={filters}
              onChange={setFilters}
              sites={sites}
              isFiltered={isFiltered}
              onClear={clearFilters}
              ariaLabel="Filter selected links"
            />
            <div className="flex flex-col gap-3 border-t border-hairline pt-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div aria-live="polite" className="text-body-sm font-medium text-ink">
                  {selectedSummary}
                </div>
                <p className="mt-1 max-w-2xl text-caption leading-normal text-muted">
                  Select links here; exact-edit review and approval happen next.
                </p>
              </div>
            </div>
          </div>

          {notice && <Notice notice={notice} onDismiss={() => setNotice(null)} />}

          {selectionUpdating && (
            <div
              role="status"
              aria-live="polite"
              className="mb-3 rounded-lg border border-hairline bg-surface-strong px-4 py-2.5 text-caption text-body"
            >
              Updating selected links for the current filters. Review actions are paused until the
              new results arrive.
            </div>
          )}

          {!selectionUpdating && countsQuery.isError && !failed && (
            <div
              role="alert"
              className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-error/30 bg-error/5 px-3 py-2.5 text-caption text-error-ink"
            >
              <span className="min-w-0 flex-1">
                The list loaded, but the selected count could not be read, so batch review is
                paused. You can still open an individual exact edit.
              </span>
              <button
                type="button"
                onClick={() => void countsQuery.refetch()}
                disabled={countsQuery.isFetching}
                className="btn btn-outline btn-sm border-error/40 bg-surface-card text-error-ink hover:border-error"
              >
                {countsQuery.isFetching ? "Retrying…" : "Retry count"}
              </button>
            </div>
          )}

          {!loading && failed && (
            <ErrorPanel
              title="Selected links could not be loaded"
              description="LinkMesh could not reach the engine, so this page is not showing the real selection."
              onRetry={retry}
              retrying={sitesQuery.isFetching || suggestionsQuery.isFetching}
            />
          )}

          {loading && <SkeletonRows count={4} label="Loading selected links" />}

          {!loading && !failed && !hasSites && (
            <EmptyPanel>
              No sites are connected yet. Connect a site and generate suggestions before selecting
              links.
            </EmptyPanel>
          )}

          {!loading && !failed && hasSites && groups.length === 0 && (
            <EmptyPanel>
              {isFiltered ? (
                <>
                  No selected links match these filters.{" "}
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="font-medium text-ink underline underline-offset-2 hover:text-primary"
                  >
                    Clear filters
                  </button>
                  .
                </>
              ) : (
                <>
                  No links are selected yet. Return to the{" "}
                  <QueueLink
                    className="font-medium text-ink underline underline-offset-2 hover:text-primary"
                  >
                    review queue
                  </QueueLink>{" "}
                  to choose suggestions.
                </>
              )}
            </EmptyPanel>
          )}

          {!loading && !failed && groups.length > 0 && (
            <>
              <div className="flex flex-col gap-3" aria-label="Selected links list">
                {renderedGroups.map((group) => (
                  <SuggestionGroup
                    key={group.key}
                    sourceArticle={group.sourceArticle}
                    siteId={group.siteId}
                    siteName={siteName(group.siteId)}
                    count={group.suggestions.length}
                    visibleCount={group.visibleSuggestions.length}
                    canShowMore={group.visibleSuggestions.length < group.suggestions.length}
                    collapsed={collapsedSources.has(group.key)}
                    onToggle={() => toggleGroup(group.key)}
                    itemLabel="selected link"
                    onShowMore={() =>
                      setGroupLimits((current) => ({
                        ...current,
                        [group.key]:
                          (current[group.key] ?? SOURCE_SUGGESTION_PAGE_SIZE) +
                          SOURCE_SUGGESTION_PAGE_SIZE,
                      }))
                    }
                  >
                    {group.visibleSuggestions.map((suggestion) => (
                      <SuggestionCard
                        key={suggestion.id}
                        suggestion={suggestion}
                        siteName={siteName(suggestion.site_id)}
                        selected={selectedId === suggestion.id}
                        onOpen={setSelectedId}
                        onAccept={noop}
                        onReject={noop}
                        onUndo={undo}
                        onReviewPublication={reviewOne}
                        actionsDisabled={actionsDisabled}
                        showSource={false}
                        showStatusBadge={false}
                      />
                    ))}
                  </SuggestionGroup>
                ))}
              </div>

              {(renderLimitReached || hasMoreGroups || suggestionsQuery.hasNextPage) && (
                <div ref={sentinel} className="flex flex-col items-center gap-2 py-4">
                  <button
                    type="button"
                    onClick={showMore}
                    disabled={selectionUpdating || suggestionsQuery.isFetchingNextPage}
                    className="btn btn-outline"
                  >
                    {selectionUpdating
                      ? "Updating…"
                      : suggestionsQuery.isFetchingNextPage
                        ? "Loading more…"
                        : renderLimitReached
                          ? "Render limit reached"
                          : "Show more"}
                  </button>
                  <span aria-live="polite" className="text-caption text-muted">
                    Showing {formatCount(renderedGroups.reduce((total, group) => total + group.visibleSuggestions.length, 0))} of{" "}
                    {selectionUpdating || selectedTotal === null
                      ? "—"
                      : formatCount(selectedTotal)} selected links
                    {autoLoadPaused && " · paused here to keep the page responsive"}
                  </span>
                </div>
              )}
            </>
          )}
        </div>

        {selected && (
          <SuggestionPreview
            suggestion={selected}
            siteName={siteName(selected.site_id)}
            placement={{
              data: placementQuery.data,
              isLoading: placementQuery.isPending || placementQuery.isFetching,
              error: placementQuery.error,
              onRetry: () => void placementQuery.refetch(),
            }}
            trace={{
              data: traceQuery.data,
              isLoading: traceQuery.isPending || traceQuery.isFetching,
              error: traceQuery.error,
              onRetry: () => void traceQuery.refetch(),
            }}
            actionsDisabled={actionsDisabled}
            onClose={() => setSelectedId(null)}
            onAccept={noop}
            onReject={noop}
            onUndo={() => undo(selected.id)}
            onReviewPublication={() =>
              navigate(`/publish/${selected.site_id}?suggestion=${selected.id}`)
            }
          />
        )}
      </div>
    </>
  );
}

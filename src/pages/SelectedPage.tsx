import { useCallback, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import type { SuggestionQueueFilters } from "../api/suggestions";
import Notice from "../components/Notice";
import type { NoticeState } from "../components/Notice";
import PageHeader from "../components/PageHeader";
import { EmptyPanel, ErrorPanel, SkeletonRows } from "../components/QueryState";
import FlowSteps from "../components/publish/FlowSteps";
import SuggestionCard from "../components/suggestions/SuggestionCard";
import SuggestionGroup from "../components/suggestions/SuggestionGroup";
import SuggestionPreview from "../components/suggestions/SuggestionPreview";
import QueueFilters from "../components/suggestions/QueueFilters";
import { useIncrementalList } from "../hooks/useIncrementalList";
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
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [collapsedSources, setCollapsedSources] = useState<Set<string>>(
    () => new Set(),
  );
  const [groupLimits, setGroupLimits] = useState<Record<string, number>>({});
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
  const suggestionsQuery = useSuggestions(scope, hasSites);
  const countsQuery = useSuggestionCounts(scope, hasSites);
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
  const selectedTotal = countsQuery.data?.total ?? null;
  const isFiltered =
    siteFilter !== 0 || q.trim() !== "" || targetOrigin !== "" || hideReciprocal;
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
    [review],
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
        sub={`${selectedSummary} · nothing is live until the exact edit is approved`}
        actions={
          <Link to="/queue" className="btn btn-outline btn-sm">
            Back to review queue
          </Link>
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
            />
            <div className="flex flex-col gap-3 border-t border-hairline pt-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div aria-live="polite" className="text-body-sm font-medium text-ink">
                  {selectedSummary}
                </div>
                <p className="mt-1 max-w-2xl text-caption leading-normal text-muted">
                  Open one source article's exact edit from a row, or continue to the site-level
                  review workspace for a batch. Selection is not approval and does not schedule
                  publication.
                </p>
              </div>
              {selectedTotal !== null && selectedTotal > 0 && (
                <Link to={batchDestination} className="btn btn-primary flex-none">
                  {batchLabel}
                </Link>
              )}
            </div>
          </div>

          {notice && <Notice notice={notice} onDismiss={() => setNotice(null)} />}

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
                  <Link
                    to="/queue"
                    className="font-medium text-ink underline underline-offset-2 hover:text-primary"
                  >
                    review queue
                  </Link>{" "}
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
                        actionsDisabled={review.isPending}
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
                    disabled={suggestionsQuery.isFetchingNextPage}
                    className="btn btn-outline"
                  >
                    {suggestionsQuery.isFetchingNextPage
                      ? "Loading more…"
                      : renderLimitReached
                        ? "Render limit reached"
                        : "Show more"}
                  </button>
                  <span aria-live="polite" className="text-caption text-muted">
                    Showing {formatCount(renderedGroups.reduce((total, group) => total + group.visibleSuggestions.length, 0))} of{" "}
                    {selectedTotal === null ? "—" : formatCount(selectedTotal)} selected links
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
            actionsDisabled={review.isPending}
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

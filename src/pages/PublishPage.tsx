import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";

import {
  exportPublicationCsv,
  type PublicationPlan,
  type PublicationPreparation,
} from "../api/publish";
import Notice from "../components/Notice";
import type { NoticeState } from "../components/Notice";
import PageHeader from "../components/PageHeader";
import QueueLink from "../components/QueueLink";
import { EmptyPanel, ErrorPanel, SkeletonRows } from "../components/QueryState";
import FlowSteps from "../components/publish/FlowSteps";
import PublicationReview from "../components/publish/PublicationReview";
import { usePageState } from "../hooks/usePageState";
import { useGraphSimulation } from "../hooks/useGraph";
import {
  useApprovePlans,
  usePendingPublication,
  usePendingPublicationSite,
  usePreparePublicationPlans,
  useQueueApprovedPlans,
} from "../hooks/usePublish";
import { useReview } from "../hooks/useSuggestions";
import { isConflict } from "../lib/errors";
import { formatCount } from "../lib/utils";

const plural = (count: number, word: string) =>
  `${count} ${count === 1 ? word : `${word}s`}`;

const NO_TICKS: Set<number> = new Set();

/**
 * Sites holding selected links, newest work first is not a thing here: the list
 * is short and the order that matters is the operator's own site list.
 */
function SiteIndex({
  sites,
  prepared,
  search,
  onSearch,
  hasMore,
  loadingMore,
  onLoadMore,
  onExport,
  exportingSiteId,
}: {
  sites: {
    id: number;
    name: string;
    selectedSuggestions: number;
    approvedPlans: number;
    canPublish: boolean;
    canExport: boolean;
    platform: string;
  }[];
  /** Sites whose edits are already read into this session. */
  prepared: Set<number>;
  search: string;
  onSearch: (value: string) => void;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  onExport: (siteId: number) => void;
  exportingSiteId: number | null;
}) {
  return (
    <div>
      <label className="mb-4 block max-w-md">
        <span className="sr-only">Search sites waiting for publication review</span>
        <input
          type="search"
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder="Search waiting sites"
          className="field w-full"
        />
      </label>
      {sites.length === 0 ? (
        <EmptyPanel>
          {search ? (
            <>No waiting sites match “{search}”.</>
          ) : (
            <>
              Nothing is waiting for review. Select suggestions on the{" "}
              <QueueLink
                className="font-medium text-ink underline underline-offset-2 hover:text-primary"
              >
                review queue
              </QueueLink>{" "}
              first.
            </>
          )}
        </EmptyPanel>
      ) : (
      <ul className="flex flex-col gap-2.5">
        {sites.map((site) => (
        <li
          key={site.id}
          className="card flex flex-col items-stretch gap-3 px-4 py-4 sm:flex-row sm:items-center sm:px-5"
        >
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-body-md font-medium text-ink">{site.name}</span>
              {prepared.has(site.id) && <span className="badge">Prepared</span>}
            </div>
            {/* Two counts that ask for two different things, so they are never
                added together into one "awaiting publication". */}
            <div className="mt-1 text-caption text-muted">
              {[
                site.selectedSuggestions > 0 &&
                  `${plural(site.selectedSuggestions, "link")} selected`,
                site.approvedPlans > 0 &&
                  `${plural(site.approvedPlans, "exact edit")} approved and waiting to be queued`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </div>
          </div>
          {site.canPublish || site.canExport ? (
            <div className="flex flex-none flex-col items-start gap-1 sm:items-end">
              {site.platform === "html" && site.approvedPlans > 0 ? (
                <span className="text-caption-sm text-muted">
                  Approved exact edits are ready as a CSV export
                </span>
              ) : site.selectedSuggestions > 0 ? (
                <span className="text-caption-sm text-muted">
                  <span className="font-medium text-ink">Required</span> &middot; Exact edits are shown before approval
                </span>
              ) : (
                <span className="text-caption-sm text-muted">
                  Already read and approved &middot; only the job is left
                </span>
              )}
              <div className="flex flex-wrap gap-2">
                {(site.platform !== "html" ||
                  site.selectedSuggestions > 0 ||
                  site.approvedPlans === 0) && (
                  <Link to={`/publish/${site.id}`} className="btn btn-primary">
                    {prepared.has(site.id)
                      ? "Back to the edits"
                      : site.selectedSuggestions > 0
                        ? "Review exact edits"
                        : "Queue approved edits"}
                  </Link>
                )}
                {site.platform === "html" && site.approvedPlans > 0 && (
                  <button
                    type="button"
                    onClick={() => onExport(site.id)}
                    disabled={exportingSiteId === site.id}
                    className="btn btn-outline"
                  >
                    {exportingSiteId === site.id ? "Exporting…" : "Export CSV"}
                  </button>
                )}
              </div>
            </div>
          ) : (
            <span className="text-caption text-muted sm:text-right">
              No WordPress account is connected, so the edits cannot be prepared.
            </span>
          )}
        </li>
        ))}
      </ul>
      )}
      {hasMore && (
        <button
          type="button"
          onClick={onLoadMore}
          disabled={loadingMore}
          className="btn btn-outline mt-4"
        >
          {loadingMore ? "Loading…" : "Load more sites"}
        </button>
      )}
    </div>
  );
}

export default function PublishPage() {
  const params = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [siteSearch, setSiteSearch] = usePageState("publish.siteSearch", "");
  const deferredSiteSearch = useDeferredValue(siteSearch);
  const routeJobId = searchParams.get("job");
  const focusSuggestionValue = searchParams.get("suggestion");
  const focusSuggestionCandidate = focusSuggestionValue ? Number(focusSuggestionValue) : NaN;
  const focusSuggestionId =
    Number.isInteger(focusSuggestionCandidate) && focusSuggestionCandidate > 0
      ? focusSuggestionCandidate
      : null;
  const routeSiteId = Number(params.siteId);
  const siteId = Number.isInteger(routeSiteId) && routeSiteId > 0 ? routeSiteId : null;

  const [notice, setNotice] = useState<NoticeState | null>(null);
  const [queued, setQueued] = useState(false);
  const [exportReadySiteId, setExportReadySiteId] = useState<number | null>(null);
  const [exportingSiteId, setExportingSiteId] = useState<number | null>(null);
  // Held when approval succeeded but the job could not start. The approval
  // stands, so the only thing left to offer is a queue retry — and it has to
  // name that same subset, because queueing a plan the operator excluded is a
  // 409. `undefined` ids mean "every approved plan for this site", which is a
  // stored value rather than a missing one.
  const [notQueued, setNotQueued] = useState<{ planIds?: number[] } | null>(null);
  /** Set when the engine refused the approval because the plans moved on. */
  const [stale, setStale] = useState(false);
  const graphSimulation = useGraphSimulation();

  /**
   * One preparation and one set of ticks per batch.
   *
   * Preparation costs a live request per source article, so walking to another
   * site and back must not spend them again — and it must not silently discard
   * the reading the operator already did on the first site.
   *
   * Held in page state rather than component state for the same reason, because
   * "walking away" is not only to another site: an operator who leaves this page
   * to check the source article in the queue was, until this was page state,
   * charged the whole preparation again on the way back, and returned to a
   * review with every tick reset to the default.
   *
   * The key is the site *and* the scope, because those are two different
   * artifacts. A site's batch renders an article carrying every selected link
   * in it, under one hash; a review of one link renders that link alone. Held
   * under one key, arriving from a queue row would show the batch already in
   * hand — and approving it would publish the links the operator did not open.
   * Missing the key is what makes the effect below prepare the right one.
   */
  const [prepared, setPrepared] = usePageState<Map<string, PublicationPreparation>>(
    "publish.prepared",
    () => new Map(),
  );
  const [ticks, setTicks] = usePageState<Map<string, Set<number>>>(
    "publish.ticks",
    () => new Map(),
  );
  const [preparing, setPreparing] = useState<number | null>(null);
  const [prepareFailed, setPrepareFailed] = useState<number | null>(null);
  /** The suggestion being returned to the queue, if any. */
  const [removing, setRemoving] = useState<number | null>(null);

  // A direct site review needs only that site's small summary. Do not make it
  // wait for the fleet inbox, which can span thousands of sites.
  const pendingQuery = usePendingPublication(siteId === null, deferredSiteSearch);
  const activeSiteQuery = usePendingPublicationSite(siteId);
  /** Which batch this page is showing: one site, at one scope. */
  const batchKey = siteId === null ? "" : `${siteId}:${focusSuggestionId ?? "all"}`;
  const preparePlans = usePreparePublicationPlans(routeJobId, batchKey);
  const approvePlans = useApprovePlans();
  const queuePlans = useQueueApprovedPlans();
  const review = useReview();

  const downloadExport = (id: number) => {
    if (exportingSiteId !== null) return;
    setExportingSiteId(id);
    void exportPublicationCsv(id)
      .then((blob) => {
        const href = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = href;
        link.download = `linkmesh-site-${id}-publication.csv`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(href);
        setNotice({ message: "The approved publication CSV was downloaded.", tone: "info" });
      })
      .catch(() => {
        setNotice({ message: "The approved publication CSV could not be downloaded.", tone: "error" });
      })
      .finally(() => setExportingSiteId(null));
  };

  const pendingSites = (pendingQuery.data ?? []).map((entry) => ({
    id: entry.site_id,
    name: entry.site_name ?? `site ${entry.site_id}`,
    selectedSuggestions: entry.selected_suggestions,
    approvedPlans: entry.approved_plans,
    canPublish: entry.can_publish !== false,
    canExport: entry.can_export === true,
    platform: entry.platform ?? "wordpress",
  }));
  const reviewable = pendingSites.filter(
    (site) => site.selectedSuggestions > 0 || site.approvedPlans > 0,
  );
  const activeSite =
    siteId === null
      ? null
      : reviewable.find((site) => site.id === siteId) ??
        (activeSiteQuery.data
          ? {
              id: activeSiteQuery.data.site_id,
              name: activeSiteQuery.data.site_name ?? `site ${activeSiteQuery.data.site_id}`,
              selectedSuggestions: activeSiteQuery.data.selected_suggestions,
              approvedPlans: activeSiteQuery.data.approved_plans,
              canPublish: activeSiteQuery.data.can_publish !== false,
              canExport: activeSiteQuery.data.can_export === true,
              platform: activeSiteQuery.data.platform ?? "wordpress",
            }
          : null);
  const canPrepare = Boolean(activeSite?.canPublish || activeSite?.canExport);

  const runPrepare = (id: number) => {
    const key = batchKey;
    setPreparing(id);
    setPrepareFailed(null);
    preparePlans.mutate(id, {
      // A one-link review asks the engine for one link. An article holding
      // three selected links is one artifact under one hash, so this is the
      // only place the scope can be set: filtering the screen afterwards would
      // still approve all three.
      suggestionIds: focusSuggestionId !== null ? [focusSuggestionId] : undefined,
      onQueued: (jobId) => {
        setSearchParams(
          (current) => {
            const next = new URLSearchParams(current);
            next.set("job", jobId);
            return next;
          },
          { replace: true },
        );
      },
      onSuccess: (result) => {
        setPrepared((current) => new Map(current).set(key, result));
        // Every prepared article starts ticked: the operator already chose this
        // batch by selecting its suggestions, so the boxes are here to exclude
        // an article, not to consent to one. Consent is the final button, and
        // what it means is pinned by the hash beside each article.
        //
        // A narrowed request comes back as the one article it named. It can
        // still arrive as a wider batch — one preparation runs per site, so a
        // request naming a link may join a batch job already running — and then
        // only the named link's article is ticked.
        const focusedPlans =
          focusSuggestionId !== null
            ? result.plans.filter((plan) =>
                plan.links.some((link) => link.suggestion_id === focusSuggestionId),
              )
            : result.plans;
        setTicks((current) =>
          new Map(current).set(
            key,
            new Set(
              focusedPlans.length > 0
                ? focusedPlans.map((plan) => plan.id)
                : result.plans.map((plan) => plan.id),
            ),
          ),
        );
        setPreparing((current) => (current === id ? null : current));
      },
      onError: () => {
        setPrepareFailed(id);
        setPreparing((current) => (current === id ? null : current));
      },
    });
  };

  /**
   * Preparation runs once per site, and only from an explicit visit. The ref is
   * what keeps a re-render — or a StrictMode double effect — from spending those
   * live requests twice.
   */
  const attempted = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (siteId === null || activeSite === null || !canPrepare) return;
    // Preparation exists to render *new* editorial intent. A site whose only
    // pending work is an approved plan has nothing to prepare: asking anyway
    // spends live requests to arrive at an empty review with no action on it.
    if (activeSite.selectedSuggestions === 0) return;
    // A completed job belongs to the site named in its result. Its retained id
    // must not block preparation when the operator moves to another site.
    if (preparePlans.isPending) return;
    if (preparePlans.isError && routeJobId) return;
    if (prepared.has(batchKey)) return;
    if (preparePlans.data?.site_id === siteId) return;
    if (preparePlans.data) attempted.current.delete(batchKey);
    if (attempted.current.has(batchKey)) return;
    attempted.current.add(batchKey);
    setQueued(false);
    setNotQueued(null);
    setStale(false);
    // Route entry is the explicit user action that starts preparation. The ref
    // makes this one transition, including under StrictMode.
    runPrepare(siteId);
    // `preparePlans` is a fresh object on every render; the ref above is the
    // real guard, so re-running this effect is harmless and cheap.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    siteId,
    batchKey,
    canPrepare,
    activeSite?.selectedSuggestions,
    preparePlans.data?.site_id,
    preparePlans.isError,
    preparePlans.isPending,
    prepared,
    routeJobId,
  ]);

  const busy = approvePlans.isPending || queuePlans.isPending;

  /**
   * Drop a batch, so the next arrival prepares a fresh one.
   *
   * The ticks go with it. While this was component state, unmounting the page
   * was doing this by accident; now that a preparation outlives the page, every
   * path that invalidates one has to say so — a retained batch is a reading of
   * an article as it was, and offering it again after the edits moved on is the
   * one thing the plan hash exists to prevent.
   */
  const forget = (key: string) => {
    setPrepared((current) => {
      if (!current.has(key)) return current;
      const next = new Map(current);
      next.delete(key);
      return next;
    });
    setTicks((current) => {
      if (!current.has(key)) return current;
      const next = new Map(current);
      next.delete(key);
      return next;
    });
  };

  const reload = () => {
    if (siteId === null) return;
    setStale(false);
    setNotice(null);
    forget(batchKey);
    preparePlans.reset();
    graphSimulation.reset();
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete("job");
        return next;
      },
      { replace: true },
    );
    runPrepare(siteId);
  };

  /**
   * Send one link back to the queue.
   *
   * A plan's hash covers the whole article, so a link cannot be dropped from an
   * approval on its own: the suggestion returns to pending and the article is
   * rendered again without it. That costs a second preparation, which is still
   * cheaper than the trip to the queue and back that this replaces.
   */
  const removeLink = (suggestionId: number) => {
    if (siteId === null || busy || removing !== null) return;
    setNotice(null);
    setRemoving(suggestionId);
    review.mutate(
      { id: suggestionId, status: "pending" },
      {
        onSuccess: () => {
          setRemoving(null);
          setNotice({
            message:
              "That link went back to the review queue. The remaining edits are being prepared again.",
            tone: "info",
          });
          forget(batchKey);
          preparePlans.reset();
          graphSimulation.reset();
          runPrepare(siteId);
        },
        onError: (error) => {
          setRemoving(null);
          setNotice({
            message: isConflict(error)
              ? "That link is already publishing, so it can no longer be removed."
              : "That link could not be removed. Please try again.",
            tone: "error",
          });
        },
      },
    );
  };

  // The polled result is the reload-safe path; the map preserves a completed
  // review while the operator walks to another site and back in this session.
  const preparation =
    siteId === null
      ? undefined
      : prepared.get(batchKey) ??
        (preparePlans.data?.site_id === siteId ? preparePlans.data : undefined);

  /**
   * A review that names one link shows that link's article, and nothing else.
   *
   * The narrowing that matters happens in the engine: `runPrepare` asks for the
   * named link, so the artifact it renders carries that link alone and its hash
   * covers nothing more. This is the display half of the same rule, and it is
   * not redundant — one preparation runs per site at a time, so a request that
   * names a link can be joined to a batch job already running for that site.
   * What comes back is then wider than what was asked for, and only the named
   * link may be put in front of the operator as their review.
   */
  const focus = useMemo(() => {
    if (!preparation || focusSuggestionId === null) return null;
    return {
      suggestionId: focusSuggestionId,
      // A link belongs to one source article, so this matches at most one plan.
      plans: preparation.plans.filter((plan) =>
        plan.links.some((link) => link.suggestion_id === focusSuggestionId),
      ),
    };
  }, [focusSuggestionId, preparation]);
  /**
   * The named link is in the result, so the review is about it. When it is not
   * — its article could not be read, the link was already published, or it lost
   * a reciprocal pair — whatever did come back is shown, with the reason said
   * out loud. An empty page claiming to be about a link explains nothing.
   */
  const focused = focus && focus.plans.length > 0 ? focus : null;
  const reviewData =
    preparation && focused
      ? // `has_more` and the per-article errors describe articles this view is
        // not offering, so they are not this review's business.
        { ...preparation, plans: focused.plans, errors: [], has_more: false }
      : preparation;
  const visiblePlans = reviewData?.plans ?? [];
  const selectedIds =
    (siteId === null ? undefined : ticks.get(batchKey)) ??
    (visiblePlans.length > 0 ? new Set(visiblePlans.map((plan) => plan.id)) : NO_TICKS);

  /**
   * Leave a one-link review for the site's whole batch.
   *
   * Only the address changes. The batch behind it does not exist yet — a
   * narrowed preparation read one article and rendered one link — so this
   * misses the held key and the effect above prepares it. That is a fresh set
   * of live requests, and it is meant to be: the other articles were never
   * read, so there is nothing here to reveal.
   */
  const showAllPlans = () => {
    if (siteId === null) return;
    graphSimulation.reset();
    preparePlans.reset();
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete("suggestion");
        // The job holds the narrowed result. Kept, it would answer for the
        // wider batch this is asking for.
        next.delete("job");
        return next;
      },
      { replace: true },
    );
  };

  const toggleTick = (planId: number) => {
    if (siteId === null) return;
    graphSimulation.reset();
    setTicks((current) => {
      const next = new Set(current.get(batchKey) ?? []);
      if (!next.delete(planId)) next.add(planId);
      return new Map(current).set(batchKey, next);
    });
  };

  const toggleAllTicks = (planIds: number[]) => {
    if (siteId === null) return;
    graphSimulation.reset();
    setTicks((current) => {
      const held = current.get(batchKey) ?? NO_TICKS;
      const all = planIds.length > 0 && planIds.every((id) => held.has(id));
      return new Map(current).set(batchKey, all ? new Set() : new Set(planIds));
    });
  };

  /**
   * Start the job for edits a person has already approved.
   *
   * Separate from approval on purpose: an enqueue that fails must not make the
   * operator agree to the same edits a second time, and this path makes no
   * decision of its own, so retrying it is free.
   */
  const queueApproved = (planIds?: number[]) => {
    if (siteId === null || busy) return;
    setNotice(null);
    queuePlans.mutate(
      { siteId, planIds },
      {
        onSuccess: () => {
          setNotQueued(null);
          setQueued(true);
          // These plans are now the job's, not the review's. Retaining the
          // preparation would hand a returning operator an approve button for
          // work already on its way to the site.
          forget(batchKey);
          graphSimulation.reset();
          setNotice({ message: "Publish queued for the approved edits.", tone: "info" });
        },
        onError: (error) => {
          setNotQueued({ planIds });
          setNotice({
            message: isConflict(error)
              ? "This site is already publishing, or has no approved edits left to queue."
              : "These edits stay approved, but the publish job could not be started. Queue them again.",
            tone: "error",
          });
        },
      },
    );
  };

  /**
   * The one human decision: bind this operator to exactly the plans they ticked.
   *
   * Only those plans and their hashes are sent. `has_more`, the per-article
   * errors, and any article the operator unticked all describe work that is
   * *not* in this request, so a batch can never grow between what was read and
   * what was agreed to.
   */
  const approveAndQueue = (plans: PublicationPlan[]) => {
    if (siteId === null || busy || plans.length === 0) return;
    setNotice(null);
    approvePlans.mutate(
      {
        siteId,
        plans: plans.map((plan) => ({ id: plan.id, plan_hash: plan.plan_hash })),
      },
      {
        onSuccess: () => {
          if (activeSite?.platform === "html") {
            setExportReadySiteId(activeSite.id);
            setNotice({
              message: "The exact edits were approved. Download the CSV export when ready.",
              tone: "info",
            });
            void activeSiteQuery.refetch();
            return;
          }
          queueApproved(plans.map((plan) => plan.id));
        },
        onError: (error) => {
          setStale(isConflict(error));
          setNotice({
            message: isConflict(error)
              ? "These edits changed since they were prepared, so nothing was approved. Reload the review and look at the new version."
              : "The approval could not be saved, so nothing was published.",
            tone: "error",
          });
        },
      },
    );
  };

  /**
   * Two independent facts about the site being reviewed.
   *
   * Selected suggestions are new editorial intent: they need a preparation, a
   * reading and an approval. Approved plans are exact edits a person already
   * agreed to — they live in the database, they survive this browser, and they
   * need only a job. A reload remembers neither, so both come from the server.
   */
  const newWork = (activeSite?.selectedSuggestions ?? 0) > 0;
  const approvedWaiting = activeSite?.approvedPlans ?? 0;
  const htmlApproved =
    activeSite?.platform === "html" &&
    (exportReadySiteId === activeSite.id || approvedWaiting > 0);
  /** Whether there is a batch on this page to read, approve, or retry. */
  const inReview =
    newWork ||
    preparation !== undefined ||
    preparing === siteId ||
    prepareFailed === siteId;
  /**
   * The reload-safe queue action.
   *
   * `notQueued` is this browser's memory of the exact subset it just approved,
   * and naming those ids is the more truthful retry, so it wins. Site-wide
   * recovery is for the session with no such memory: a reload, another browser,
   * or a site-wide attempt that itself failed and still needs a way back.
   */
  const showDurableRecovery = approvedWaiting > 0 && notQueued?.planIds === undefined;

  const loading =
    (siteId === null && pendingQuery.isPending) ||
    (siteId !== null && activeSiteQuery.isPending);
  const failed =
    (siteId === null && pendingQuery.isError) ||
    (siteId !== null && activeSiteQuery.isError);
  const selectedTotal =
    pendingQuery.totalSelectedSuggestions ??
    reviewable.reduce((total, site) => total + site.selectedSuggestions, 0);
  const waitingSiteTotal = pendingQuery.totalSites ?? reviewable.length;

  return (
    <>
      <PageHeader
        title="Approve exact edits"
        sub={
          siteId === null
            ? `${formatCount(selectedTotal)} selected ${
                selectedTotal === 1 ? "link" : "links"
              } across ${plural(waitingSiteTotal, "site")} · nothing is live until you approve it`
            : `${activeSite ? activeSite.name : `site ${siteId}`} · every change is shown before it is approved`
        }
        actions={
          <>
            {/* Without this the only way back to the other sites is the rail,
                which reads as leaving the task rather than stepping up in it. */}
            {siteId !== null && waitingSiteTotal > 1 && (
              <Link to="/publish" className="btn btn-outline btn-sm">
                All sites waiting
              </Link>
            )}
            <QueueLink className="btn btn-outline btn-sm">
              Back to the queue
            </QueueLink>
          </>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5 lg:px-8 lg:py-6">
        <div className="mb-5">
          <FlowSteps current={2} />
        </div>

        {notice && <Notice notice={notice} onDismiss={() => setNotice(null)} />}

        {stale && (
          <div
            role="alert"
            className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-error/30 bg-error/5 px-4 py-3 text-caption text-error-ink"
          >
            <span className="min-w-0 flex-1">
              Nothing was approved. Read the new version of these edits before you approve them.
            </span>
            <button
              type="button"
              onClick={reload}
              className="btn btn-outline btn-sm border-error/40 bg-surface-card text-error-ink hover:border-error"
            >
              Reload the review
            </button>
          </div>
        )}

        {loading && <SkeletonRows count={3} label="Loading the sites waiting for review" />}

        {!loading && failed && (
          <ErrorPanel
            title="The review could not be loaded"
            description="LinkMesh could not reach the engine, so this page is not showing your real work."
            onRetry={() => {
              void pendingQuery.refetch();
              if (siteId !== null) void activeSiteQuery.refetch();
            }}
            retrying={pendingQuery.isFetching || activeSiteQuery.isFetching}
          />
        )}

        {!loading && !failed && siteId === null && (
          <SiteIndex
            sites={reviewable}
            // Keyed by site *and* scope; the badge is about the site.
            prepared={new Set([...prepared.keys()].map((key) => Number(key.split(":")[0])))}
            search={siteSearch}
            onSearch={setSiteSearch}
            hasMore={Boolean(pendingQuery.hasNextPage)}
            loadingMore={pendingQuery.isFetchingNextPage}
            onLoadMore={() => void pendingQuery.fetchNextPage()}
            onExport={downloadExport}
            exportingSiteId={exportingSiteId}
          />
        )}

        {/* Queueing consumes the batch, so the site drops out of the pending
            list the moment the job starts. The confirmation is what the
            operator is reading at that instant, and it must not be replaced by
            "this site has nothing waiting" one refetch later. */}
        {!loading && !failed && siteId !== null && queued && (
          <div className="card px-5 py-8 text-center">
            <div className="text-body-md font-medium text-ink">The publish job is queued</div>
            <p className="mx-auto mt-2 max-w-md text-caption leading-normal text-body">
              The approved edits are with the worker now. The queue shows each link as Publishing,
              then as Published.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <Link to="/queue?status=applying" className="btn btn-primary">
                View publishing links
              </Link>
              <Link to="/publish" className="btn btn-outline">
                Review another site
              </Link>
            </div>
          </div>
        )}

        {!loading && !failed && !queued && siteId !== null && !activeSite && (
          <EmptyPanel>
            This site has no links waiting for review.{" "}
            <button
              type="button"
              onClick={() => navigate("/publish")}
              className="font-medium text-ink underline underline-offset-2 hover:text-primary"
            >
              Choose another site
            </button>
            .
          </EmptyPanel>
        )}

        {!loading && !failed && !queued && activeSite && !canPrepare && (
          <EmptyPanel>
            {activeSite.platform === "html"
              ? `${activeSite.name} cannot prepare exact edits right now.`
              : `${activeSite.name} has no WordPress account connected, so the exact edits cannot be prepared. Add the account on the Sites page.`}
          </EmptyPanel>
        )}

        {!loading && !failed && !queued && htmlApproved && activeSite && (
          <div className="card mb-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-4 sm:px-5">
            <div className="min-w-0 flex-1">
              <div className="text-body-sm font-medium text-ink">
                Approved exact edits are ready for export
              </div>
              <p className="mt-1 max-w-prose text-caption leading-normal text-muted">
                Download the approved CSV and apply these exact edits in the site’s own publishing
                system. LinkMesh does not write to static HTML sites.
              </p>
            </div>
            <button
              type="button"
              onClick={() => downloadExport(activeSite.id)}
              disabled={exportingSiteId !== null}
              className="btn btn-primary flex-none"
            >
              {exportingSiteId === activeSite.id ? "Exporting…" : "Download approved CSV"}
            </button>
          </div>
        )}

        {/* Approved plans are durable, so this action cannot depend on what
            this browser happens to remember. It is the only thing an
            approved-only site needs, and on a mixed site it stands apart from
            the batch below rather than sweeping it in. */}
        {!loading && !failed && !queued && activeSite?.canPublish && showDurableRecovery && (
          <div className="card mb-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-4 sm:px-5">
            <div className="min-w-0 flex-1">
              <div className="text-body-sm font-medium text-ink">
                {plural(approvedWaiting, "exact edit")} already approved and waiting to be queued
              </div>
              <p className="mt-1 max-w-prose text-caption leading-normal text-muted">
                {newWork
                  ? "Queueing publishes only those approved edits. The newly selected links below are separate work: they still have to be prepared, read and approved."
                  : "Somebody already read and approved these, so nothing is prepared again. They go live when the publish job runs."}
              </p>
            </div>
            <button
              type="button"
              onClick={() => queueApproved()}
              disabled={busy}
              className="btn btn-primary flex-none"
            >
              {busy ? "Queueing…" : "Queue approved exact edits"}
            </button>
          </div>
        )}

        {!loading &&
          !failed &&
          !queued &&
          activeSite !== null &&
          canPrepare &&
          inReview &&
          !htmlApproved && (
          <PublicationReview
            siteId={activeSite.id}
            siteName={activeSite.name}
            data={reviewData}
            focus={
              focused
                ? { suggestionId: focused.suggestionId, onShowAll: showAllPlans }
                : null
            }
            focusMissing={focus !== null && focused === null}
            loading={
              preparation === undefined &&
              (preparing === siteId || preparePlans.isPending)
            }
            progress={preparePlans.progress}
            error={
              (preparePlans.isError || prepareFailed === siteId) &&
              preparation === undefined
            }
            busy={busy || removing !== null}
            approvedNotQueued={notQueued !== null && !showDurableRecovery}
            selectedIds={selectedIds}
            onToggle={toggleTick}
            onToggleAll={toggleAllTicks}
            removingSuggestionId={removing}
            onRemoveLink={removeLink}
            onRetry={reload}
            onApproveAndQueue={approveAndQueue}
            onQueueOnly={() => queueApproved(notQueued?.planIds)}
            readOnlyExport={activeSite?.platform === "html"}
            simulation={graphSimulation.data}
            simulationLoading={graphSimulation.isPending}
            simulationError={graphSimulation.isError}
            onSimulate={(suggestionIds) =>
              graphSimulation.mutate({ siteId: activeSite.id, suggestionIds })
            }
          />
        )}
      </div>
    </>
  );
}

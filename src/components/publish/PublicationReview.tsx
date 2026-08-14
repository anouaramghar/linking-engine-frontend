import { useEffect, useMemo, useRef, useState } from "react";

import {
  PREPARE_MAX_ARTICLES,
  getPublicationPlanHtml,
  type PlanLink,
  type PublicationPlan,
  type PublicationPreparation,
} from "../../api/publish";
import type { GraphSimulation } from "../../types/graph";
import Highlighted from "../Highlighted";
import LogoLoadingAnimation from "../LogoLoadingAnimation";
import SelectionControl from "../SelectionControl";
import HtmlDiff from "./HtmlDiff";

interface Props {
  siteId: number;
  siteName: string;
  data: PublicationPreparation | undefined;
  /**
   * Set when the address names one link, so `data` carries only that link's
   * source article. The counts here are about the rest of the prepared batch,
   * which is still on the server and one button away.
   */
  focus?: {
    suggestionId: number;
    onShowAll: () => void;
  } | null;
  /** The named link is not in this batch, so every prepared article is shown. */
  focusMissing?: boolean;
  loading: boolean;
  progress?: Record<string, unknown> | null;
  error: boolean;
  /** Static HTML sites can approve exact edits, but queue them as an export. */
  readOnlyExport?: boolean;
  /** True while approval or queueing is in flight. */
  busy: boolean;
  /**
   * Set when a previous attempt approved the edits but could not start the job.
   * The approval stands; only the queueing needs retrying, and asking for the
   * approval again would be asking the operator to agree to the same edits twice.
   */
  approvedNotQueued: boolean;
  /**
   * Plan ids this approval will name. Owned by the page, which holds one set per
   * site so that walking to another site and back does not discard the reading
   * the operator already did.
   */
  selectedIds: Set<number>;
  onToggle: (planId: number) => void;
  onToggleAll: (planIds: number[]) => void;
  /** Suggestion whose removal is in flight, if any. */
  removingSuggestionId: number | null;
  onRemoveLink: (suggestionId: number) => void;
  onRetry: () => void;
  /** Exactly the plans whose boxes are ticked — never the whole batch. */
  onApproveAndQueue: (plans: PublicationPlan[]) => void;
  onQueueOnly: () => void;
  simulation?: GraphSimulation;
  simulationLoading: boolean;
  simulationError: boolean;
  onSimulate: (suggestionIds: number[]) => void;
}

const outcomeLabel = {
  inserted: "In text",
  block: "Read also block",
  already_present: "Already present",
} as const;

const plural = (count: number, word: string) =>
  `${count} ${count === 1 ? word : `${word}s`}`;

/**
 * A link the article already carries writes nothing when the job runs. Counting
 * it as an edit would tell the operator more will change than actually will.
 */
const isWrite = (link: PlanLink) => link.outcome !== "already_present";

/** Words for a change whose passage could not be located in the stored HTML. */
const fallbackCopy = (link: PlanLink) => {
  if (link.outcome === "already_present") {
    return "The article already links here, so nothing is written for this one.";
  }
  if (link.outcome === "block") {
    return `${link.target_url} is added to the read-also block at the end of the article.`;
  }
  return `A link to ${link.target_url} is added${
    link.anchor_text ? ` on "${link.anchor_text}"` : ""
  }.`;
};

/** One number and what it counts. */
function Stat({
  value,
  label,
  muted = false,
}: {
  value: number;
  label: string;
  muted?: boolean;
}) {
  return (
    <div className="min-w-[92px]">
      <div
        className={`font-serif text-display-sm leading-none ${
          muted ? "text-muted" : "text-ink"
        }`}
      >
        {value}
      </div>
      <div className="mt-1.5 text-caption-sm text-muted">{label}</div>
    </div>
  );
}

/**
 * One link and the sentence it lands in.
 *
 * The passage comes out of the stored `updated_html`, so what is read here is
 * the artifact the approval names, not a second rendering that could disagree
 * with it. For an in-text link the words do not change at all; only the markup
 * does, which is why this marks the anchor rather than showing two versions of
 * one identical sentence.
 *
 * The link is printed once. It used to appear in a summary list and again in
 * the change panel below it, so an article said everything twice.
 */
function LinkRow({
  plan,
  link,
  open,
  disabled,
  removing,
  onRemove,
}: {
  plan: PublicationPlan;
  link: PlanLink;
  open: boolean;
  disabled: boolean;
  removing: boolean;
  onRemove: () => void;
}) {
  const passage = useMemo(() => {
    if (link.outcome === "already_present" || !link.placement_context || !link.anchor_text) {
      return null;
    }
    return link.placement_context.includes(link.anchor_text)
      ? { text: link.placement_context, anchor: link.anchor_text }
      : null;
  }, [link.anchor_text, link.outcome, link.placement_context]);
  const writes = isWrite(link);

  return (
    <li
      className={`rounded-lg border border-hairline px-3 py-3 ${
        writes ? "bg-canvas-soft" : "bg-surface-strong"
      }`}
    >
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="badge">{outcomeLabel[link.outcome]}</span>
            <span className="min-w-0 break-all text-caption text-body">{link.target_url}</span>
          </div>
          {!open && writes && link.anchor_text && (
            <p className="mt-1.5 text-caption text-muted">on “{link.anchor_text}”</p>
          )}
        </div>
        {/* One wrong link out of four used to cost a trip back to the queue and
            a second preparation of the whole batch. Held at the same right edge
            on every row, so it never lands where the eye is reading. */}
        <button
          type="button"
          onClick={onRemove}
          disabled={disabled}
          aria-label={`Remove the link to ${link.target_url} from ${plan.source_url} and return it to the queue`}
          className="btn btn-text btn-sm flex-none disabled:text-muted-soft"
        >
          {removing ? "Removing…" : "Remove"}
        </button>
      </div>

      {open && passage ? (
        <>
          <blockquote className="mt-3 border-l-2 border-hairline-strong pl-3 text-body-sm leading-normal text-body">
            <Highlighted context={passage.text} anchor={passage.anchor} />
          </blockquote>
          <p className="mt-2 text-caption-sm leading-normal text-muted">
            {link.outcome === "block"
              ? "This entry is added at the end of the article."
              : "The marked words become the link. The wording of the article does not change."}
          </p>
        </>
      ) : open ? (
        <p className="mt-3 text-caption leading-normal text-body">{fallbackCopy(link)}</p>
      ) : null}
    </li>
  );
}

function ExactHtml({ siteId, planId }: { siteId: number; planId: number }) {
  const [html, setHtml] = useState<Awaited<ReturnType<typeof getPublicationPlanHtml>>>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const load = () => {
    if (html || loading) return;
    setLoading(true);
    setError(false);
    void getPublicationPlanHtml(siteId, planId)
      .then(setHtml)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  };

  return (
    <details
      className="mt-3 sm:pl-8"
      onToggle={(event) => event.currentTarget.open && load()}
    >
      <summary
        aria-label="View exact HTML (advanced)"
        title="View exact HTML (advanced)"
        className="touch-target ml-auto flex h-11 w-11 cursor-pointer items-center justify-center rounded-md border border-hairline-control bg-surface-card text-ink shadow-soft transition-colors hover:border-ink hover:bg-surface-strong sm:h-10 sm:w-10"
      >
        <svg
          aria-hidden="true"
          className="h-5 w-5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="m8 8-4 4 4 4" />
          <path d="m16 8 4 4-4 4" />
          <path d="m14 5-4 14" />
        </svg>
      </summary>
      {loading && (
        <div role="status" className="mt-3 text-caption text-muted">
          Loading exact HTML…
        </div>
      )}
      {error && (
        <div role="alert" className="mt-3 text-caption text-error-ink">
          The exact HTML could not be loaded. Close and open this section to retry.
        </div>
      )}
      {html && <HtmlDiff original={html.original_html} updated={html.updated_html} />}
    </details>
  );
}

/**
 * Steps 2 and 3 of the review flow, for one site.
 *
 * This used to be a dialog stacked on the queue. It is a page now, because it is
 * the step that writes to a customer's site: it deserves an address that can be
 * reloaded and shared, it must not be dismissable by a stray click on a
 * backdrop, and its failures have to be readable — a page notice behind a modal
 * is a failure the operator never sees.
 */
export default function PublicationReview({
  siteId,
  siteName,
  data,
  focus = null,
  focusMissing = false,
  loading,
  progress,
  error,
  readOnlyExport = false,
  busy,
  approvedNotQueued,
  selectedIds,
  onToggle,
  onToggleAll,
  removingSuggestionId,
  onRemoveLink,
  onRetry,
  onApproveAndQueue,
  onQueueOnly,
  simulation,
  simulationLoading,
  simulationError,
  onSimulate,
}: Props) {
  const plans = data?.plans ?? [];
  const planIds = plans.map((plan) => plan.id);
  const allLinks = plans.flatMap((plan) => plan.links);
  const preparedWrites = allLinks.filter(isWrite).length;
  const preparedPresent = allLinks.length - preparedWrites;

  const selectedPlans = plans.filter((plan) => selectedIds.has(plan.id));
  const selectedLinks = selectedPlans.flatMap((plan) => plan.links);
  const writeCount = selectedLinks.filter(isWrite).length;
  const presentCount = selectedLinks.length - writeCount;
  const excludedCount = plans.length - selectedPlans.length;

  /**
   * Links that ride along with a one-link review.
   *
   * A plan's hash covers the whole article, so approving the article approves
   * every prepared link in it. The operator asked about one link and must be
   * told, in the same breath, what else goes live with it.
   */
  const ridingLinks = focus
    ? allLinks.filter((link) => link.suggestion_id !== focus.suggestionId).length
    : 0;
  /**
   * Selected links on this site that this review does not cover.
   *
   * `selected_suggestions` is counted site-wide before anything is rendered, so
   * subtracting what is on screen is the whole remainder — the siblings in this
   * article, and every other article waiting. They keep waiting; a narrowed
   * preparation never read them.
   */
  const otherSelected = data
    ? Math.max(0, data.selected_suggestions - allLinks.length)
    : 0;

  const allSelected = plans.length > 0 && selectedPlans.length === plans.length;
  const someSelected = selectedPlans.length > 0 && !allSelected;
  const selectAllRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someSelected;
  }, [someSelected]);

  /**
   * Articles start unread. An explicit open is the review action; merely
   * rendering a prepared artifact does not prove that an operator saw it.
   * Closing an opened article only tidies the page and deliberately keeps the
   * reviewed state.
   */
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const [opened, setOpened] = useState<Set<number>>(() => new Set());
  const isExpanded = (planId: number) => expanded[planId] ?? false;
  const isRead = (planId: number) => opened.has(planId);

  const openPlan = (planId: number, scroll = false) => {
    setExpanded((current) => ({ ...current, [planId]: true }));
    setOpened((current) => (current.has(planId) ? current : new Set(current).add(planId)));
    if (scroll) {
      document.getElementById(`publication-plan-${planId}`)?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  };

  const toggleExpanded = (planId: number) => {
    if (isExpanded(planId)) {
      setExpanded((current) => ({ ...current, [planId]: false }));
      return;
    }
    openPlan(planId);
  };

  /** Unticking an unread article removes it from the review requirement. */
  const unread = selectedPlans.filter((plan) => !isRead(plan.id));
  const nextUnread = unread[0];
  const showNextUnread = () => {
    if (nextUnread) openPlan(nextUnread.id, true);
  };

  return (
    <section aria-label="Exact edit review">
      {loading && (
        // One request covers the whole batch, so there is no per-article
        // progress to report. What can be said truthfully is what it is doing
        // and how much of it there is.
        <div role="status" className="flex flex-col items-center gap-3 py-12 text-center">
          <LogoLoadingAnimation size="lg" className="text-primary" label="Preparing the exact edits" />
          <div className="text-body-sm text-body">
            {typeof progress?.completed === "number" && typeof progress?.total === "number"
              ? `Prepared ${progress.completed} of ${progress.total} source articles on ${siteName}.`
              : `Reading up to ${PREPARE_MAX_ARTICLES} source articles on ${siteName}.`}
          </div>
          <p className="max-w-md text-caption leading-normal text-muted">
            Nothing is written while the source articles are read.
          </p>
        </div>
      )}

      {error && !loading && (
        <div role="alert" className="py-8">
          <div className="text-body-md font-medium text-ink">The edits could not be prepared</div>
          <p className="mt-1 max-w-prose text-body-sm text-body">
            No article was changed. Check the WordPress connection, then try again.
          </p>
          <button type="button" onClick={onRetry} className="btn btn-outline mt-4">
            Try again
          </button>
        </div>
      )}

      {data && !loading && (
        <>
          {approvedNotQueued && (
            <div
              role="alert"
              className="mb-4 rounded-lg border border-hairline-strong bg-surface-strong px-4 py-3 text-caption text-body"
            >
              <span className="font-medium text-ink">These edits are approved but not queued.</span>{" "}
              The approval was saved; only the publish job could not be started. Queue it again — you
              will not be asked to approve the same edits twice.
            </div>
          )}

          {/* The operator opened one link from the queue. Say what that means
              before the article, not after it: what else this article carries,
              and how much of the batch is being held back. */}
          {focus && (
            <div className="card mb-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-4 sm:px-5">
              <div className="min-w-0 flex-1">
                <div className="text-body-sm font-medium text-ink">
                  {ridingLinks > 0
                    ? "This review is for one link, and its article carries others"
                    : "This review is for one link"}
                </div>
                <p className="mt-1 max-w-prose text-caption leading-normal text-muted">
                  {ridingLinks > 0
                    ? `Approving this article also publishes ${plural(
                        ridingLinks,
                        "other selected link",
                      )}. `
                    : "Only this link is included in this review. "}
                  {otherSelected > 0 &&
                    `${plural(
                      otherSelected,
                      "selected link",
                    )} on this site ${otherSelected === 1 ? "is" : "are"} outside this review.`}
                </p>
              </div>
              {otherSelected > 0 && (
                <button
                  type="button"
                  onClick={focus.onShowAll}
                  className="btn btn-outline flex-none"
                >
                  Review every selected link
                </button>
              )}
            </div>
          )}

          {/* Silence would leave the operator reading a batch they did not ask
              for, with no idea why their link is not the thing on screen. */}
          {focusMissing && (
            <div
              role="alert"
              className="mb-4 rounded-lg border border-hairline-strong bg-surface-strong px-4 py-3 text-caption leading-normal text-body"
            >
              <span className="font-medium text-ink">
                That link was not prepared.
              </span>{" "}
                Its article could not be read, or it is already published or no longer selected.
                The prepared articles are shown below.
            </div>
          )}

          {/* What was read, before the operator scrolls into the articles. The
              decision itself is counted in the bar at the foot of the page. */}
          <div className="card mb-4 px-4 py-4 sm:px-5">
            <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
              <div className="flex flex-wrap gap-x-8 gap-y-4">
                <Stat
                  value={plans.length}
                  label={focus ? "Article for this link" : "Articles prepared"}
                />
                <Stat
                  value={preparedWrites}
                  label={preparedWrites === 1 ? "Link to write" : "Links to write"}
                />
                {preparedPresent > 0 && (
                  <Stat value={preparedPresent} label="Already present" muted />
                )}
              </div>
            </div>

            {plans.length > 1 && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-hairline pt-3">
                <label className="touch-target flex cursor-pointer items-center gap-3">
                  <SelectionControl
                    inputRef={selectAllRef}
                    label="Select all prepared articles"
                    checked={allSelected}
                    indeterminate={someSelected}
                    onChange={() => onToggleAll(planIds)}
                  />
                  <span className="text-caption font-medium text-ink">Select all articles</span>
                </label>
                <span className="text-caption text-muted" aria-live="polite">
                  {selectedPlans.length} of {plans.length} selected
                </span>
              </div>
            )}

            {plans.length > 0 && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-hairline pt-3">
                <p className="max-w-2xl text-caption leading-normal text-body">
                  Every selected article's exact change has to be read before it can be approved.
                  Open the ones still closed, or untick an article to leave it for later.
                </p>
                <span className="text-caption text-muted" aria-live="polite">
                  {selectedPlans.length - unread.length} of {selectedPlans.length} read
                </span>
              </div>
            )}

            {selectedLinks.length > 0 && (
              <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-hairline pt-3">
                <div className="min-w-0">
                  <div className="text-caption font-medium text-ink">Check site structure</div>
                  <p className="mt-1 max-w-2xl text-caption-sm leading-normal text-muted">
                    Preview orphan, underlinked, hub, and concentration changes before this
                    batch is approved. This is read-only and does not publish anything.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onSimulate(selectedLinks.map((link) => link.suggestion_id))}
                  disabled={busy || simulationLoading}
                  className="btn btn-outline flex-none"
                >
                  {simulationLoading ? "Simulating…" : "Simulate structure"}
                </button>
              </div>
            )}

            {simulationError && (
              <div role="alert" className="mt-3 text-caption text-error-ink">
                The structural simulation could not be loaded. The exact edit review is still
                available.
              </div>
            )}

            {simulation && (
              <div className="mt-3 rounded-lg border border-hairline-strong bg-canvas-soft px-3 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="text-caption font-medium text-ink">Structural preview</div>
                  <div className="text-caption-sm text-muted">
                    {simulation.applied_suggestion_ids.length} new internal links modeled
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-3 text-caption-sm sm:grid-cols-4">
                  <div>
                    <div className="text-muted">Orphans</div>
                    <div className="font-medium text-body">
                      {simulation.before.orphan_count} → {simulation.after.orphan_count}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted">Underlinked</div>
                    <div className="font-medium text-body">
                      {simulation.before.underlinked_count} → {simulation.after.underlinked_count}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted">Links</div>
                    <div className="font-medium text-body">
                      {simulation.before.active_links} → {simulation.after.active_links}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted">Top-target share</div>
                    <div className="font-medium text-body">
                      {Math.round(simulation.target_concentration * 100)}%
                    </div>
                  </div>
                </div>
                {simulation.warnings.length > 0 && (
                  <ul className="mt-3 list-disc space-y-1 pl-5 text-caption-sm text-body">
                    {simulation.warnings.map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          {(data.has_more || data.errors.length > 0) && (
            <div className="card mb-4 px-4 py-4 text-caption leading-normal text-body sm:px-5">
              {data.has_more && (
                <p>
                  Only the first {PREPARE_MAX_ARTICLES} source articles are prepared here. The rest
                  are untouched — prepare and approve them in a following batch.
                </p>
              )}
              {data.errors.length > 0 && (
                <div className={data.has_more ? "mt-3" : undefined} role="alert">
                  <div className="font-medium text-ink">
                    {data.errors.length} source{" "}
                    {data.errors.length === 1 ? "article was" : "articles were"} left out of this
                    batch
                  </div>
                  <ul className="mt-1 list-disc space-y-1 pl-5">
                    {data.errors.map((item) => (
                      <li key={item.source_article_id} className="break-words">
                        {item.source_url || `Article ${item.source_article_id}`}: {item.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {plans.length === 0 && data.errors.length === 0 ? (
            <div className="py-10 text-center text-body-sm text-muted">
              There are no edits ready to approve.
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {plans.map((plan) => {
                const selected = selectedIds.has(plan.id);
                const open = isExpanded(plan.id);
                return (
                  <section
                    key={plan.id}
                    id={`publication-plan-${plan.id}`}
                    className={`card scroll-mt-4 px-4 py-4 transition-colors sm:px-5 ${
                      selected ? "border-ink" : ""
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                      <label className="touch-target flex min-w-0 flex-1 cursor-pointer items-start gap-3">
                        <span className="flex h-6 items-center">
                          <SelectionControl
                            label={`Include the edit to ${plan.source_url} in approval`}
                            checked={selected}
                            onChange={() => onToggle(plan.id)}
                          />
                        </span>
                        <span className="min-w-0">
                          <span className="eyebrow">Source article</span>
                          <h3 className="mt-1 min-w-0 break-words text-body-md font-medium text-ink">
                            {plan.source_url}
                          </h3>
                        </span>
                      </label>
                      <span className="flex-none text-caption text-muted">
                        {plural(plan.links.length, "link")}
                      </span>
                    </div>

                    <ul className="mt-3 flex flex-col gap-2 sm:pl-8">
                      {plan.links.map((link) => (
                        <LinkRow
                          key={link.suggestion_id}
                          plan={plan}
                          link={link}
                          open={open}
                          disabled={busy || removingSuggestionId !== null}
                          removing={removingSuggestionId === link.suggestion_id}
                          onRemove={() => onRemoveLink(link.suggestion_id)}
                        />
                      ))}
                    </ul>

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 sm:pl-8">
                      <button
                        type="button"
                        onClick={() => toggleExpanded(plan.id)}
                        aria-expanded={open}
                        className="touch-target inline-flex items-center text-caption font-medium text-ink underline underline-offset-2 hover:text-primary"
                      >
                        {open ? "Hide the change" : "Show the change"}
                      </button>
                      <span className="text-caption-sm text-muted">
                        {!selected
                          ? "Excluded from this approval"
                          : isRead(plan.id)
                            ? "Exact artifact reviewed"
                            : "Not read yet"}
                      </span>
                    </div>

                    <ExactHtml siteId={siteId} planId={plan.id} />
                  </section>
                );
              })}
            </div>
          )}

          {/* The same raised tray the site list uses for a batch action, and for
              the same reason: a sticky bar needs a ground of its own. On
              {colors.canvas-soft} with no stacking order it wore the page's own
              ground, so the article cards scrolled over the top of it and the
              approve button sat on nothing. `bottom-3` also keeps the primary
              action off the very corner of the viewport, where the scrollbar
              and the operating system's own overlays live. */}
          <div
            id="approval-actions"
            className="sticky bottom-3 z-10 mt-4 scroll-mt-4 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl border border-hairline-strong bg-surface-card px-4 py-3 shadow-lift sm:px-5"
          >
            {/* What is about to be published, and the button that publishes it,
                read as one group. Held at the two ends of a full-width bar they
                stood far apart on a wide window, and the button sat in the
                corner the scrollbar and the desktop overlays own. */}
            <div className="min-w-0 text-caption" aria-live="polite">
              <div className="font-medium text-ink">
                {plural(selectedPlans.length, "article")} · {plural(writeCount, "link")} to write
                {presentCount > 0 && ` · ${presentCount} already present`}
              </div>
              {/* An unticked article is otherwise silent: the operator sees no
                  trace of the decision they just made not to publish it. */}
              <div className="text-muted">
                {unread.length > 0
                  ? `${plural(unread.length, "article")} still to read before this can be approved.`
                  : excludedCount > 0
                  ? `${excludedCount} ${
                      excludedCount === 1 ? "article stays" : "articles stay"
                    } unpublished and can be reviewed later.`
                  : "All selected changes are reviewed above."}
              </div>
            </div>
            {approvedNotQueued ? (
              <button
                type="button"
                onClick={onQueueOnly}
                disabled={busy}
                className="btn btn-primary flex-none"
              >
                {busy ? "Queueing…" : "Queue approved edits"}
              </button>
            ) : unread.length > 0 ? (
              <button
                type="button"
                onClick={showNextUnread}
                disabled={busy}
                className="btn btn-primary flex-none"
              >
                Read the next change
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onApproveAndQueue(selectedPlans)}
                disabled={busy || selectedPlans.length === 0}
                className="btn btn-primary flex-none"
              >
                {busy
                  ? "Approving…"
                  : readOnlyExport
                    ? `Approve ${plural(selectedPlans.length, "exact edit")} for CSV export`
                    : `Approve and queue ${plural(selectedPlans.length, "exact edit")}`}
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}

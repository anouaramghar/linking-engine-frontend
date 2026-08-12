import { useEffect, useMemo, useRef, useState } from "react";

import {
  PREPARE_MAX_ARTICLES,
  getPublicationPlanHtml,
  type PlanLink,
  type PublicationPlan,
  type PublicationPreparation,
} from "../../api/publish";
import Highlighted from "../Highlighted";
import LogoLoadingAnimation from "../LogoLoadingAnimation";
import SelectionControl from "../SelectionControl";

interface Props {
  siteId: number;
  siteName: string;
  data: PublicationPreparation | undefined;
  loading: boolean;
  progress?: Record<string, unknown> | null;
  error: boolean;
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
 * One link, and — once the article is open — the sentence it lands in.
 *
 * The passage comes out of the stored `updated_html`, so what is read here is
 * the artifact the approval names, not a second rendering that could disagree
 * with it. For an in-text link the words do not change at all; only the markup
 * does, which is why this marks the anchor rather than showing two versions of
 * one identical sentence.
 *
 * The link is printed once. It used to appear in a summary list and again in
 * the change panel below it, so an open article said everything twice.
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

      {open &&
        (passage ? (
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
        ) : (
          <p className="mt-3 text-caption leading-normal text-body">{fallbackCopy(link)}</p>
        ))}
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
      <summary className="touch-target inline-flex cursor-pointer items-center text-caption font-medium text-ink underline underline-offset-2">
        View exact HTML (advanced)
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
      {html && (
        <div className="mt-3 grid min-w-0 gap-3 lg:grid-cols-2">
          {[
            ["Before approval", html.original_html],
            ["After approval", html.updated_html],
          ].map(([label, value]) => (
            <div key={label} className="min-w-0">
              <div className="mb-1 text-caption font-medium text-ink">{label}</div>
              <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-md border border-hairline bg-canvas-soft p-3 text-caption leading-normal text-body">
                {value}
              </pre>
            </div>
          ))}
        </div>
      )}
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
  loading,
  progress,
  error,
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

  const allSelected = plans.length > 0 && selectedPlans.length === plans.length;
  const someSelected = selectedPlans.length > 0 && !allSelected;
  const selectAllRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someSelected;
  }, [someSelected]);

  /**
   * Which articles are showing their change. Every article starts closed: an
   * article that opened itself was never read on purpose, and a batch of ten
   * with every change open is a page nobody scrolls to the end of.
   */
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const isExpanded = (planId: number) => expanded[planId] ?? false;

  /**
   * Articles whose change has been on screen at least once.
   *
   * Reviewing used to be "strongly recommended, but optional", with a Skip
   * review link straight to the button. The team lead ruled the other way on
   * 2026-08-11: reviewing the edit is mandatory. So the approval stays out of
   * reach until every ticked article's change has been opened by an explicit
   * act of the operator. Where an article sits in the batch says nothing about
   * whether anybody read it, so position never enters this set.
   *
   * Recorded when the change is opened rather than derived from what is open
   * now: closing a change you have read is tidying up, not unreading it.
   */
  const [opened, setOpened] = useState<Set<number>>(() => new Set());
  const isRead = (planId: number) => opened.has(planId);

  const open = (planId: number) => {
    setExpanded((current) => ({ ...current, [planId]: true }));
    setOpened((current) => (current.has(planId) ? current : new Set(current).add(planId)));
  };

  const toggleExpanded = (planId: number) => {
    if (isExpanded(planId)) {
      setExpanded((current) => ({ ...current, [planId]: false }));
      return;
    }
    open(planId);
  };

  /**
   * Ticked articles nobody has opened. Unticking an unread article drops it
   * from this list — that is a decision not to publish it, not a shortcut —
   * and reticking it puts the reading requirement straight back.
   */
  const unread = selectedPlans.filter((plan) => !isRead(plan.id));
  const nextUnread = unread[0];

  /** Open the next unread change and put it under the operator's eyes. */
  const showNextUnread = () => {
    if (!nextUnread) return;
    open(nextUnread.id);
    document
      .getElementById(`publication-plan-${nextUnread.id}`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
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
            Each article is one request to the live site, so this can take a minute. Nothing is
            written while it runs.
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

          {/* What was read, before the operator scrolls into the articles. The
              decision itself is counted in the bar at the foot of the page. */}
          <div className="card mb-4 px-4 py-4 sm:px-5">
            <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
              <div className="flex flex-wrap gap-x-8 gap-y-4">
                <Stat value={plans.length} label="Articles prepared" />
                <Stat
                  value={preparedWrites}
                  label={preparedWrites === 1 ? "Link to write" : "Links to write"}
                />
                {preparedPresent > 0 && (
                  <Stat value={preparedPresent} label="Already present" muted />
                )}
              </div>
              <p className="max-w-xs text-caption leading-normal text-muted sm:text-right">
                Read from {siteName}. Nothing is live until you approve it.
              </p>
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
                  Every selected article's change has to be{" "}
                  <span className="font-medium text-ink">read before it can be approved</span>.
                  Open the ones still closed, or untick an article to leave it for later.
                </p>
                <span className="text-caption text-muted" aria-live="polite">
                  {selectedPlans.length - unread.length} of {selectedPlans.length} read
                </span>
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
                      {/* Says which articles are still holding the approval
                          back, on the article itself rather than only in the
                          count at the top of the page. */}
                      <span className="text-caption-sm text-muted">
                        {!selected
                          ? "Excluded from this approval"
                          : isRead(plan.id)
                            ? "Exact artifact verified"
                            : "Not read yet"}
                      </span>
                    </div>

                    {open && <ExactHtml siteId={siteId} planId={plan.id} />}
                  </section>
                );
              })}
            </div>
          )}

          <div
            id="approval-actions"
            className="sticky bottom-0 mt-3 scroll-mt-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-3 border-t border-hairline bg-canvas-soft py-4"
          >
            <div className="min-w-0 flex-1 text-caption" aria-live="polite">
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
                    : "Nothing is live yet."}
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
              /* Not a disabled Approve with a tooltip: the operator is not
                 blocked, they have a step left, and this is the step. */
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
                  : `Approve and queue ${plural(selectedPlans.length, "exact edit")}`}
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}

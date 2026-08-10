import { useEffect, useRef, useState } from "react";

import {
  PREPARE_MAX_ARTICLES,
  type PublicationPlan,
  type PublicationPreparation,
} from "../../api/publish";
import Modal from "../Modal";
import SelectionControl from "../SelectionControl";

interface Props {
  siteName: string;
  siteOptions?: {
    id: number;
    name: string;
    selectedSuggestions: number;
    approvedPlans: number;
  }[];
  activeSiteId?: number;
  onSiteChange?: (siteId: number) => void;
  data: PublicationPreparation | undefined;
  loading: boolean;
  error: boolean;
  /** True while approval or queueing is in flight. */
  busy: boolean;
  /**
   * Set when a previous attempt approved the edits but could not start the job.
   * The approval stands; only the queueing needs retrying, and asking for the
   * approval again would be asking the operator to agree to the same edits twice.
   */
  approvedNotQueued: boolean;
  onRetry: () => void;
  /** Exactly the plans whose boxes are ticked — never the whole batch. */
  onApproveAndQueue: (plans: PublicationPlan[]) => void;
  onQueueOnly: () => void;
  onClose: () => void;
}

const outcomeLabel = {
  inserted: "In text",
  block: "Read also block",
  already_present: "Already present",
} as const;

const changeCopy = (
  link: PublicationPlan["links"][number],
  afterApproval: boolean,
) => {
  if (link.outcome === "already_present") {
    return afterApproval
      ? "Keep the existing link unchanged."
      : "This link is already present in the article.";
  }
  if (link.outcome === "block") {
    return afterApproval
      ? `Add ${link.target_url} to the read-also block.`
      : "No new read-also entry has been added yet.";
  }
  return afterApproval
    ? `Add a link to ${link.target_url}${link.anchor_text ? ` on "${link.anchor_text}"` : ""}.`
    : "No new in-text link has been added yet.";
};

function ChangeSummary({ plan }: { plan: PublicationPlan }) {
  return (
    <div className="mt-4 rounded-xl border border-hairline bg-canvas-soft p-4">
      <div className="eyebrow">What will change</div>
      <p className="mt-1 text-caption leading-normal text-body">
        The source article stays untouched until these exact edits are approved.
      </p>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div className="rounded-lg bg-surface-card p-3">
          <div className="text-caption font-medium text-muted">Before approval</div>
          <ul className="mt-2 space-y-2 text-caption leading-normal text-body">
            {plan.links.map((link) => (
              <li key={link.suggestion_id}>{changeCopy(link, false)}</li>
            ))}
          </ul>
        </div>
        <div className="rounded-lg bg-surface-card p-3">
          <div className="text-caption font-medium text-ink">After approval</div>
          <ul className="mt-2 space-y-2 text-caption leading-normal text-body">
            {plan.links.map((link) => (
              <li key={link.suggestion_id}>{changeCopy(link, true)}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

export default function PublicationPreviewModal({
  siteName,
  siteOptions,
  activeSiteId,
  onSiteChange,
  data,
  loading,
  error,
  busy,
  approvedNotQueued,
  onRetry,
  onApproveAndQueue,
  onQueueOnly,
  onClose,
}: Props) {
  const plans = data?.plans ?? [];

  /**
   * Which articles this approval will name. Every prepared article starts
   * ticked: the operator already chose this batch by selecting its suggestions
   * and asking for the review, so the boxes are here to *exclude* an article,
   * not to consent to one. Starting empty would put ten clicks in front of the
   * normal case and teach the hand to hit "select all" without reading — which
   * costs more than it protects. Consent is the final button, and what it means
   * is pinned by the hash beside each article.
   */
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  // Re-seed when a different set of plans arrives (first load, or a retry that
  // superseded one). Tracked during render rather than in an effect so the list
  // never paints one frame with the previous batch's ticks.
  const planKey = plans.map((plan) => plan.id).join(",");
  const [seenKey, setSeenKey] = useState<string | null>(null);
  if (data && seenKey !== planKey) {
    setSeenKey(planKey);
    setSelectedIds(new Set(plans.map((plan) => plan.id)));
  }

  const selectedPlans = plans.filter((plan) => selectedIds.has(plan.id));
  const selectedLinks = selectedPlans.flatMap((plan) => plan.links);
  const count = (outcome: string) =>
    selectedLinks.filter((link) => link.outcome === outcome).length;
  const excludedCount = plans.length - selectedPlans.length;

  const allSelected = plans.length > 0 && selectedPlans.length === plans.length;
  const someSelected = selectedPlans.length > 0 && !allSelected;
  const selectAllRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = someSelected;
  }, [someSelected]);

  const toggle = (planId: number) =>
    setSelectedIds((current) => {
      const next = new Set(current);
      if (!next.delete(planId)) next.add(planId);
      return next;
    });

  const toggleAll = () =>
    setSelectedIds(allSelected ? new Set() : new Set(plans.map((plan) => plan.id)));

  return (
    <Modal title="Review exact edits" onClose={onClose} panelClassName="max-w-6xl">
      <div
        aria-label="Publication review progress"
        className="mb-5 flex flex-wrap items-center gap-2 text-caption"
      >
        <span className="rounded-pill bg-surface-strong px-3 py-1.5 text-ink">
          1. Select links
        </span>
        <span aria-hidden="true" className="text-muted">
          &rarr;
        </span>
        <span
          aria-current="step"
          className="rounded-pill bg-primary px-3 py-1.5 font-medium text-on-primary"
        >
          2. Review exact edits
        </span>
        <span aria-hidden="true" className="text-muted">
          &rarr;
        </span>
        <span className="rounded-pill bg-surface-strong px-3 py-1.5 text-muted">
          3. Approve and queue
        </span>
      </div>

      {siteOptions && siteOptions.length > 1 && onSiteChange && (
        <div className="mb-5 border-b border-hairline pb-4">
          <div className="eyebrow mb-2">Review selected links by site</div>
          <div
            role="group"
            aria-label="Sites with selected links"
            className="flex gap-2 overflow-x-auto pb-1"
          >
            {siteOptions.map((site) => (
              <button
                key={site.id}
                type="button"
                aria-pressed={site.id === activeSiteId}
                aria-label={`Review ${site.name}, ${site.selectedSuggestions} selected`}
                onClick={() => onSiteChange(site.id)}
                className={`btn btn-sm flex-none ${
                  site.id === activeSiteId ? "btn-primary" : "btn-outline"
                }`}
              >
                {site.name}
                <span className="text-caption opacity-75">
                  {" "}
                  {site.selectedSuggestions} selected
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mb-5 flex flex-wrap items-end justify-between gap-2 border-b border-hairline pb-4">
        <div>
          <div className="eyebrow">Step 2 of 3</div>
          <div className="mt-1 text-body-md font-medium text-ink">{siteName}</div>
        </div>
        <span className="text-caption text-muted">Nothing is live yet</span>
      </div>

      {loading && (
        <div role="status" className="py-12 text-center text-body-sm text-muted">
          Preparing the exact edits and reading the live WordPress articles…
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

          <div
            className="flex flex-wrap gap-x-5 gap-y-2 border-b border-hairline pb-4 text-caption text-body"
            aria-live="polite"
          >
            <span>
              {selectedPlans.length} {selectedPlans.length === 1 ? "article" : "articles"}
            </span>
            <span>{selectedLinks.length} links</span>
            <span>{count("inserted")} in text</span>
            <span>{count("block")} appended</span>
            <span>{count("already_present")} already present</span>
          </div>

          {(data.has_more || data.errors.length > 0) && (
            <div className="border-b border-hairline py-4 text-caption leading-normal text-body">
              {data.has_more && (
                <p>
                  Only the first {PREPARE_MAX_ARTICLES} source articles are prepared here. The rest
                  are untouched — prepare and approve them in a following batch.
                </p>
              )}
              {data.errors.length > 0 && (
                <div className="mt-2" role="alert">
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
            <>
              {plans.length > 1 && (
                <div className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <label className="touch-target flex cursor-pointer items-center gap-3">
                    <SelectionControl
                      inputRef={selectAllRef}
                      label="Select all prepared articles"
                      checked={allSelected}
                      indeterminate={someSelected}
                      onChange={toggleAll}
                    />
                    <span className="text-caption font-medium text-ink">Select all articles</span>
                  </label>
                  <span className="text-caption text-muted">
                    {selectedPlans.length} of {plans.length} selected
                  </span>
                </div>
              )}

              <div className="flex flex-col gap-2.5">
                {plans.map((plan) => {
                  const selected = selectedIds.has(plan.id);
                  return (
                    <section
                      key={plan.id}
                      className={`card px-4 py-4 transition-colors sm:px-5 ${
                        selected ? "border-ink bg-surface-strong" : ""
                      }`}
                    >
                      <label className="touch-target flex cursor-pointer items-start gap-3">
                        <span className="flex h-6 items-center">
                          <SelectionControl
                            label={`Include the edit to ${plan.source_url} in approval`}
                            checked={selected}
                            onChange={() => toggle(plan.id)}
                          />
                        </span>
                        <h3 className="min-w-0 break-words text-body-md font-medium text-ink">
                          {plan.source_url}
                        </h3>
                      </label>

                      <ul className="mt-2 space-y-1 pl-8 text-caption text-body">
                        {plan.links.map((link) => (
                          <li key={link.suggestion_id} className="flex flex-wrap items-center gap-2">
                            <span className="badge">{outcomeLabel[link.outcome]}</span>
                            <span className="min-w-0 break-all">{link.target_url}</span>
                            {link.outcome === "inserted" && link.anchor_text && (
                              <span>on “{link.anchor_text}”</span>
                            )}
                          </li>
                        ))}
                      </ul>

                      <ChangeSummary plan={plan} />

                      <details className="mt-3 pl-8">
                        <summary className="touch-target inline-flex cursor-pointer items-center text-caption font-medium text-ink underline underline-offset-2">
                          View exact HTML (advanced)
                        </summary>
                        <div className="mt-3 grid min-w-0 gap-3 lg:grid-cols-2">
                          {[
                            ["Before approval", plan.original_html],
                            ["After approval", plan.updated_html],
                          ].map(([label, html]) => (
                            <div key={label} className="min-w-0">
                              <div className="mb-1 text-caption font-medium text-ink">{label}</div>
                              <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-md bg-surface-card p-3 text-caption leading-normal text-body">
                                {html}
                              </pre>
                            </div>
                          ))}
                        </div>
                      </details>

                      {/* The identity an approval actually names. Shown so the row on
                          screen and the row in the audit trail can be tied together. */}
                      <p className="mt-3 pl-8 font-mono text-caption text-muted">
                        Plan {plan.id} · {plan.plan_hash.slice(0, 12)}…
                      </p>
                    </section>
                  );
                })}
              </div>
            </>
          )}

          <div className="sticky bottom-0 mt-2 flex flex-wrap items-center justify-end gap-2 border-t border-hairline bg-canvas-soft pt-4">
            {/* An unticked article is otherwise silent: the operator sees no
                trace of the decision they just made not to publish it. */}
            {excludedCount > 0 && (
              <p className="mr-auto text-caption text-muted" aria-live="polite">
                {excludedCount} {excludedCount === 1 ? "article stays" : "articles stay"} unpublished
                and can be reviewed later.
              </p>
            )}
            <button type="button" onClick={onClose} className="btn btn-outline">
              Close
            </button>
            {approvedNotQueued ? (
              <button
                type="button"
                onClick={onQueueOnly}
                disabled={busy}
                className="btn btn-primary"
              >
                {busy ? "Queueing…" : "Queue approved edits"}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onApproveAndQueue(selectedPlans)}
                disabled={busy || selectedPlans.length === 0}
                className="btn btn-primary"
              >
                {busy
                  ? "Approving…"
                  : `Approve and queue ${selectedLinks.length} exact ${
                      selectedLinks.length === 1 ? "edit" : "edits"
                    }`}
              </button>
            )}
          </div>
        </>
      )}
    </Modal>
  );
}

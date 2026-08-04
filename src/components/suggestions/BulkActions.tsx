import { useEffect, useRef, useState } from "react";

import type { BulkReviewAction } from "../../lib/suggestionReview";

/**
 * How long the field waits before the typed threshold becomes the rule.
 *
 * Each committed value is a fresh query key for two count endpoints, so an
 * uncommitted keystroke used to cost two requests. Long enough to absorb a
 * two-digit number typed at speed, short enough that the counts still feel
 * like they are answering you.
 */
const COMMIT_DELAY_MS = 250;

interface Chip {
  key: string;
  label: string;
  count: number;
}

export interface BulkConfirmation {
  action: BulkReviewAction;
  count: number;
  threshold: number;
  siteLabel: string;
  undoAvailable: boolean;
}

interface Props {
  chips: Chip[];
  active: string;
  onSelect: (key: string) => void;
  threshold: number;
  onThresholdChange: (threshold: number) => void;
  acceptCount: number;
  rejectCount: number;
  /** False when the active status filter shows no pending suggestions to act on. */
  actionable: boolean;
  confirmation: BulkConfirmation | null;
  onRequest: (action: BulkReviewAction) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function BulkActions({
  chips,
  active,
  onSelect,
  threshold,
  onThresholdChange,
  acceptCount,
  rejectCount,
  actionable,
  confirmation,
  onRequest,
  onConfirm,
  onCancel,
}: Props) {
  // Mirrors the committed threshold, but tolerates the transient empty string
  // and any leading zeros while the field is being edited. Resynced during
  // render when the parent clamps the value, so the input never paints a
  // number the rule is no longer using.
  const [draft, setDraft] = useState(String(threshold));
  const [seenThreshold, setSeenThreshold] = useState(threshold);
  if (seenThreshold !== threshold) {
    setSeenThreshold(threshold);
    if (Number(draft) !== threshold) setDraft(String(threshold));
  }

  // The commit is debounced, never the field: `draft` paints every keystroke
  // immediately, and only the settled number becomes the rule the counts and
  // the confirmation are all computed from. Keeping one committed value means
  // the button label, its count, and the review it performs can never disagree.
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const commit = useRef(onThresholdChange);
  useEffect(() => {
    commit.current = onThresholdChange;
  });
  useEffect(() => () => clearTimeout(timer.current), []);

  const scheduleCommit = (value: string) => {
    clearTimeout(timer.current);
    if (value === "") return;
    timer.current = setTimeout(() => commit.current(Number(value)), COMMIT_DELAY_MS);
  };

  const commitNow = () => {
    clearTimeout(timer.current);
    if (draft !== "" && Number(draft) !== threshold) commit.current(Number(draft));
    else setDraft(String(threshold));
  };

  const comparison =
    confirmation?.action === "approve"
      ? `at least ${confirmation.threshold}%`
      : `below ${confirmation?.threshold}%`;
  const verb = confirmation?.action === "approve" ? "Accept" : "Reject";

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-3">
      <div aria-label="Suggestion status" className="min-w-0 overflow-x-auto">
        <div className="flex min-w-max items-center gap-1 border-b border-hairline">
          {chips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={() => onSelect(chip.key)}
              // The active chip is otherwise signalled by fill alone, which is
              // invisible to a screen reader and to anyone who cannot separate
              // the two treatments by colour.
              aria-pressed={active === chip.key}
              className={`min-h-10 rounded-md px-3 text-caption font-medium transition-colors ${
                active === chip.key
                  ? "bg-primary text-on-primary"
                  : "text-muted hover:bg-surface-strong hover:text-ink"
              }`}
            >
              {chip.label} <span className="opacity-75">{chip.count}</span>
            </button>
          ))}
        </div>
      </div>

      <div
        aria-label="Bulk review controls"
        className="card flex flex-col gap-4 p-4"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="text-body-sm font-medium text-ink">Bulk review</div>
            <p className="mt-1 text-caption text-muted">
              Apply one decision to pending suggestions based on their match score.
            </p>
            {!actionable && (
              <p className="mt-1 text-caption text-muted">
                Switch to Pending review or All to use bulk review.
              </p>
            )}
          </div>

          <label className="flex flex-none items-center gap-2 text-caption text-muted">
            Decision threshold
            {/* The ring lives on the field so the inner input can stay borderless. */}
            <span className="touch-target flex h-11 items-center rounded-md border border-hairline-control bg-surface-card px-3 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ink sm:h-10">
              <input
                aria-label="Score threshold"
                type="number"
                min={0}
                max={100}
                value={draft}
                onChange={(event) => {
                  // Keep the raw text while editing so clearing the field doesn't
                  // snap to 0 and rewrite the rule under the user's cursor.
                  setDraft(event.target.value);
                  scheduleCommit(event.target.value);
                }}
                // Leaving the field settles it now rather than after the delay,
                // so a click straight from the input to Accept uses what was typed.
                onBlur={commitNow}
                style={{ width: `${Math.max(draft.length, 1)}ch` }}
                className="bg-transparent text-right text-caption font-medium text-ink outline-none"
              />
              <span className="text-caption text-muted">%</span>
            </span>
          </label>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            aria-label={`Accept \u2265 ${threshold}% \u00b7 ${acceptCount}`}
            disabled={!actionable || acceptCount === 0}
            onClick={() => onRequest("approve")}
            className="btn btn-primary btn-sm sm:min-w-[12rem]"
          >
            {/* "match", not "confidence": the score is cosine similarity between
                two articles, and it is not the number Hybrid ranked the row by. */}
            Accept {acceptCount} matches
            <span className="text-caption opacity-75">&ge; {threshold}%</span>
          </button>
          <button
            type="button"
            aria-label={`Reject < ${threshold}% \u00b7 ${rejectCount}`}
            disabled={!actionable || rejectCount === 0}
            onClick={() => onRequest("reject")}
            className="btn btn-outline btn-sm sm:min-w-[12rem]"
          >
            Reject {rejectCount} matches
            <span className="text-caption text-muted">&lt; {threshold}%</span>
          </button>
        </div>
      </div>

      {confirmation && (
        <div
          role="alertdialog"
          aria-label="Confirm bulk review"
          // The system has no warning colour and asks for none: an interrupt
          // reads as a raised band on {colors.surface-strong} rather than a
          // saturated fill.
          className="flex flex-wrap items-center gap-3 rounded-xl border border-hairline-strong bg-surface-strong px-4 py-3"
        >
          <div className="min-w-0 flex-1">
            <div className="text-body-sm font-medium text-ink">
              {verb} {confirmation.count} pending suggestion
              {confirmation.count === 1 ? "" : "s"}?
            </div>
            <div className="mt-1 text-caption text-body">
              {confirmation.siteLabel} &middot; score {comparison}. Only pending
              suggestions matching this rule are affected. {" "}
              {confirmation.undoAvailable
                ? "The decision can be undone."
                : "This change is too large to undo in one step."} {" "}
              Approved links are not live until published.
            </div>
          </div>
          <button type="button" onClick={onCancel} className="btn btn-outline btn-sm">
            Cancel
          </button>
          <button type="button" onClick={onConfirm} className="btn btn-primary btn-sm">
            Confirm {confirmation.action === "approve" ? "accept" : "reject"}
          </button>
        </div>
      )}
    </div>
  );
}

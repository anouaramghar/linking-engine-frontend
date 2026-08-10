import { useEffect, useId, useRef, useState } from "react";

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
  count: number | string;
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
  acceptCount: number | null;
  rejectCount: number | null;
  /** False when the active status filter shows no pending suggestions to act on. */
  actionable: boolean;
  confirmation: BulkConfirmation | null;
  confirmationBlocked?: boolean;
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
  confirmationBlocked = false,
  onRequest,
  onConfirm,
  onCancel,
}: Props) {
  const confirmationTitleId = useId();
  const confirmationDescriptionId = useId();

  // Opening the confirmation disables the button that opened it, so focus has
  // to be handed on deliberately or it falls to the body and a keyboard user
  // loses the destructive prompt they just raised. Confirm takes focus on
  // open; Cancel hands it back to its own trigger. Confirming does not restore
  // it — the queue moves on, and the page places focus itself.
  const acceptButton = useRef<HTMLButtonElement>(null);
  const rejectButton = useRef<HTMLButtonElement>(null);
  const restoreFocusTo = useRef<BulkReviewAction | null>(null);
  useEffect(() => {
    const action = restoreFocusTo.current;
    if (confirmation || !action) return;
    restoreFocusTo.current = null;
    (action === "approve" ? acceptButton : rejectButton).current?.focus();
  }, [confirmation]);

  const cancel = () => {
    restoreFocusTo.current = confirmation?.action ?? null;
    onCancel();
  };

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
  useEffect(() => {
    // A URL/back-navigation change invalidates the draft that the old timer
    // captured, just like clearing the queue search does.
    clearTimeout(timer.current);
  }, [threshold]);

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
  const verb = confirmation?.action === "approve" ? "Select" : "Reject";
  const acceptLabel = acceptCount === null ? "—" : String(acceptCount);
  const rejectLabel = rejectCount === null ? "—" : String(rejectCount);

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div aria-label="Suggestion status" className="min-w-0 overflow-x-auto">
        <div className="flex min-w-max items-center gap-1">
          {chips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={() => onSelect(chip.key)}
              // The active chip is otherwise signalled by fill alone, which is
              // invisible to a screen reader and to anyone who cannot separate
              // the two treatments by colour.
              aria-pressed={active === chip.key}
              className={`touch-target min-h-11 rounded-md px-3 text-caption font-medium transition-colors sm:min-h-10 ${
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
        className="flex flex-col gap-3 border-t border-hairline pt-3"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <div className="text-body-sm font-medium text-ink">Bulk review</div>
            <p className="mt-0.5 text-caption text-muted">Apply decisions by match score.</p>
            {!actionable && (
              <p className="mt-1 text-caption text-muted">
                Switch to Pending review or All to use bulk review.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end">
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
                   // so a click straight from the input to Select uses what was typed.
                  onBlur={commitNow}
                  style={{ width: `${Math.max(draft.length, 1)}ch` }}
                  className="bg-transparent text-right text-caption font-medium text-ink outline-none"
                />
                <span className="text-caption text-muted">%</span>
              </span>
            </label>

            <button
              ref={acceptButton}
              type="button"
              aria-label={`Select \u2265 ${threshold}% \u00b7 ${acceptLabel}`}
              disabled={!actionable || acceptCount === null || acceptCount === 0}
              onClick={() => onRequest("approve")}
              className="btn btn-primary btn-sm sm:min-w-[12rem]"
            >
              {/* "match", not "confidence": the score is cosine similarity between
                  two articles, and it is not the number Hybrid ranked the row by. */}
              Select {acceptLabel} matches
              <span className="text-caption opacity-75">&ge; {threshold}%</span>
            </button>
            <button
              ref={rejectButton}
              type="button"
              aria-label={`Reject < ${threshold}% \u00b7 ${rejectLabel}`}
              disabled={!actionable || rejectCount === null || rejectCount === 0}
              onClick={() => onRequest("reject")}
              className="btn btn-outline btn-sm sm:min-w-[12rem]"
            >
              Reject {rejectLabel} matches
              <span className="text-caption text-muted">&lt; {threshold}%</span>
            </button>
          </div>
        </div>
      </div>

      {confirmation && (
        <div
          role="region"
          aria-live="polite"
          aria-atomic="true"
          aria-labelledby={confirmationTitleId}
          aria-describedby={confirmationDescriptionId}
          data-queue-confirmation=""
          // The system has no warning colour and asks for none: an interrupt
          // reads as a raised band on {colors.surface-strong} rather than a
          // saturated fill. It stays inline, so it is a live region rather than
          // a modal dialog that would trap focus — but it still takes focus,
          // because the button that raised it is disabled from this point on.
          className="flex flex-wrap items-center gap-3 rounded-xl border border-hairline-strong bg-surface-strong px-4 py-3"
        >
          <div className="min-w-0 flex-1">
            <div id={confirmationTitleId} className="text-body-sm font-medium text-ink">
              {verb} {confirmation.count} pending suggestion
              {confirmation.count === 1 ? "" : "s"}?
            </div>
            <div id={confirmationDescriptionId} className="mt-1 text-caption text-body">
              {confirmation.siteLabel} &middot; score {comparison}. Only pending
              suggestions matching this rule are affected. {" "}
              {confirmation.undoAvailable
                ? "The decision can be undone."
                : "This change is too large to undo in one step."} {" "}
              Selected links are not live and not scheduled; the exact edits still
              have to be reviewed and approved.
            </div>
          </div>
          <button type="button" onClick={cancel} className="btn btn-outline btn-sm">
            Cancel
          </button>
          <button
            autoFocus
            type="button"
            onClick={onConfirm}
            disabled={confirmationBlocked}
            className="btn btn-primary btn-sm"
          >
            {confirmationBlocked
              ? "Updating…"
              : `Confirm ${confirmation.action === "approve" ? "selection" : "rejection"}`}
          </button>
        </div>
      )}
    </div>
  );
}

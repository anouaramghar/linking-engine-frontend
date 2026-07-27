import { useState } from "react";

import type { BulkReviewAction } from "../../lib/suggestionReview";

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

  const comparison =
    confirmation?.action === "approve"
      ? `at least ${confirmation.threshold}%`
      : `below ${confirmation?.threshold}%`;
  const verb = confirmation?.action === "approve" ? "Accept" : "Reject";

  return (
    <div className="flex min-w-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {chips.map((chip) => (
          <button
            key={chip.key}
            onClick={() => onSelect(chip.key)}
            className={`rounded-full border px-4 py-2 text-sm font-medium ${
              active === chip.key
                ? "border-stone-800 bg-stone-800 text-white"
                : "border-stone-300 text-stone-950 hover:border-stone-950"
            }`}
          >
            {chip.label} &middot; {chip.count}
          </button>
        ))}
      </div>

      <div
        aria-label="Bulk review controls"
        className="flex flex-wrap items-center gap-3 rounded-2xl border border-stone-200 bg-white p-3"
      >
        <label className="flex items-center gap-2 text-sm text-stone-600">
          Score threshold
          {/* The ring lives on the pill so the inner input can stay borderless. */}
          <span className="flex items-center rounded-full border border-stone-300 bg-white px-3 py-1.5 focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-stone-950">
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
                if (event.target.value !== "") onThresholdChange(Number(event.target.value));
              }}
              onBlur={() => setDraft(String(threshold))}
              style={{ width: `${Math.max(draft.length, 1)}ch` }}
              className="bg-transparent text-right font-medium text-stone-950 outline-none"
            />
            <span className="text-stone-600">%</span>
          </span>
        </label>

        {!actionable && (
          <span className="text-sm text-stone-600">
            Bulk rules act on pending suggestions - switch to Pending review or All.
          </span>
        )}

        <div className="min-w-4 flex-1" />
        <button
          type="button"
          disabled={!actionable || acceptCount === 0}
          onClick={() => onRequest("approve")}
          className="rounded-full border border-stone-800 bg-stone-800 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:border-stone-200 disabled:bg-stone-200 disabled:text-stone-400"
        >
          Accept &ge; {threshold}% &middot; {acceptCount}
        </button>
        <button
          type="button"
          disabled={!actionable || rejectCount === 0}
          onClick={() => onRequest("reject")}
          className="rounded-full border border-stone-300 px-4 py-2 text-sm font-medium text-stone-950 disabled:cursor-not-allowed disabled:text-stone-300"
        >
          Reject &lt; {threshold}% &middot; {rejectCount}
        </button>
      </div>

      {confirmation && (
        <div
          role="alertdialog"
          aria-label="Confirm bulk review"
          className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3"
        >
          <div className="min-w-0 flex-1 text-sm text-stone-700">
            <div className="font-medium text-stone-950">
              {verb} {confirmation.count} pending suggestion
              {confirmation.count === 1 ? "" : "s"}?
            </div>
            <div className="mt-0.5 text-xs text-stone-600">
              {confirmation.siteLabel} &middot; score {comparison}. Only pending
              suggestions matching this rule are affected.{" "}
              {confirmation.undoAvailable
                ? "The decision can be undone."
                : "This change is too large to undo in one step."}{" "}
              Approved links are not live until published.
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border border-stone-300 px-3 py-1.5 text-sm font-medium"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-full bg-stone-800 px-3 py-1.5 text-sm font-medium text-white"
          >
            Confirm {confirmation.action === "approve" ? "accept" : "reject"}
          </button>
        </div>
      )}
    </div>
  );
}

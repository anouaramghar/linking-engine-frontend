import type { BulkReviewAction } from "../../lib/suggestionReview";

export interface SelectionConfirmation {
  action: BulkReviewAction;
  ids: number[];
}

interface Props {
  selectedCount: number;
  visibleCount: number;
  allVisibleSelected: boolean;
  confirmation: SelectionConfirmation | null;
  busy: boolean;
  onToggleVisible: () => void;
  onClear: () => void;
  onRequest: (action: BulkReviewAction) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function SelectionActions({
  selectedCount,
  visibleCount,
  allVisibleSelected,
  confirmation,
  busy,
  onToggleVisible,
  onClear,
  onRequest,
  onConfirm,
  onCancel,
}: Props) {
  if (visibleCount === 0 && selectedCount === 0) return null;

  const verb = confirmation?.action === "approve" ? "Accept" : "Reject";

  return (
    <section aria-label="Suggestion selection" className="mb-4 flex flex-col gap-3">
      <div className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <div aria-live="polite" className="text-body-sm font-medium text-ink">
            {selectedCount} selected
          </div>
          <p className="mt-1 text-caption text-muted">
            Choose pending suggestions, then review only those rows together.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {visibleCount > 0 && (
            <button
              type="button"
              aria-pressed={allVisibleSelected}
              onClick={onToggleVisible}
              disabled={busy}
              className="btn btn-outline btn-sm"
            >
              {allVisibleSelected ? "Unselect" : "Select"} visible ({visibleCount})
            </button>
          )}
          {selectedCount > 0 && (
            <>
              <button
                type="button"
                onClick={onClear}
                disabled={busy}
                className="btn btn-outline btn-sm"
              >
                Clear selection
              </button>
              <button
                type="button"
                onClick={() => onRequest("approve")}
                disabled={busy}
                className="btn btn-primary btn-sm"
              >
                Accept selected
              </button>
              <button
                type="button"
                onClick={() => onRequest("reject")}
                disabled={busy}
                className="btn btn-outline btn-sm"
              >
                Reject selected
              </button>
            </>
          )}
        </div>
      </div>

      {confirmation && (
        <div
          role="alertdialog"
          aria-label="Confirm selected suggestions"
          className="flex flex-wrap items-center gap-3 rounded-xl border border-hairline-strong bg-surface-strong px-4 py-3"
        >
          <div className="min-w-0 flex-1">
            <div className="text-body-sm font-medium text-ink">
              {verb} {confirmation.ids.length} selected suggestion
              {confirmation.ids.length === 1 ? "" : "s"}?
            </div>
            <div className="mt-1 text-caption text-body">
              Only the selected pending suggestions are affected. The decision can be
              undone. Approved links are not live until published.
            </div>
          </div>
          <button type="button" onClick={onCancel} disabled={busy} className="btn btn-outline btn-sm">
            Cancel
          </button>
          <button type="button" onClick={onConfirm} disabled={busy} className="btn btn-primary btn-sm">
            Confirm selected {confirmation.action === "approve" ? "accept" : "reject"}
          </button>
        </div>
      )}
    </section>
  );
}

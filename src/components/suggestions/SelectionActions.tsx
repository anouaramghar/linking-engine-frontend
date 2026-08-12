import type { BulkReviewAction } from "../../lib/suggestionReview";
import Modal from "../Modal";

export interface SelectionConfirmation {
  action: BulkReviewAction;
  ids: number[];
}

interface Props {
  selectedCount: number;
  visibleCount: number;
  filteredCount: number;
  allVisibleSelected: boolean;
  allFilteredSelected: boolean;
  loadingFiltered: boolean;
  confirmation: SelectionConfirmation | null;
  busy: boolean;
  onToggleVisible: () => void;
  onToggleFiltered: () => void;
  onClear: () => void;
  onRequest: (action: BulkReviewAction) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function SelectionActions({
  selectedCount,
  visibleCount,
  filteredCount,
  allVisibleSelected,
  allFilteredSelected,
  loadingFiltered,
  confirmation,
  busy,
  onToggleVisible,
  onToggleFiltered,
  onClear,
  onRequest,
  onConfirm,
  onCancel,
}: Props) {
  if (visibleCount === 0 && filteredCount === 0 && selectedCount === 0) return null;

  const verb = confirmation?.action === "approve" ? "Accept" : "Reject";

  return (
    <>
      <section aria-label="Suggestion selection" className="mb-4">
        <div className="card flex flex-col gap-4 p-4">
          <div className="min-w-0 max-w-2xl">
            <div aria-live="polite" className="text-body-sm font-medium text-ink">
              {selectedCount} selected
            </div>
            <p className="mt-1 text-caption text-muted">
              Choose pending suggestions, then review only those rows together.
            </p>
          </div>

          <div className="grid w-full grid-cols-1 gap-2 sm:flex sm:flex-wrap sm:items-center">
          {visibleCount > 0 && (
            <button
              type="button"
              aria-pressed={allVisibleSelected}
              onClick={onToggleVisible}
              disabled={busy}
              className="btn btn-outline btn-sm w-full sm:w-auto"
            >
              {allVisibleSelected ? "Unselect" : "Select"} visible ({visibleCount})
            </button>
          )}
          {filteredCount > visibleCount && (
            <button
              type="button"
              aria-pressed={allFilteredSelected}
              onClick={onToggleFiltered}
              disabled={busy || loadingFiltered}
              className="btn btn-outline btn-sm w-full sm:w-auto"
            >
              {loadingFiltered
                ? "Selecting…"
                : allFilteredSelected
                  ? `Unselect all filtered (${filteredCount})`
                  : `Select all filtered (${filteredCount})`}
            </button>
          )}
          {selectedCount > 0 && (
            <>
              <button
                type="button"
                onClick={onClear}
                disabled={busy}
                className="btn btn-outline btn-sm w-full sm:w-auto"
              >
                Clear selection
              </button>
              <button
                type="button"
                onClick={() => onRequest("approve")}
                disabled={busy}
                className="btn btn-primary btn-sm w-full sm:w-auto"
              >
                Accept selected
              </button>
              <button
                type="button"
                onClick={() => onRequest("reject")}
                disabled={busy}
                className="btn btn-outline btn-sm w-full sm:w-auto"
              >
                Reject selected
              </button>
            </>
          )}
          </div>
        </div>
      </section>
      {confirmation && (
        <Modal
          title={`${verb} ${confirmation.ids.length} selected suggestion${confirmation.ids.length === 1 ? "" : "s"}?`}
          ariaLabel="Confirm selected suggestions"
          role="alertdialog"
          onClose={() => {
            if (!busy) onCancel();
          }}
          panelClassName="max-w-xl shadow-drawer"
        >
          <p className="text-body-sm leading-relaxed text-body">
            Only the selected pending suggestions are affected. The decision can be
            undone. Approved links are not live until published.
          </p>
          <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onCancel}
              disabled={busy}
              className="btn btn-outline btn-sm w-full sm:w-auto"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={busy}
              className="btn btn-primary btn-sm w-full sm:w-auto"
            >
              Confirm selected {confirmation.action === "approve" ? "accept" : "reject"}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

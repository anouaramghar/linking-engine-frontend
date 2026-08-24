import type { ReactNode } from "react";

function ClearSelectionIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
    >
      <path d="M6 6 18 18" />
      <path d="m18 6-12 12" />
    </svg>
  );
}

interface BatchSelectionTrayProps {
  regionLabel: string;
  itemLabel: string;
  itemLabelPlural: string;
  selectedCount: number;
  status: ReactNode;
  actionLabel: string;
  pendingActionLabel: string;
  actionPending: boolean;
  actionDisabled?: boolean;
  onClear: () => void;
  onAction: () => void;
}

export default function BatchSelectionTray({
  regionLabel,
  itemLabel,
  itemLabelPlural,
  selectedCount,
  status,
  actionLabel,
  pendingActionLabel,
  actionPending,
  actionDisabled = false,
  onClear,
  onAction,
}: BatchSelectionTrayProps) {
  const clearLabel = `Clear selected ${itemLabelPlural}`;

  return (
    <div
      role="region"
      aria-label={regionLabel}
      className="sticky bottom-3 z-10 mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-hairline-strong bg-surface-card px-4 py-3 shadow-lift sm:px-5"
    >
      <div className="min-w-0 flex-1">
        <div className="text-body-sm font-medium text-ink" aria-live="polite">
          {selectedCount} {itemLabel}
          {selectedCount === 1 ? "" : "s"} selected
        </div>
        <div className="mt-1 text-caption text-muted">{status}</div>
      </div>
      <button
        type="button"
        onClick={onClear}
        className="btn btn-outline btn-sm h-11 w-11 p-0 sm:h-8 sm:w-8"
        aria-label={clearLabel}
        title={clearLabel}
      >
        <ClearSelectionIcon />
      </button>
      <button
        type="button"
        onClick={onAction}
        disabled={actionPending || actionDisabled}
        className="btn btn-primary btn-sm sm:min-w-[10rem]"
      >
        {actionPending ? pendingActionLabel : actionLabel}
      </button>
    </div>
  );
}

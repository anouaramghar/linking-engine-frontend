import type {
  BulkReviewAction,
  SuggestionMethodFilter,
} from "../../lib/suggestionReview";

interface Chip {
  key: string;
  label: string;
  count: number;
}

export interface BulkConfirmation {
  action: BulkReviewAction;
  count: number;
  threshold: number;
  methodLabel: string;
  siteLabel: string;
}

interface Props {
  chips: Chip[];
  active: string;
  onSelect: (key: string) => void;
  method: SuggestionMethodFilter;
  onMethodChange: (method: SuggestionMethodFilter) => void;
  threshold: number;
  onThresholdChange: (threshold: number) => void;
  acceptCount: number;
  rejectCount: number;
  confirmation: BulkConfirmation | null;
  onRequest: (action: BulkReviewAction) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

const METHODS: { key: SuggestionMethodFilter; label: string }[] = [
  { key: "all", label: "All methods" },
  { key: "baseline_cosine", label: "Baseline" },
  { key: "gnn_graphsage", label: "GNN" },
];

export default function BulkActions({
  chips,
  active,
  onSelect,
  method,
  onMethodChange,
  threshold,
  onThresholdChange,
  acceptCount,
  rejectCount,
  confirmation,
  onRequest,
  onConfirm,
  onCancel,
}: Props) {
  const comparison = confirmation?.action === "approve"
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
            {chip.label} · {chip.count}
          </button>
        ))}
      </div>

      <div
        aria-label="Bulk review controls"
        className="flex flex-wrap items-center gap-3 rounded-2xl border border-stone-200 bg-white p-3"
      >
        <div className="flex items-center gap-1 rounded-full bg-stone-100 p-1">
          {METHODS.map((option) => (
            <button
              key={option.key}
              type="button"
              aria-pressed={method === option.key}
              onClick={() => onMethodChange(option.key)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                method === option.key
                  ? "bg-white text-stone-950 shadow-sm"
                  : "text-stone-500 hover:text-stone-950"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 text-sm text-stone-600">
          Score threshold
          <span className="flex items-center rounded-full border border-stone-300 bg-white px-3 py-1.5">
            <input
              aria-label="Score threshold"
              type="number"
              min={0}
              max={100}
              value={threshold}
              onChange={(event) => onThresholdChange(Number(event.target.value))}
              style={{ width: `${Math.max(String(threshold).length, 1)}ch` }}
              className="bg-transparent text-right font-medium text-stone-950 outline-none"
            />
            <span className="text-stone-400">%</span>
          </span>
        </label>

        <div className="min-w-4 flex-1" />
        <button
          type="button"
          disabled={acceptCount === 0}
          onClick={() => onRequest("approve")}
          className="rounded-full border border-stone-800 bg-stone-800 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:border-stone-200 disabled:bg-stone-200 disabled:text-stone-400"
        >
          Accept ≥ {threshold}% · {acceptCount}
        </button>
        <button
          type="button"
          disabled={rejectCount === 0}
          onClick={() => onRequest("reject")}
          className="rounded-full border border-stone-300 px-4 py-2 text-sm font-medium text-stone-950 disabled:cursor-not-allowed disabled:text-stone-300"
        >
          Reject &lt; {threshold}% · {rejectCount}
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
            <div className="mt-0.5 text-xs text-stone-500">
              {confirmation.methodLabel} · {confirmation.siteLabel} · {comparison}. Preview only —
              decisions aren&apos;t sent to the site yet.
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

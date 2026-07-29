import { useId, useState } from "react";

import Modal from "../Modal";
import type { Site, SuggestionMode } from "../../types/site";

const METHOD_COPY: Record<
  SuggestionMode,
  { label: string; description: string; note: string }
> = {
  standard: {
    label: "Standard",
    description: "Ranks articles by semantic similarity using cosine.",
    note: "Current default",
  },
  experimental: {
    label: "Experimental",
    description: "Combines cosine candidates with BM25 keyword matching.",
    note: "Limited pilot",
  },
};

export default function SuggestionMethodDialog({
  site,
  pending,
  error,
  onSave,
  onClose,
}: {
  site: Site;
  pending: boolean;
  error?: string;
  onSave: (mode: SuggestionMode) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<SuggestionMode>(site.suggestion_mode);
  const descriptionId = useId();
  const capacityId = useId();
  const slots = site.suggestion_slots_available;
  const capacityCopy =
    slots === 0
      ? "The review queue is full. This choice will apply after editors free suggestion slots."
      : `${slots.toLocaleString()} open suggestion ${slots === 1 ? "slot" : "slots"}. The next run will fill only those open positions.`;

  return (
    <Modal
      title={`Suggestion method for ${site.name}`}
      onClose={onClose}
      panelClassName="max-w-lg"
    >
      <p id={descriptionId} className="-mt-2 max-w-[65ch] text-body-md text-body">
        Choose how future suggestions are ranked. Existing suggestions and editorial
        decisions stay in place.
      </p>

      <fieldset className="mt-5" aria-describedby={`${descriptionId} ${capacityId}`}>
        <legend className="sr-only">Suggestion method</legend>
        <div className="flex flex-col gap-2">
          {(Object.keys(METHOD_COPY) as SuggestionMode[]).map((mode) => {
            const copy = METHOD_COPY[mode];
            const checked = selected === mode;
            return (
              <label
                key={mode}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border px-4 py-3.5 transition-colors ${
                  checked
                    ? "border-ink bg-surface-card"
                    : "border-hairline-strong bg-transparent hover:border-ink"
                }`}
              >
                <input
                  type="radio"
                  name="suggestion-method"
                  value={mode}
                  checked={checked}
                  onChange={() => setSelected(mode)}
                  className="mt-1 accent-primary"
                />
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium text-ink">{copy.label}</span>
                    <span className="text-caption text-muted">{copy.note}</span>
                  </span>
                  <span className="mt-0.5 block text-caption leading-relaxed text-body">
                    {copy.description}
                  </span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <p id={capacityId} className="mt-4 text-caption leading-relaxed text-muted">
        {capacityCopy}
      </p>

      {error && (
        <div role="alert" className="mt-3 text-caption text-error">
          {error}
        </div>
      )}

      <div className="mt-6 flex gap-2">
        <button
          type="button"
          onClick={() => onSave(selected)}
          disabled={pending || selected === site.suggestion_mode}
          className="btn btn-primary flex-1"
        >
          {pending ? "Saving…" : "Save method"}
        </button>
        <button type="button" onClick={onClose} className="btn btn-outline">
          Cancel
        </button>
      </div>
    </Modal>
  );
}

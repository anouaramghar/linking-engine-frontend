import { MAX_SEARCH_TERM } from "../../api/suggestions";
import { useDebouncedField } from "../../hooks/useDebouncedField";
import { clampThreshold } from "../../lib/suggestionReview";
import { TARGET_ORIGIN_LABEL } from "../../lib/utils";
import type { QueueFilterState } from "../../hooks/useQueueFilters";
import type { Site } from "../../types/site";
import type { SuggestionTargetOrigin } from "../../types/suggestion";

/** Long enough to type a word, short enough that the queue still answers you. */
const SEARCH_DELAY_MS = 300;
const SCORE_DELAY_MS = 250;

const control =
  "touch-target h-11 rounded-pill border border-hairline-control bg-surface-card px-3.5 text-caption text-ink sm:h-8";

interface Props {
  filters: QueueFilterState;
  onChange: (patch: Partial<QueueFilterState>) => void;
  sites: Site[] | undefined;
  /** True when anything is narrowing the queue, so clearing is worth offering. */
  isFiltered: boolean;
  onClear: () => void;
  /** Set while a bulk rule is being confirmed and owns the score window. */
  scoreLockedBy?: string;
}

export default function QueueFilters({
  filters,
  onChange,
  sites,
  isFiltered,
  onClear,
  scoreLockedBy,
}: Props) {
  const search = useDebouncedField<string>({
    value: filters.q,
    format: (value) => value,
    parse: (draft) => draft.slice(0, MAX_SEARCH_TERM),
    commit: (q) => onChange({ q }),
    delayMs: SEARCH_DELAY_MS,
  });

  const minScore = useDebouncedField<number>({
    value: filters.minScore,
    format: (value) => (value === 0 ? "" : String(value)),
    // An empty box is "no lower bound", which is a real value here — unlike a
    // half-typed number, it should commit.
    parse: (draft) => (draft.trim() === "" ? 0 : clampThreshold(Number(draft))),
    commit: (minScore) => onChange({ minScore }),
    delayMs: SCORE_DELAY_MS,
  });

  return (
    <div
      aria-label="Queue filters"
      role="search"
      className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center"
    >
      <label className="flex min-w-0 flex-1 items-center sm:max-w-xs">
        <span className="sr-only">Search article titles</span>
        <input
          type="search"
          value={search.draft}
          onChange={(event) => search.change(event.target.value)}
          onBlur={search.flush}
          maxLength={MAX_SEARCH_TERM}
          placeholder="Search titles…"
          className={`${control} w-full`}
        />
      </label>

      <select
        aria-label="Site filter"
        value={filters.siteId}
        onChange={(event) => onChange({ siteId: Number(event.target.value) })}
        className={`${control} w-full cursor-pointer sm:w-auto`}
      >
        <option value={0}>All sites</option>
        {sites?.map((site) => (
          <option key={site.id} value={site.id}>
            {site.name}
          </option>
        ))}
      </select>

      <select
        aria-label="Target filter"
        value={filters.targetOrigin}
        onChange={(event) =>
          onChange({
            targetOrigin: event.target.value as SuggestionTargetOrigin | "",
          })
        }
        className={`${control} w-full cursor-pointer sm:w-auto`}
      >
        {/* The same words the card's badge uses, so the filter and the row it
            selects describe a target the same way. */}
        <option value="">Any target</option>
        <option value="internal">{TARGET_ORIGIN_LABEL.internal}</option>
        <option value="content_pool">{TARGET_ORIGIN_LABEL.content_pool}</option>
      </select>

      <label
        className={`flex items-center gap-2 text-caption ${
          scoreLockedBy ? "text-muted" : "text-body"
        }`}
      >
        Min score
        <span className={`${control} flex items-center gap-1 px-3`}>
          <input
            type="number"
            min={0}
            max={100}
            inputMode="numeric"
            aria-label="Minimum score"
            // While a bulk rule is being confirmed the queue is showing that
            // rule's window, not this one. Editing it there would silently
            // disagree with what the confirmation says it will act on.
            disabled={Boolean(scoreLockedBy)}
            value={minScore.draft}
            onChange={(event) => minScore.change(event.target.value)}
            onBlur={minScore.flush}
            placeholder="0"
            className="w-10 bg-transparent text-right text-caption font-medium text-ink outline-none disabled:cursor-not-allowed disabled:opacity-60"
          />
          <span className="text-muted">%</span>
        </span>
      </label>

      <label className="flex items-center gap-2 text-caption text-body">
        <input
          type="checkbox"
          checked={filters.hideReciprocal}
          onChange={(event) => onChange({ hideReciprocal: event.target.checked })}
          className="h-4 w-4 rounded border-hairline-control"
        />
        Hide reverse duplicates
      </label>

      {isFiltered && (
        <button type="button" onClick={onClear} className="btn btn-outline btn-sm">
          Clear filters
        </button>
      )}
    </div>
  );
}

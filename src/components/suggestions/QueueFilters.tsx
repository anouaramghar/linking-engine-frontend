import { MAX_SEARCH_TERM } from "../../api/suggestions";
import { useDebouncedField } from "../../hooks/useDebouncedField";
import { TARGET_ORIGIN_LABEL } from "../../lib/utils";
import type { QueueFilterState } from "../../hooks/useQueueFilters";
import type { Site } from "../../types/site";
import type { SuggestionTargetOrigin } from "../../types/suggestion";

/** Long enough to type a word, short enough that the queue still answers you. */
const SEARCH_DELAY_MS = 300;

const control =
  "touch-target h-11 rounded-md border border-hairline-control bg-surface-card px-3.5 text-caption text-ink sm:h-10";

interface Props {
  filters: QueueFilterState;
  onChange: (patch: Partial<QueueFilterState>) => void;
  sites: Site[] | undefined;
  /** True when anything is narrowing the queue, so clearing is worth offering. */
  isFiltered: boolean;
  onClear: () => void;
  ariaLabel?: string;
}

export default function QueueFilters({
  filters,
  onChange,
  sites,
  isFiltered,
  onClear,
  ariaLabel = "Queue filters",
}: Props) {
  const search = useDebouncedField<string>({
    value: filters.q,
    format: (value) => value,
    parse: (draft) => draft.slice(0, MAX_SEARCH_TERM),
    commit: (q) => onChange({ q }),
    delayMs: SEARCH_DELAY_MS,
  });

  return (
    <div
      aria-label={ariaLabel}
      role="search"
      className="flex flex-col gap-2"
    >
      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
        <label className="col-span-2 flex min-w-0 flex-1 items-center sm:col-auto sm:min-w-filter">
          <span className="sr-only">Search article titles</span>
          <input
            type="search"
            name="q"
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
          className={`${control} min-w-0 w-full cursor-pointer sm:w-auto`}
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
          className={`${control} min-w-0 w-full cursor-pointer sm:w-auto`}
        >
          {/* The same words the card's badge uses, so the filter and the row it
              selects describe a target the same way. */}
          <option value="">Any target</option>
          <option value="internal">{TARGET_ORIGIN_LABEL.internal}</option>
          <option value="content_pool">{TARGET_ORIGIN_LABEL.content_pool}</option>
          <option value="web_search">{TARGET_ORIGIN_LABEL.web_search}</option>
        </select>

        {isFiltered && (
          <button
            type="button"
            onClick={() => {
              search.cancel();
              onClear();
            }}
            className="btn btn-text btn-sm col-span-2 justify-self-start sm:col-auto"
          >
            Clear filters
          </button>
        )}
      </div>

    </div>
  );
}

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
}

export default function QueueFilters({
  filters,
  onChange,
  sites,
  isFiltered,
  onClear,
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
      aria-label="Queue filters"
      role="search"
      className="card flex flex-col gap-3 p-3 sm:p-4"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        <label className="flex min-w-0 flex-1 items-center sm:min-w-[16rem]">
          <span className="sr-only">Search article titles</span>
          <input
            type="search"
            value={search.draft}
            onChange={(event) => search.change(event.target.value)}
            onBlur={search.flush}
            maxLength={MAX_SEARCH_TERM}
            placeholder="Search titles..."
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
          <option value="web_search">{TARGET_ORIGIN_LABEL.web_search}</option>
        </select>

        {isFiltered && (
          <button type="button" onClick={onClear} className="btn btn-text btn-sm">
            Clear filters
          </button>
        )}
      </div>

    </div>
  );
}

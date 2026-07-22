import { METHOD_LABEL, STATUS_META, isReversible, pct } from "../../lib/utils";
import type { Suggestion } from "../../types/suggestion";

interface Props {
  suggestion: Suggestion;
  siteName: string;
  selected: boolean;
  onOpen: () => void;
  onAccept: () => void;
  onReject: () => void;
  onUndo: () => void;
  /** Set on the keyboard cursor's row so the queue can scroll it into view. */
  containerRef?: React.Ref<HTMLLIElement>;
}

export default function SuggestionCard({
  suggestion: s,
  siteName,
  selected,
  onOpen,
  onAccept,
  onReject,
  onUndo,
  containerRef,
}: Props) {
  const meta = STATUS_META[s.status];

  const method = METHOD_LABEL[s.method] ?? s.method;

  return (
    <li
      ref={containerRef}
      aria-current={selected || undefined}
      className={`flex animate-rowIn items-center gap-4 rounded-2xl border bg-white px-5 py-4 transition-shadow hover:shadow-[0_4px_16px_rgba(0,0,0,.04)] ${
        selected ? "border-stone-950" : "border-stone-200"
      }`}
    >
      <span className={`h-2 w-2 flex-none rounded-full ${meta.dot}`} />
      {/* A real button so the preview is reachable by keyboard, with the row
          actions kept outside it rather than nested inside a control. */}
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Open suggestion: ${s.source_article.title} to ${s.target_article.title}`}
        className="flex min-w-0 flex-1 items-center gap-4 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-2 text-[15px]">
            <span className="font-medium text-stone-950">{s.source_article.title}</span>
            <span aria-hidden className="text-stone-600">
              &rarr;
            </span>
            <span className="text-stone-600">{s.target_article.title}</span>
          </span>
          <span className="mt-1.5 flex flex-wrap items-center gap-2.5">
            {s.anchor_text && (
              <span className="rounded-full bg-chip px-3 py-0.5 text-[13px] text-stone-800">
                &ldquo;{s.anchor_text}&rdquo;
              </span>
            )}
            <span className="text-[13px] text-stone-600">{siteName}</span>
            <span className="rounded-full border border-stone-200 px-2 py-0.5 text-[11px] uppercase tracking-wide text-stone-600">
              {method}
            </span>
          </span>
        </span>
        <span className="w-[104px] flex-none text-right">
          <span className="block text-base font-medium text-stone-950">{pct(s.score)}</span>
          <span className="mb-1 mt-1.5 block h-[3px] overflow-hidden rounded bg-stone-200">
            <span
              className="block h-full rounded bg-stone-800"
              style={{ width: pct(s.score) }}
            />
          </span>
        </span>
      </button>
      <div className="flex w-[190px] flex-none items-center justify-end gap-1.5">
        {s.status === "pending" ? (
          <>
            <button
              onClick={(event) => {
                event.stopPropagation();
                onAccept();
              }}
              className="rounded-full border border-stone-800 bg-stone-800 px-4 py-2 text-sm font-medium text-white hover:bg-stone-950"
            >
              Accept
            </button>
            <button
              onClick={(event) => {
                event.stopPropagation();
                onReject();
              }}
              className="rounded-full border border-stone-300 px-[15px] py-2 text-sm font-medium text-stone-950 hover:border-stone-950"
            >
              Reject
            </button>
          </>
        ) : (
          <>
            <span
              className={`whitespace-nowrap rounded-full bg-chip px-3 py-1 text-xs font-medium ${meta.fg}`}
            >
              {meta.label}
            </span>
            {isReversible(s.status) && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onUndo();
                }}
                className="rounded-full border border-stone-300 px-3 py-1.5 text-[13px] font-medium text-stone-700 hover:border-stone-950 hover:text-stone-950"
              >
                Undo
              </button>
            )}
          </>
        )}
      </div>
    </li>
  );
}

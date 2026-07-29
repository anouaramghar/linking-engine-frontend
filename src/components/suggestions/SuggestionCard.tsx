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
  showSource?: boolean;
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
  showSource = true,
  containerRef,
}: Props) {
  const meta = STATUS_META[s.status];

  const method = METHOD_LABEL[s.method] ?? s.method;

  return (
    <li
      ref={containerRef}
      aria-current={selected || undefined}
      className={`card flex animate-rowIn items-center gap-4 px-5 py-4 transition-shadow hover:shadow-soft ${
        selected ? "border-ink" : ""
      }`}
    >
      <span className={`dot ${meta.dot}`} />
      {/* A real button so the preview is reachable by keyboard, with the row
          actions kept outside it rather than nested inside a control. */}
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Open suggestion: ${s.source_article.title} to ${s.target_article.title}`}
        className="flex min-w-0 flex-1 items-center gap-4 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-2 text-body-sm">
            {showSource ? (
              <>
                <span className="font-medium text-ink">{s.source_article.title}</span>
                <span aria-hidden className="text-muted">
                  &rarr;
                </span>
              </>
            ) : (
              <span className="text-muted">Links to</span>
            )}
            <span className={showSource ? "text-body" : "font-medium text-ink"}>
              {s.target_article.title}
            </span>
          </span>
          <span className="mt-2 flex flex-wrap items-center gap-3">
            {s.anchor_text && (
              <span className="rounded-pill bg-surface-strong px-3 py-0.5 text-caption text-ink">
                &ldquo;{s.anchor_text}&rdquo;
              </span>
            )}
            <span className="text-caption text-muted">{siteName}</span>
            <span className="rounded-pill border border-hairline px-2.5 py-1 text-caption-upper uppercase text-muted">
              {method}
            </span>
          </span>
        </span>
        <span className="w-[104px] flex-none text-right">
          <span className="block text-body-md font-medium text-ink">{pct(s.score)}</span>
          <span className="mb-1 mt-2 block h-[3px] overflow-hidden rounded-pill bg-hairline">
            <span
              className="block h-full rounded-pill bg-primary"
              style={{ width: pct(s.score) }}
            />
          </span>
          <span className="block text-[11px] text-muted">
            GraphSAGE <span className="font-medium text-ink">Soon</span>
          </span>
        </span>
      </button>
      {/* Fixed to the widest reversible state so the status badge and Undo
          stay inside their column instead of spilling over the score. */}
      <div className="flex w-[272px] flex-none items-center justify-end gap-2">
        {s.status === "pending" ? (
          <>
            <button
              onClick={(event) => {
                event.stopPropagation();
                onAccept();
              }}
              className="btn btn-primary btn-sm"
            >
              Accept
            </button>
            <button
              onClick={(event) => {
                event.stopPropagation();
                onReject();
              }}
              className="btn btn-outline btn-sm"
            >
              Reject
            </button>
          </>
        ) : (
          <>
            <span className="badge">{meta.label}</span>
            {isReversible(s.status) && (
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  onUndo();
                }}
                className="btn btn-outline btn-sm"
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

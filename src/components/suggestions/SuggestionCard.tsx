import type { Suggestion } from "../../types/suggestion";
import { METHOD_LABEL, STATUS_META, pct } from "../../lib/utils";

interface Props {
  suggestion: Suggestion;
  siteName: string;
  selected: boolean;
  onOpen: () => void;
  onAccept: () => void;
  onReject: () => void;
  onUndo: () => void;
}

export default function SuggestionCard({
  suggestion: s,
  siteName,
  selected,
  onOpen,
  onAccept,
  onReject,
  onUndo,
}: Props) {
  const meta = STATUS_META[s.status];
  const targetTitle = s.target_article?.title ?? s.external_title ?? s.external_url ?? "";

  return (
    <div
      onClick={onOpen}
      className={`flex animate-rowIn cursor-pointer items-center gap-4 rounded-2xl border bg-white px-5 py-4 transition-shadow hover:shadow-[0_4px_16px_rgba(0,0,0,.04)] ${
        selected ? "border-stone-950" : "border-stone-200"
      }`}
    >
      <span className={`h-2 w-2 flex-none rounded-full ${meta.dot}`} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-2 text-[15px]">
          <span className="font-medium text-stone-950">{s.source_article.title}</span>
          <span className="text-stone-400">→</span>
          <span className="text-stone-600">{targetTitle}</span>
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-2.5">
          {s.anchor_text && (
            <span className="rounded-full bg-chip px-3 py-0.5 text-[13px] text-stone-800">
              “{s.anchor_text}”
            </span>
          )}
          <span className="text-[13px] text-stone-400">{siteName}</span>
          <span className="rounded-full border border-stone-200 px-2 py-0.5 text-[11px] uppercase tracking-wide text-stone-500">
            {METHOD_LABEL[s.method] ?? s.method}
          </span>
          {s.trust_score !== null && (
            <span className="text-[13px] text-stone-400">trust {pct(s.trust_score)}</span>
          )}
        </div>
      </div>
      <div className="w-[104px] flex-none text-right">
        <div className="text-base font-medium text-stone-950">{pct(s.score)}</div>
        <div className="mb-1 mt-1.5 h-[3px] overflow-hidden rounded bg-stone-200">
          <div className="h-full rounded bg-stone-800" style={{ width: pct(s.score) }} />
        </div>
        <div className="text-[11.5px] text-stone-400">{METHOD_LABEL[s.method] ?? s.method}</div>
      </div>
      <div className="flex w-[190px] flex-none items-center justify-end gap-1.5">
        {s.status === "pending" ? (
          <>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAccept();
              }}
              className="rounded-full border border-stone-800 bg-stone-800 px-4 py-2 text-sm font-medium text-white hover:bg-stone-950"
            >
              Accept
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
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
            {s.status !== "applied" && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onUndo();
                }}
                className="rounded-full border border-stone-300 px-3 py-2 text-[13px] font-medium text-stone-500 hover:border-stone-950 hover:text-stone-950"
              >
                Undo
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

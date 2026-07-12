import type { Suggestion } from "../../types/suggestion";
import { METHOD_LABEL, pct } from "../../lib/utils";

interface Props {
  suggestion: Suggestion;
  siteName: string;
  onClose: () => void;
  onAccept: () => void;
  onReject: () => void;
}

export default function SuggestionPreview({
  suggestion: s,
  siteName,
  onClose,
  onAccept,
  onReject,
}: Props) {
  const targetTitle = s.target_article?.title ?? s.external_title ?? "";
  const targetUrl = s.target_article?.url ?? s.external_url ?? "";
  const slug = targetUrl.replace(/^https?:\/\/[^/]+/, "") || targetUrl;

  return (
    <div className="w-[410px] flex-none overflow-y-auto border-l border-stone-200 bg-stone-50 p-7">
      <div className="mb-5 flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-widest text-stone-400">
          Suggestion #{String(s.id).padStart(3, "0")}
        </div>
        <button
          onClick={onClose}
          className="px-1.5 py-1 text-base text-stone-400 hover:text-stone-950"
        >
          ✕
        </button>
      </div>

      <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-stone-400">
        Source article
      </div>
      <div className="font-serif text-2xl leading-snug">{s.source_article.title}</div>
      <div className="mb-4 mt-1.5 text-[13px] text-stone-500">
        {siteName} ·{" "}
        <a href={s.source_article.url} target="_blank" rel="noreferrer" className="underline underline-offset-2">
          open article
        </a>
      </div>

      <div className="rounded-2xl border border-stone-200 bg-white px-5 py-5 text-[15px] leading-relaxed text-stone-600">
        …{s.context_before}
        {s.anchor_text && (
          <mark className="rounded-[3px] bg-chip px-1 font-medium text-stone-950 underline underline-offset-2">
            {s.anchor_text}
          </mark>
        )}
        {s.context_after}…
      </div>

      <div className="mb-2 mt-5 text-xs font-semibold uppercase tracking-widest text-stone-400">
        Links to →
      </div>
      <div className="rounded-2xl bg-chip px-4 py-4">
        <div className="text-[15px] font-medium leading-snug text-stone-950">{targetTitle}</div>
        <div className="mt-1 text-[12.5px] text-stone-500">{slug}</div>
      </div>

      <div className="my-5 grid grid-cols-2 gap-2.5">
        <div className="relative overflow-hidden rounded-2xl border border-stone-200 bg-white px-4 py-4">
          <div className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-[radial-gradient(circle,rgba(168,200,232,.4),transparent_70%)]" />
          <div className="text-[11px] font-semibold uppercase tracking-widest text-stone-400">
            {METHOD_LABEL[s.method] ?? s.method}
          </div>
          <div className="mt-1.5 font-serif text-3xl text-stone-950">{pct(s.score)}</div>
        </div>
        <div className="rounded-2xl border border-stone-200 bg-white px-4 py-4">
          <div className="text-[11px] font-semibold uppercase tracking-widest text-stone-400">
            Trust score
          </div>
          <div className="mt-1.5 font-serif text-3xl text-stone-400">
            {s.trust_score !== null ? pct(s.trust_score) : "—"}
          </div>
        </div>
      </div>

      {s.status === "pending" ? (
        <div className="flex gap-2">
          <button
            onClick={onAccept}
            className="flex-1 rounded-full border border-stone-800 bg-stone-800 py-3 text-[15px] font-medium text-white hover:bg-stone-950"
          >
            Accept & queue placement
          </button>
          <button
            onClick={onReject}
            className="rounded-full border border-stone-300 px-[18px] py-3 text-[15px] font-medium text-stone-950 hover:border-stone-950"
          >
            Reject
          </button>
        </div>
      ) : (
        <div className="rounded-full bg-chip px-4 py-3 text-center text-sm font-medium text-stone-800">
          {s.status === "applied" ? "Applied to the live article" : `Marked ${s.status}`}
        </div>
      )}
      <div className="mt-3 text-[12.5px] leading-normal text-stone-400">
        Accepted links are written back via the WP REST API on the next publish batch.
      </div>
    </div>
  );
}

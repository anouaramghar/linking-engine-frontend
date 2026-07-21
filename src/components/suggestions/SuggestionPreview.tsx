import { METHOD_LABEL, PUBLICATION_STATUS_MESSAGE, STATUS_META, pct } from "../../lib/utils";
import type { Suggestion } from "../../types/suggestion";

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
  const slug = s.target_article.url.replace(/^https?:\/\/[^/]+/, "") || s.target_article.url;
  const publicationMessage = PUBLICATION_STATUS_MESSAGE[s.status];

  return (
    <div className="w-[410px] flex-none overflow-y-auto border-l border-stone-200 bg-stone-50 p-7">
      <div className="mb-5 flex items-center justify-between">
        <div className="text-xs font-semibold uppercase tracking-widest text-stone-400">
          Suggestion #{String(s.id).padStart(3, "0")}
        </div>
        <button
          aria-label="Close preview"
          onClick={onClose}
          className="px-1.5 py-1 text-base text-stone-400 hover:text-stone-950"
        >
          x
        </button>
      </div>

      <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-stone-400">
        Source article
      </div>
      <div className="font-serif text-2xl leading-snug">{s.source_article.title}</div>
      <div className="mb-4 mt-1.5 text-[13px] text-stone-500">
        {siteName} -{" "}
        <a
          href={s.source_article.url}
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2"
        >
          open article
        </a>
      </div>

      <div className="mb-2 mt-5 text-xs font-semibold uppercase tracking-widest text-stone-400">
        Links to -&gt;
      </div>
      <div className="rounded-2xl bg-chip px-4 py-4">
        <div className="text-[15px] font-medium leading-snug text-stone-950">
          {s.target_article.title}
        </div>
        <div className="mt-1 text-[12.5px] text-stone-500">{slug}</div>
        {s.anchor_text && (
          <div className="mt-2 text-[12.5px] text-stone-600">
            Suggested anchor: <span className="font-medium">{s.anchor_text}</span>
          </div>
        )}
      </div>

      <div className="my-5">
        <div className="relative overflow-hidden rounded-2xl border border-stone-200 bg-white px-4 py-4">
          <div className="pointer-events-none absolute -right-8 -top-8 h-28 w-28 rounded-full bg-[radial-gradient(circle,rgba(168,200,232,.4),transparent_70%)]" />
          <div className="text-[11px] font-semibold uppercase tracking-widest text-stone-400">
            {METHOD_LABEL[s.method] ?? s.method}
          </div>
          <div className="mt-1.5 font-serif text-3xl text-stone-950">{pct(s.score)}</div>
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
        <div
          className={`rounded-full bg-chip px-4 py-3 text-center text-sm font-medium ${STATUS_META[s.status].fg}`}
        >
          {STATUS_META[s.status].label}
        </div>
      )}

      {publicationMessage && (
        <div
          aria-label="Publish status"
          className="mt-3 rounded-2xl border border-stone-200 bg-white px-4 py-3"
        >
          <div className="text-[11px] font-semibold uppercase tracking-widest text-stone-400">
            Publish status
          </div>
          <div className="mt-1 text-[13px] font-medium text-stone-700">
            {publicationMessage}
          </div>
        </div>
      )}

      {s.status === "pending" && (
        <div className="mt-3 text-[12.5px] leading-normal text-stone-400">
          Accepting this suggestion queues it for a future publish batch.
        </div>
      )}
      {s.status === "rejected" && (
        <div className="mt-3 text-[12.5px] leading-normal text-stone-400">
          Rejected suggestions are not included in publish batches.
        </div>
      )}
    </div>
  );
}

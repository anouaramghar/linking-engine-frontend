interface Props {
  approved: number;
  siteCount: number;
  publishing: boolean;
  onPublish: () => void;
}

/**
 * Approving happens here, but publishing lived only on the Sites page — so an
 * approved backlog could sit unshipped with nothing on this screen saying so.
 */
export default function PublishBanner({
  approved,
  siteCount,
  publishing,
  onPublish,
}: Props) {
  if (approved === 0) return null;

  const noun = approved === 1 ? "suggestion" : "suggestions";
  const scope = siteCount === 1 ? "1 site" : `${siteCount} sites`;

  return (
    <div className="mb-3 flex flex-wrap items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
      <div className="min-w-0 flex-1 text-sm text-stone-700">
        <div className="font-medium text-stone-950">
          {approved} approved {noun} across {scope} {approved === 1 ? "is" : "are"} waiting to
          be published
        </div>
        <div className="mt-0.5 text-xs text-stone-600">
          Approved links are not live on the site until a publish job writes them back.
        </div>
      </div>
      <button
        type="button"
        onClick={onPublish}
        disabled={publishing}
        className="rounded-full border border-stone-800 bg-stone-800 px-4 py-2 text-sm font-medium text-white hover:bg-stone-950 disabled:opacity-50"
      >
        {publishing ? "Queueing…" : `Publish ${scope}`}
      </button>
    </div>
  );
}

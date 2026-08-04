interface Props {
  approved: number;
  siteCount: number;
  publishing: boolean;
  onPublish: () => void;
  onPreview?: () => void;
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
  onPreview,
}: Props) {
  if (approved === 0) return null;

  const noun = approved === 1 ? "suggestion" : "suggestions";
  const scope = siteCount === 1 ? "1 site" : `${siteCount} sites`;

  return (
    // Raised on {colors.surface-strong} rather than tinted: the system carries
    // no warning hue, and the ink pill beside it is already the loud part.
    <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-hairline-strong bg-surface-strong px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="text-body-sm font-medium text-ink">
          {approved} approved {noun} across {scope} {approved === 1 ? "is" : "are"} waiting to
          be published
        </div>
        <div className="mt-1 text-caption text-body">
          Approved links are not live on the site until a publish job writes them back.
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {onPreview && (
          <button type="button" onClick={onPreview} className="btn btn-outline btn-sm">
            Preview edits
          </button>
        )}
        <button
          type="button"
          onClick={onPublish}
          disabled={publishing}
          className="btn btn-primary btn-sm"
        >
          {publishing ? "Queueing…" : `Publish ${scope}`}
        </button>
      </div>
    </div>
  );
}

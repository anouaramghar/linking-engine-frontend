import type { PublicationDryRun } from "../../api/publish";
import Modal from "../Modal";

interface Props {
  siteName: string;
  data: PublicationDryRun | undefined;
  loading: boolean;
  error: boolean;
  publishing: boolean;
  onRetry: () => void;
  onPublish: () => void;
  onClose: () => void;
}

const outcomeLabel = {
  inserted: "In text",
  block: "Read also block",
  already_present: "Already present",
} as const;

export default function PublicationPreviewModal({
  siteName,
  data,
  loading,
  error,
  publishing,
  onRetry,
  onPublish,
  onClose,
}: Props) {
  return (
    <Modal title={`Preview edits · ${siteName}`} onClose={onClose} panelClassName="max-w-6xl">
      {loading && (
        <div role="status" className="py-12 text-center text-body-sm text-muted">
          Preparing placements and reading the live WordPress articles…
        </div>
      )}

      {error && !loading && (
        <div role="alert" className="py-8">
          <div className="text-body-md font-medium text-ink">The preview could not be loaded</div>
          <p className="mt-1 max-w-prose text-body-sm text-body">
            No article was changed. Check the WordPress connection, then try again.
          </p>
          <button type="button" onClick={onRetry} className="btn btn-outline mt-4">
            Try again
          </button>
        </div>
      )}

      {data && !loading && (
        <>
          <div className="flex flex-wrap gap-x-5 gap-y-2 border-b border-hairline pb-4 text-caption text-body">
            <span>{data.previewed} links previewed</span>
            <span>{data.inserted} in text</span>
            <span>{data.block} appended</span>
            <span>{data.already_present} already present</span>
          </div>

          {(data.placements_missing > 0 || data.truncated || data.errors.length > 0) && (
            <div className="border-b border-hairline py-4 text-caption leading-normal text-body">
              {data.placements_missing > 0 && (
                <p>
                  {data.placements_missing} links have no generated placement yet. They appear as
                  appended blocks here. If placement generation succeeds later, those rows may
                  change before publication.
                </p>
              )}
              {data.truncated && (
                <p className="mt-1">Only the first 10 source articles are shown in this preview.</p>
              )}
              {data.errors.length > 0 && (
                <div className="mt-2" role="alert">
                  <div className="font-medium text-ink">
                    {data.errors.length} source {data.errors.length === 1 ? "article was" : "articles were"} unavailable
                  </div>
                  <ul className="mt-1 list-disc space-y-1 pl-5">
                    {data.errors.map((item) => (
                      <li key={item.source_article_id} className="break-words">
                        {item.source_url || `Article ${item.source_article_id}`}: {item.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {data.articles.length === 0 && data.errors.length === 0 ? (
            <div className="py-10 text-center text-body-sm text-muted">
              There are no publishable edits to preview.
            </div>
          ) : (
            <div className="divide-y divide-hairline">
              {data.articles.map((article) => (
                <section key={article.source_article_id} className="py-5 first:pt-4">
                  <h3 className="break-words text-body-md font-medium text-ink">
                    {article.source_url}
                  </h3>
                  <ul className="mt-2 space-y-1 text-caption text-body">
                    {article.links.map((link) => (
                      <li key={link.suggestion_id} className="flex flex-wrap items-center gap-2">
                        <span className="badge">{outcomeLabel[link.outcome]}</span>
                        <span className="min-w-0 break-all">{link.target_url}</span>
                        {link.anchor_text && <span>on “{link.anchor_text}”</span>}
                      </li>
                    ))}
                  </ul>

                  <details className="mt-3">
                    <summary className="touch-target inline-flex cursor-pointer items-center text-caption font-medium text-ink underline underline-offset-2">
                      Compare exact HTML
                    </summary>
                    <div className="mt-3 grid min-w-0 gap-3 lg:grid-cols-2">
                      {[
                        ["Current", article.original_html],
                        ["After publish", article.updated_html],
                      ].map(([label, html]) => (
                        <div key={label} className="min-w-0">
                          <div className="mb-1 text-caption font-medium text-ink">{label}</div>
                          <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-md bg-surface-strong p-3 text-caption leading-normal text-body">
                            {html}
                          </pre>
                        </div>
                      ))}
                    </div>
                  </details>
                </section>
              ))}
            </div>
          )}

          <div className="sticky bottom-0 mt-2 flex flex-wrap justify-end gap-2 border-t border-hairline bg-canvas-soft pt-4">
            <button type="button" onClick={onClose} className="btn btn-outline">
              Close
            </button>
            <button
              type="button"
              onClick={onPublish}
              disabled={publishing || data.articles.length === 0}
              className="btn btn-primary"
            >
              {publishing ? "Queueing…" : "Publish this site"}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}

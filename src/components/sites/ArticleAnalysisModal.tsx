import { useMemo, useState } from "react";

import Modal from "../Modal";
import { useTriggerArticleAnalysis } from "../../hooks/useSuggestions";
import { useSiteArticles } from "../../hooks/useSites";
import { errorDetail, isConflict } from "../../lib/errors";
import type { Site, SiteArticle } from "../../types/site";

const articlePath = (url: string) => url.replace(/^https?:\/\/[^/]+/i, "") || url;

export default function ArticleAnalysisModal({
  site,
  onClose,
  onQueued,
}: {
  site: Site;
  onClose: () => void;
  onQueued: (message: string) => void;
}) {
  const articlesQuery = useSiteArticles(site.id);
  const analysis = useTriggerArticleAnalysis();
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);
  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    if (!query) return articlesQuery.articles;
    return articlesQuery.articles.filter((article) =>
      `${article.title} ${article.url}`.toLocaleLowerCase().includes(query),
    );
  }, [articlesQuery.articles, search]);

  const generate = (article: SiteArticle) => {
    setError(null);
    analysis.mutate(article.id, {
      onSuccess: ({ job_run_id: jobRunId }) => {
        onQueued(
          `Suggestion generation queued for “${article.title}”${jobRunId ? ` as job #${jobRunId}` : ""}.`,
        );
        onClose();
      },
      onError: (cause) =>
        setError(
          isConflict(cause)
            ? "This article or its site changed, has no remaining capacity, or already has analysis running. Refresh and try again."
            : errorDetail(cause, "Suggestion generation could not be queued."),
        ),
    });
  };

  return (
    <Modal
      title={`Generate suggestions for one article`}
      description={`Choose one active source article from ${site.name}. LinkMesh ranks only that source, using the site's active articles as possible targets.`}
      onClose={onClose}
      panelClassName="max-w-3xl"
    >
      <label className="mb-4 block">
        <span className="sr-only">Search articles</span>
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search article title or URL"
          className="field w-full"
        />
      </label>

      {error && <div role="alert" className="mb-3 text-caption text-error-ink">{error}</div>}
      {articlesQuery.isPending && <div role="status" className="text-caption text-muted">Loading articles…</div>}
      {articlesQuery.isError && (
        <div role="alert" className="text-caption text-error-ink">
          Articles could not be loaded. Close this dialog and try again.
        </div>
      )}
      {!articlesQuery.isPending && !articlesQuery.isError && filtered.length === 0 && (
        <div className="rounded-lg border border-hairline bg-canvas-soft px-4 py-5 text-caption text-muted">
          {search.trim() ? "No active articles match this search." : "This site has no active articles."}
        </div>
      )}
      {filtered.length > 0 && (
        <ul className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-hairline">
          {filtered.map((article) => {
            const pending = analysis.isPending && analysis.variables === article.id;
            return (
              <li key={article.id} className="flex items-center gap-3 border-b border-hairline-soft px-3 py-3 last:border-0">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-body-sm font-medium text-ink">{article.title}</div>
                  <div className="mt-1 truncate text-caption text-muted" title={article.url}>
                    {articlePath(article.url)}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => generate(article)}
                  disabled={analysis.isPending}
                  aria-label={`Generate suggestions for ${article.title}`}
                  className="btn btn-primary btn-sm flex-none"
                >
                  {pending ? "Queueing…" : "Generate"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {articlesQuery.hasNextPage && (
        <button
          type="button"
          onClick={() => void articlesQuery.fetchNextPage()}
          disabled={articlesQuery.isFetchingNextPage}
          className="btn btn-outline btn-sm mt-3 self-center"
        >
          {articlesQuery.isFetchingNextPage ? "Loading…" : "Load more articles"}
        </button>
      )}
    </Modal>
  );
}

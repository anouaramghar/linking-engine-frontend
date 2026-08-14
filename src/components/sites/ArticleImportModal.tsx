import { useState } from "react";

import Modal from "../Modal";
import { useImportArticleRows } from "../../hooks/useSites";
import {
  parseArticleCsv,
  type ParsedArticleCsv,
} from "../../lib/articleCsvImport";
import { errorDetail } from "../../lib/errors";
import { formatCount } from "../../lib/utils";
import type { Site } from "../../types/site";

const MAX_ARTICLE_IMPORT_ROWS = 10_000;
const CHIP_ERROR = "border border-error/30 bg-error/5 text-error-ink";

export default function ArticleImportModal({
  site,
  onClose,
}: {
  site: Site;
  onClose: () => void;
}) {
  const importRows = useImportArticleRows();
  const [parsed, setParsed] = useState<ParsedArticleCsv | null>(null);
  const [fileName, setFileName] = useState("");
  const [readError, setReadError] = useState<string | null>(null);
  const [replaceSnapshot, setReplaceSnapshot] = useState(false);
  const result = importRows.data;
  const ready = parsed?.rows.filter((row) => row.article) ?? [];
  const broken = parsed?.rows.filter((row) => !row.article) ?? [];
  const tooMany = ready.length > MAX_ARTICLE_IMPORT_ROWS;
  const blocked = Boolean(parsed?.missingColumns.length) || !ready.length || tooMany;

  const readFile = async (file: File | undefined) => {
    if (!file) return;
    importRows.reset();
    setReadError(null);
    setFileName(file.name);
    try {
      setParsed(parseArticleCsv(await file.text()));
    } catch {
      setParsed(null);
      setReadError("That file could not be read as text.");
    }
  };

  const lineFor = (row: number) => ready[row - 1]?.line ?? row;
  const failures = result
    ? [
        ...broken.map((row) => ({
          key: `file-${row.line}`,
          line: row.line,
          url: null,
          reason: row.error ?? "invalid row",
        })),
        ...result.skipped.map((entry) => ({
          key: `skipped-${entry.row}-${entry.reason}`,
          line: lineFor(entry.row),
          url: entry.url,
          reason: entry.reason,
        })),
        ...result.rejected.map((entry) => ({
          key: `rejected-${entry.row}-${entry.reason}`,
          line: lineFor(entry.row),
          url: entry.url,
          reason: entry.reason,
        })),
      ].sort((a, b) => a.line - b.line)
    : [];

  return (
    <Modal
      title={`Import articles for ${site.name}`}
      onClose={onClose}
      panelClassName="max-w-4xl"
      description={
        <>
          Required column: <code>url</code> or Screaming Frog&apos;s <code>Address</code>. Optional
          columns include <code>Title 1</code>, <code>Content</code>, <code>Indexability Status</code>,
          <code>Status Code</code>, and <code>Canonical Link Element 1</code>. Up to{" "}
          {formatCount(MAX_ARTICLE_IMPORT_ROWS)} rows.
        </>
      }
    >
      {!result && (
        <label className="mb-4 flex-none cursor-pointer rounded-lg border border-dashed border-hairline-control bg-surface-card px-4 py-6 text-center text-caption hover:border-ink focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ink">
          <input
            type="file"
            accept=".csv,.tsv,.txt,text/csv"
            className="sr-only"
            onChange={(event) => void readFile(event.target.files?.[0])}
          />
          {fileName ? (
            <span className="font-medium text-ink">{fileName}</span>
          ) : (
            <span className="text-body">Choose a CSV file</span>
          )}
        </label>
      )}

      {readError && <div role="alert" className="mb-3 text-caption text-error-ink">{readError}</div>}

      {parsed && !result && (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="badge">{formatCount(ready.length)} ready</span>
            {broken.length > 0 && <span className="badge">{formatCount(broken.length)} invalid</span>}
          </div>
          {!!parsed.missingColumns.length && (
            <div role="alert" className={`mb-3 rounded-lg px-3 py-2 text-caption ${CHIP_ERROR}`}>
              Missing required column: {parsed.missingColumns.join(", ")}
            </div>
          )}
          {tooMany && (
            <div role="alert" className={`mb-3 rounded-lg px-3 py-2 text-caption ${CHIP_ERROR}`}>
              Split this file: it exceeds the {formatCount(MAX_ARTICLE_IMPORT_ROWS)}-row limit.
            </div>
          )}
          <div className="card min-h-0 flex-1 overflow-auto">
            <table className="w-full text-left text-caption">
              <thead className="eyebrow sticky top-0 bg-surface-strong">
                <tr>
                  <th className="px-3 py-2">Line</th>
                  <th className="px-3 py-2">URL</th>
                  <th className="px-3 py-2">Title</th>
                  <th className="px-3 py-2">Indexability</th>
                </tr>
              </thead>
              <tbody>
                {parsed.rows.map((row) => (
                  <tr key={row.line} className="border-t border-hairline-soft">
                    <td className="px-3 py-2 tabular-nums text-muted">{row.line}</td>
                    {row.article ? (
                      <>
                        <td className="max-w-xs truncate px-3 py-2 text-body" title={row.article.url}>
                          {row.article.url}
                        </td>
                        <td className="px-3 py-2 text-ink">{row.article.title || "—"}</td>
                        <td className="px-3 py-2 text-body">{row.article.indexability || "—"}</td>
                      </>
                    ) : (
                      <td colSpan={3} className="px-3 py-2 text-error-ink">{row.error}</td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <label className="mt-4 flex items-start gap-3 text-caption text-body">
            <input
              type="checkbox"
              checked={replaceSnapshot}
              onChange={(event) => setReplaceSnapshot(event.target.checked)}
              className="mt-0.5"
            />
            <span>
              Replace this site&apos;s active article snapshot. Leave unchecked to enrich only the
              URLs in this file and keep other crawled pages active.
            </span>
          </label>
        </>
      )}

      {result && (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mb-3 flex flex-wrap gap-2">
            <span className="badge"><span className="dot bg-success" />{formatCount(result.imported)} imported</span>
            {result.updated > 0 && <span className="badge">{formatCount(result.updated)} updated</span>}
            {result.skipped.length > 0 && <span className="badge">{formatCount(result.skipped.length)} skipped</span>}
            {result.rejected.length > 0 && <span className={`badge ${CHIP_ERROR}`}>{formatCount(result.rejected.length)} rejected</span>}
          </div>
          {failures.length > 0 && (
            <ul className="card text-caption">
              {failures.map((entry) => (
                <li key={entry.key} className="flex gap-3 border-b border-hairline-soft px-3 py-2 last:border-0">
                  <span className="tabular-nums text-muted">line {entry.line}</span>
                  {entry.url && <span className="truncate text-body">{entry.url}</span>}
                  <span className="ml-auto shrink-0 text-muted">{entry.reason}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {importRows.isError && (
        <div role="alert" className="mt-3 text-caption text-error-ink">
          {errorDetail(importRows.error, "The article import request failed.")}
        </div>
      )}

      <div className="mt-6 flex flex-none gap-2">
        {!result && (
          <button
            type="button"
            disabled={blocked || importRows.isPending}
            onClick={() =>
              importRows.mutate({
                siteId: site.id,
                rows: ready.map((row) => row.article!),
                replaceSnapshot,
              })
            }
            className="btn btn-primary flex-1"
          >
            {importRows.isPending ? "Importing…" : `Import ${ready.length || ""} articles`.trim()}
          </button>
        )}
        <button type="button" onClick={onClose} className={`btn ${result ? "btn-primary flex-1" : "btn-outline"}`}>
          {result ? "Done" : "Cancel"}
        </button>
      </div>
    </Modal>
  );
}

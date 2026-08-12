import { useState } from "react";

import Modal from "../Modal";
import { useBulkCreateSites } from "../../hooks/useSites";
import { MAX_BULK_SITES, parseSiteCsv, type ParsedCsv } from "../../lib/csvImport";
import { errorDetail } from "../../lib/errors";
import { formatCount } from "../../lib/utils";

const TEMPLATE = [
  "name,base_url,platform,wp_username,wp_app_password",
  "The Trail Post,https://trail.example.com,wordpress,editor,xxxx xxxx xxxx xxxx",
  "Static Docs,https://docs.example.com,html,,",
  "Industry Feed,https://news.example.com/feed.xml,pool,,",
  "",
].join("\n");

/**
 * Import outcomes read as {component.badge-pill}s. Each count already names
 * itself ("3 imported", "1 rejected by API"), so only the failure chip takes
 * {colors.semantic-error} — the rest stay neutral rather than inventing a
 * success and a warning hue the system does not have.
 */
const CHIP_ERROR = "border border-error/30 bg-error/5 text-error-ink";

export default function BulkImportModal({ onClose }: { onClose: () => void }) {
  const bulk = useBulkCreateSites();
  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [fileName, setFileName] = useState("");
  const [readError, setReadError] = useState<string | null>(null);

  const ready = parsed?.rows.filter((row) => row.site) ?? [];
  const broken = parsed?.rows.filter((row) => !row.site) ?? [];
  const tooMany = ready.length > MAX_BULK_SITES;
  const blocked = !!parsed?.missingColumns.length || !ready.length || tooMany;
  const result = bulk.data;

  const readFile = async (file: File | undefined) => {
    if (!file) return;
    bulk.reset();
    setReadError(null);
    setFileName(file.name);
    try {
      setParsed(parseSiteCsv(await file.text()));
    } catch {
      setReadError("That file could not be read as text.");
      setParsed(null);
    }
  };

  // The API reports outcomes by position in the submitted list; translate back to file lines.
  const lineFor = (row: number) => ready[row - 1]?.line ?? row;
  const failures = result
    ? [
        ...broken.map((row) => ({
          key: `file-${row.line}`,
          line: row.line,
          baseUrl: null,
          reason: row.error ?? "invalid row",
        })),
        ...result.skipped.map((entry) => ({
          key: `skipped-${entry.row}-${entry.reason}`,
          line: lineFor(entry.row),
          baseUrl: entry.base_url,
          reason: entry.reason,
        })),
        ...result.rejected.map((entry) => ({
          key: `rejected-${entry.row}-${entry.reason}`,
          line: lineFor(entry.row),
          baseUrl: entry.base_url,
          reason: entry.reason,
        })),
      ].sort((a, b) => a.line - b.line)
    : [];

  return (
    <Modal title="Import sites from CSV" onClose={onClose} panelClassName="max-w-3xl">
      <p className="-mt-3 mb-5 flex-none text-caption text-muted">
        Columns: <code>name</code>, <code>base_url</code> (required), plus optional{" "}
        <code>platform</code> (<code>wordpress</code>, <code>html</code>, or <code>pool</code>),{" "}
        <code>wp_username</code>, <code>wp_app_password</code>. Up to{" "}
        {formatCount(MAX_BULK_SITES)} sites per file.{" "}
        <a
          href={`data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE)}`}
          download="linkmesh-sites.csv"
          className="underline underline-offset-2 hover:text-ink"
        >
          Download a template
        </a>
      </p>

      {!result && (
        // `sr-only`, never `hidden`: display:none takes the input out of the
        // tab order and out of the accessibility tree entirely, which left the
        // whole import unreachable without a mouse. Clipped, it still focuses,
        // and `focus-within` moves its ring onto the drop zone the user sees.
        <label className="mb-4 flex-none cursor-pointer rounded-lg border border-dashed border-hairline-control bg-surface-card px-4 py-6 text-center text-caption hover:border-ink focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ink">
          <input
            type="file"
            accept=".csv,.tsv,.txt,text/csv"
            className="sr-only"
            onChange={(e) => readFile(e.target.files?.[0])}
          />
          {fileName ? (
            <span className="font-medium text-ink">{fileName}</span>
          ) : (
            <span className="text-body">Choose a CSV file</span>
          )}
          <span className="ml-2 text-muted">— click or press Enter to browse</span>
        </label>
      )}

      {readError && (
        <div role="alert" className="mb-3 flex-none text-caption text-error-ink">
          {readError}
        </div>
      )}

      {parsed && !result && (
        <>
          <div className="mb-3 flex flex-none flex-wrap items-center gap-2">
            <span className="badge">{formatCount(ready.length)} ready</span>
            {broken.length > 0 && (
              <span className="badge">{formatCount(broken.length)} skipped</span>
            )}
            {parsed.rows.some((row) => row.site?.wp_app_password) && (
              <span className="text-caption text-muted">
                This file contains application passwords — delete it after importing.
              </span>
            )}
          </div>

          {!!parsed.missingColumns.length && (
            <div
              role="alert"
              className="mb-3 flex-none rounded-lg border border-error/30 bg-error/5 px-3 py-2 text-caption text-error-ink"
            >
              Missing required {parsed.missingColumns.length === 1 ? "column" : "columns"}:{" "}
              {parsed.missingColumns.join(", ")}
            </div>
          )}
          {tooMany && (
            <div
              role="alert"
              className="mb-3 flex-none rounded-lg border border-error/30 bg-error/5 px-3 py-2 text-caption text-error-ink"
            >
              {formatCount(ready.length)} rows exceeds the {formatCount(MAX_BULK_SITES)}-site
              limit — split the file.
            </div>
          )}

          {/* Preview rows carry raw URLs, which do not wrap. The card scrolls
              in both directions so a long one never pushes the panel wider. */}
          <div className="card min-h-0 flex-1 overflow-auto">
            <table className="w-full text-left text-caption">
              <thead className="eyebrow sticky top-0 bg-surface-strong">
                <tr>
                  <th className="px-3 py-2">Line</th>
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">URL</th>
                  <th className="px-3 py-2">Platform</th>
                </tr>
              </thead>
              <tbody>
                {parsed.rows.map((row) => (
                  <tr key={row.line} className="border-t border-hairline-soft">
                    <td className="px-3 py-2 tabular-nums text-muted">{row.line}</td>
                    {row.site ? (
                      <>
                        <td className="px-3 py-2 text-ink">{row.site.name}</td>
                        <td className="px-3 py-2 text-body">{row.site.base_url}</td>
                        <td className="px-3 py-2 text-body">{row.site.platform}</td>
                      </>
                    ) : (
                      <td colSpan={3} className="px-3 py-2 text-error-ink">
                        {row.error}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {result && (
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mb-3 flex flex-wrap gap-2">
            <span className="badge">
              <span className="dot bg-success" />
              {formatCount(result.created.length)} imported
            </span>
            {result.skipped.length > 0 && (
              <span className="badge">{formatCount(result.skipped.length)} already existed</span>
            )}
            {broken.length > 0 && (
              <span className="badge">{formatCount(broken.length)} invalid in file</span>
            )}
            {result.rejected.length > 0 && (
              <span className={`badge ${CHIP_ERROR}`}>
                {formatCount(result.rejected.length)} rejected by API
              </span>
            )}
          </div>
          {failures.length > 0 && (
            <ul className="card text-caption">
              {failures.map((entry) => (
                <li
                  key={entry.key}
                  className="flex gap-3 border-b border-hairline-soft px-3 py-2 last:border-0"
                >
                  <span className="tabular-nums text-muted">line {entry.line}</span>
                  {entry.baseUrl && <span className="truncate text-body">{entry.baseUrl}</span>}
                  <span className="ml-auto shrink-0 text-muted">{entry.reason}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {bulk.isError && (
        <div role="alert" className="mt-3 flex-none text-caption text-error-ink">
          {errorDetail(bulk.error, "The import request failed.")}
        </div>
      )}

      <div className="mt-6 flex flex-none gap-2">
        {!result && (
          <button
            type="button"
            disabled={blocked || bulk.isPending}
            onClick={() => bulk.mutate(ready.map((row) => row.site!))}
            className="btn btn-primary flex-1"
          >
            {bulk.isPending
              ? "Importing…"
              : `Import ${ready.length || ""} ${ready.length === 1 ? "site" : "sites"}`.trim()}
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className={`btn ${result ? "btn-primary flex-1" : "btn-outline"}`}
        >
          {result ? "Done" : "Cancel"}
        </button>
      </div>
    </Modal>
  );
}

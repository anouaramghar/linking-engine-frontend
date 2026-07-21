import { useState } from "react";

import Modal from "../Modal";
import { useBulkCreateSites } from "../../hooks/useSites";
import { MAX_BULK_SITES, parseSiteCsv, type ParsedCsv } from "../../lib/csvImport";
import { errorDetail } from "../../lib/errors";

const TEMPLATE = [
  "name,base_url,platform,wp_username,wp_app_password",
  "The Trail Post,https://trail.example.com,wordpress,editor,xxxx xxxx xxxx xxxx",
  "Static Docs,https://docs.example.com,html,,",
  "",
].join("\n");

const CHIP = "rounded-full px-2 py-0.5 text-xs font-medium";

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
      <p className="-mt-3 mb-5 text-sm text-stone-600">
        Columns: <code>name</code>, <code>base_url</code> (required), plus optional{" "}
        <code>platform</code>, <code>wp_username</code>, <code>wp_app_password</code>. Up to{" "}
        {MAX_BULK_SITES.toLocaleString()} sites per file.{" "}
        <a
          href={`data:text/csv;charset=utf-8,${encodeURIComponent(TEMPLATE)}`}
          download="linkmesh-sites.csv"
          className="underline underline-offset-2 hover:text-stone-950"
        >
          Download a template
        </a>
      </p>

      {!result && (
        <label className="mb-4 cursor-pointer rounded-xl border border-dashed border-stone-300 bg-white px-4 py-6 text-center text-sm hover:border-stone-950">
          <input
            type="file"
            accept=".csv,.tsv,.txt,text/csv"
            className="hidden"
            onChange={(e) => readFile(e.target.files?.[0])}
          />
          {fileName ? (
            <span className="font-medium">{fileName}</span>
          ) : (
            <span className="text-stone-600">Choose a CSV file</span>
          )}
          <span className="ml-2 text-stone-600">— click to browse</span>
        </label>
      )}

      {readError && <div className="mb-3 text-sm text-red-700">{readError}</div>}

      {parsed && !result && (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
            <span className={`${CHIP} bg-emerald-100 text-emerald-900`}>
              {ready.length} ready
            </span>
            {broken.length > 0 && (
              <span className={`${CHIP} bg-amber-100 text-amber-900`}>
                {broken.length} skipped
              </span>
            )}
            {parsed.rows.some((row) => row.site?.wp_app_password) && (
              <span className="text-stone-600">
                This file contains application passwords — delete it after importing.
              </span>
            )}
          </div>

          {!!parsed.missingColumns.length && (
            <div className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
              Missing required {parsed.missingColumns.length === 1 ? "column" : "columns"}:{" "}
              {parsed.missingColumns.join(", ")}
            </div>
          )}
          {tooMany && (
            <div className="mb-3 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
              {ready.length.toLocaleString()} rows exceeds the {MAX_BULK_SITES.toLocaleString()}
              -site limit — split the file.
            </div>
          )}

          <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-stone-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-stone-100 text-xs uppercase text-stone-600">
                <tr>
                  <th className="px-3 py-2 font-medium">Line</th>
                  <th className="px-3 py-2 font-medium">Name</th>
                  <th className="px-3 py-2 font-medium">URL</th>
                  <th className="px-3 py-2 font-medium">Platform</th>
                </tr>
              </thead>
              <tbody>
                {parsed.rows.map((row) => (
                  <tr key={row.line} className="border-t border-stone-100">
                    <td className="px-3 py-2 tabular-nums text-stone-600">{row.line}</td>
                    {row.site ? (
                      <>
                        <td className="px-3 py-2">{row.site.name}</td>
                        <td className="px-3 py-2 text-stone-600">{row.site.base_url}</td>
                        <td className="px-3 py-2 text-stone-600">{row.site.platform}</td>
                      </>
                    ) : (
                      <td colSpan={3} className="px-3 py-2 text-amber-700">
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
          <div className="mb-3 flex flex-wrap gap-2 text-sm">
            <span className={`${CHIP} bg-emerald-100 text-emerald-900`}>
              {result.created.length} imported
            </span>
            {result.skipped.length > 0 && (
              <span className={`${CHIP} bg-stone-200 text-stone-700`}>
                {result.skipped.length} already existed
              </span>
            )}
            {broken.length > 0 && (
              <span className={`${CHIP} bg-amber-100 text-amber-900`}>
                {broken.length} invalid in file
              </span>
            )}
            {result.rejected.length > 0 && (
              <span className={`${CHIP} bg-red-100 text-red-900`}>
                {result.rejected.length} rejected by API
              </span>
            )}
          </div>
          {failures.length > 0 && (
            <ul className="rounded-xl border border-stone-200 bg-white text-sm">
              {failures.map((entry) => (
                <li
                  key={entry.key}
                  className="flex gap-3 border-b border-stone-100 px-3 py-2 last:border-0"
                >
                  <span className="tabular-nums text-stone-600">line {entry.line}</span>
                  {entry.baseUrl && (
                    <span className="truncate text-stone-600">{entry.baseUrl}</span>
                  )}
                  <span className="ml-auto shrink-0 text-stone-600">{entry.reason}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {bulk.isError && (
        <div role="alert" className="mt-3 text-sm text-red-700">
          {errorDetail(bulk.error, "The import request failed.")}
        </div>
      )}

      <div className="mt-6 flex gap-2">
        {!result && (
          <button
            type="button"
            disabled={blocked || bulk.isPending}
            onClick={() => bulk.mutate(ready.map((row) => row.site!))}
            className="flex-1 rounded-full border border-stone-800 bg-stone-800 py-2.5 text-[15px] font-medium text-white hover:bg-stone-950 disabled:opacity-50"
          >
            {bulk.isPending
              ? "Importing…"
              : `Import ${ready.length || ""} ${ready.length === 1 ? "site" : "sites"}`.trim()}
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className={`rounded-full border px-5 py-2.5 text-[15px] font-medium ${
            result
              ? "flex-1 border-stone-800 bg-stone-800 text-white hover:bg-stone-950"
              : "border-stone-300 hover:border-stone-950"
          }`}
        >
          {result ? "Done" : "Cancel"}
        </button>
      </div>
    </Modal>
  );
}

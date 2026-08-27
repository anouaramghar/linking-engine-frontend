import { useCallback, useState } from "react";

import { downloadBlob } from "../lib/utils";

export type CsvExportStatus = "idle" | "success" | "error";

/**
 * One small interface for CSV downloads: request, download, and user feedback
 * stay together instead of each page implementing a slightly different copy.
 */
export function useCsvExport(request: () => Promise<Blob>, filename: string) {
  const [isExporting, setIsExporting] = useState(false);
  const [status, setStatus] = useState<CsvExportStatus>("idle");

  const exportCsv = useCallback(async () => {
    if (isExporting) return;
    setIsExporting(true);
    setStatus("idle");
    try {
      const blob = await request();
      downloadBlob(blob, filename);
      setStatus("success");
    } catch {
      setStatus("error");
    } finally {
      setIsExporting(false);
    }
  }, [filename, isExporting, request]);

  return { exportCsv, isExporting, status };
}

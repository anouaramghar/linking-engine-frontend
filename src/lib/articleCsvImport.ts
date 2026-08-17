import { parseDelimitedText } from "./csvImport";

export interface ArticleImportRow {
  url: string;
  title?: string;
  content_text?: string;
  content_html?: string;
  canonical_url?: string;
  status_code?: number;
  indexability?: string;
  discovered_from?: string;
  discovery_depth?: number;
}

export interface ArticleImportPreviewRow {
  line: number;
  article: ArticleImportRow | null;
  error: string | null;
}

export interface ParsedArticleCsv {
  rows: ArticleImportPreviewRow[];
  headers: string[];
  missingColumns: string[];
}

type ArticleField = keyof ArticleImportRow;

const HEADER_ALIASES: Record<string, ArticleField> = {
  url: "url",
  address: "url",
  title: "title",
  title_1: "title",
  content: "content_text",
  content_1: "content_text",
  content_text: "content_text",
  html: "content_html",
  content_html: "content_html",
  canonical: "canonical_url",
  canonical_url: "canonical_url",
  canonical_link_element_1: "canonical_url",
  status: "status_code",
  status_code: "status_code",
  status_code_1: "status_code",
  indexability: "indexability",
  indexability_status: "indexability",
  discovered_from: "discovered_from",
  discovery_depth: "discovery_depth",
};

const normalizeHeader = (header: string) =>
  header.trim().toLowerCase().replace(/[\s-]+/g, "_");

export const parseArticleCsv = (text: string): ParsedArticleCsv => {
  const source = text.replace(/^\uFEFF/, "");
  if (!source.trim()) return { rows: [], headers: [], missingColumns: ["url"] };
  const table = parseDelimitedText(source, sniffDelimiter(source.split("\n", 1)[0]));
  const rawHeaders = table.shift() ?? [];
  const headers = rawHeaders.map((header) => HEADER_ALIASES[normalizeHeader(header)] ?? normalizeHeader(header));
  const missingColumns = headers.includes("url") ? [] : ["url"];
  const rows = table.flatMap((cells, index): ArticleImportPreviewRow[] => {
    if (cells.every((cell) => !cell.trim())) return [];
    const record: Record<string, string> = {};
    headers.forEach((header, column) => {
      if (HEADER_ALIASES[header]) record[HEADER_ALIASES[header]] = (cells[column] ?? "").trim();
    });
    if (!record.url) return [{ line: index + 2, article: null, error: "url is empty" }];
    const article: ArticleImportRow = { url: record.url };
    for (const field of [
      "title",
      "content_text",
      "content_html",
      "canonical_url",
      "indexability",
      "discovered_from",
    ] as const) {
      if (record[field]) article[field] = record[field];
    }
    if (record.status_code) {
      const status = Number(record.status_code);
      if (!Number.isInteger(status)) {
        return [{ line: index + 2, article: null, error: "status_code must be an integer" }];
      }
      article.status_code = status;
    }
    if (record.discovery_depth) {
      const depth = Number(record.discovery_depth);
      if (!Number.isInteger(depth) || depth < 0) {
        return [{ line: index + 2, article: null, error: "discovery_depth must be a non-negative integer" }];
      }
      article.discovery_depth = depth;
    }
    return [{ line: index + 2, article, error: null }];
  });
  return { rows, headers, missingColumns };
};

const sniffDelimiter = (headerLine: string) =>
  [",", ";", "\t"].reduce(
    (best, candidate) =>
      headerLine.split(candidate).length > headerLine.split(best).length ? candidate : best,
    ",",
  );

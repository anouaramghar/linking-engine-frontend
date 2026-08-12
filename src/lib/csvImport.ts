import type { SiteCreate } from "../types/site";

/** A data row after mapping — either importable, or annotated with why it is not. */
export interface ImportRow {
  line: number; // 1-based CSV line number, so the preview points at the real file
  site: SiteCreate | null;
  error: string | null;
}

export interface ParsedCsv {
  rows: ImportRow[];
  headers: string[];
  missingColumns: string[];
}

type SiteField = keyof SiteCreate;

export interface SiteCsvOptions {
  defaultPlatform?: SiteCreate["platform"];
  allowedPlatforms?: readonly SiteCreate["platform"][];
  allowWordPressCredentials?: boolean;
  requireHttps?: boolean;
}

interface DelimitedRow {
  cells: string[];
  line: number;
}

/** Mirrors MAX_BULK_SITES in the API's site schema; keep the two in step. */
export const MAX_BULK_SITES = 1000;

const REQUIRED_COLUMNS: SiteField[] = ["name", "base_url"];

const SITE_FIELDS: SiteField[] = [
  "name",
  "base_url",
  "platform",
  "wp_username",
  "wp_app_password",
];

// Clients export from Excel, Sheets, and hand-rolled scripts; accept the obvious spellings
// rather than making someone re-title 400 rows.
const HEADER_ALIASES: Record<string, SiteField> = {
  name: "name",
  site: "name",
  site_name: "name",
  title: "name",
  base_url: "base_url",
  url: "base_url",
  site_url: "base_url",
  domain: "base_url",
  platform: "platform",
  type: "platform",
  wp_username: "wp_username",
  wp_user: "wp_username",
  username: "wp_username",
  user: "wp_username",
  wp_app_password: "wp_app_password",
  wp_password: "wp_app_password",
  app_password: "wp_app_password",
  password: "wp_app_password",
};

const DELIMITERS = [",", ";", "\t"];

/** Excel writes semicolons in several locales, and tab-separated exports are common. */
const sniffDelimiter = (headerLine: string) =>
  DELIMITERS.reduce(
    (best, candidate) =>
      headerLine.split(candidate).length > headerLine.split(best).length ? candidate : best,
    ",",
  );

const normalizeHeader = (header: string) =>
  header.trim().toLowerCase().replace(/[\s-]+/g, "_");

/** RFC 4180 tokenizer that retains each record's physical starting line. */
const parseDelimitedRows = (text: string, delimiter: string): DelimitedRow[] => {
  const rows: DelimitedRow[] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let line = 1;
  let rowLine = 1;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (quoted) {
      if (char !== '"') {
        field += char;
        if (char === "\n") line++;
      } else if (text[i + 1] === '"') {
        field += '"';
        i++; // consume the escaped pair
      } else {
        quoted = false;
      }
      continue;
    }

    if (char === '"') quoted = true;
    else if (char === delimiter) {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push({ cells: row, line: rowLine });
      row = [];
      field = "";
      line++;
      rowLine = line;
    } else if (char !== "\r") field += char;
  }

  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push({ cells: row, line: rowLine });
  }
  return rows;
};

/** RFC 4180 tokenizer: honours quoted fields, "" escapes, and newlines inside quotes. */
export const parseDelimitedText = (text: string, delimiter: string): string[][] =>
  parseDelimitedRows(text, delimiter).map((row) => row.cells);

const toSite = (
  cells: Record<string, string>,
  options: SiteCsvOptions,
): { site: SiteCreate | null; error: string | null } => {
  const name = cells.name ?? "";
  const base_url = cells.base_url ?? "";
  if (!name) return { site: null, error: "name is empty" };
  if (!base_url) return { site: null, error: "base_url is empty" };

  // Absent or blank platform means the common case: a WordPress site.
  const platform = (cells.platform || options.defaultPlatform || "wordpress").toLowerCase();
  if (platform !== "wordpress" && platform !== "html" && platform !== "pool") {
    return { site: null, error: `unknown platform "${cells.platform}"` };
  }
  if (
    options.allowedPlatforms &&
    !options.allowedPlatforms.includes(platform as SiteCreate["platform"])
  ) {
    return { site: null, error: `platform "${platform}" is not allowed in this import` };
  }

  if (!/^https?:\/\/\S+$/i.test(base_url)) {
    return { site: null, error: "base_url must start with http:// or https://" };
  }
  if (options.requireHttps && !/^https:\/\/\S+$/i.test(base_url)) {
    return { site: null, error: "content-pool base_url must start with https://" };
  }

  const wp_username = cells.wp_username || undefined;
  const wp_app_password = cells.wp_app_password || undefined;
  if (options.allowWordPressCredentials === false && (wp_username || wp_app_password)) {
    return { site: null, error: "WordPress credentials are not allowed for content-pool sources" };
  }
  if (Boolean(wp_username) !== Boolean(wp_app_password)) {
    return { site: null, error: "wp_username and wp_app_password must be filled in together" };
  }

  return {
    site: { name, base_url, platform, wp_username, wp_app_password },
    error: null,
  };
};

/** Trailing-slash normalization matches the backend, so the preview matches what lands. */
export const normalizeBaseUrl = (url: string) => url.replace(/\/+$/, "");

export const parseSiteCsv = (text: string, options: SiteCsvOptions = {}): ParsedCsv => {
  const source = text.replace(/^\uFEFF/, ""); // Excel prefixes a BOM
  if (!source.trim()) return { rows: [], headers: [], missingColumns: REQUIRED_COLUMNS };

  const delimiter = sniffDelimiter(source.split("\n", 1)[0]);
  const table = parseDelimitedRows(source, delimiter);
  const headerCells = (table.shift()?.cells ?? []).map(normalizeHeader);
  const headers = headerCells.map((header) => HEADER_ALIASES[header] ?? header);
  const missingColumns = REQUIRED_COLUMNS.filter((column) => !headers.includes(column));

  const seen = new Set<string>();
  const rows = table.map(({ cells, line }): ImportRow | null => {
    if (cells.every((cell) => !cell.trim())) return null; // tolerate blank spacer lines

    const record: Record<string, string> = {};
    headers.forEach((header, column) => {
      if (SITE_FIELDS.includes(header as SiteField)) {
        record[header] = (cells[column] ?? "").trim();
      }
    });

    const { site, error } = toSite(record, options);
    if (error) return { line, site: null, error };

    const key = normalizeBaseUrl(site!.base_url);
    if (seen.has(key)) return { line, site: null, error: "duplicate base_url in this file" };
    seen.add(key);
    return { line, site, error: null };
  });

  return { rows: rows.filter((row): row is ImportRow => row !== null), headers, missingColumns };
};

export const poolSourceType = (url: string) => {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (
      (host === "wikipedia.org" || host.endsWith(".wikipedia.org")) &&
      parsed.pathname.startsWith("/wiki/") &&
      parsed.pathname !== "/wiki/"
    ) {
      return "Wikipedia";
    }
  } catch {
    // Invalid URLs are reported by parseSiteCsv; previews call this only for valid rows.
  }
  return "RSS/Atom candidate";
};

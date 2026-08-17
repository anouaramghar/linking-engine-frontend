import { describe, expect, it } from "vitest";

import { parseDelimitedText, parseSiteCsv, poolSourceType } from "./csvImport";

const header = "name,base_url,platform";

describe("parseDelimitedText", () => {
  it("keeps delimiters and newlines that sit inside quotes", () => {
    const rows = parseDelimitedText('a,"b,c","d\ne"\nf,g,h', ",");
    expect(rows).toEqual([
      ["a", "b,c", "d\ne"],
      ["f", "g", "h"],
    ]);
  });

  it("unescapes doubled quotes", () => {
    expect(parseDelimitedText('"say ""hi""",x', ",")).toEqual([['say "hi"', "x"]]);
  });

  it("reads CRLF files without trailing carriage returns", () => {
    expect(parseDelimitedText("a,b\r\nc,d\r\n", ",")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });
});

describe("parseSiteCsv", () => {
  it("maps a plain file into importable sites", () => {
    const { rows, missingColumns } = parseSiteCsv(
      `${header}\nThe Trail Post,https://trail.example.com,wordpress`,
    );

    expect(missingColumns).toEqual([]);
    expect(rows).toEqual([
      {
        line: 2,
        error: null,
        site: {
          name: "The Trail Post",
          base_url: "https://trail.example.com",
          platform: "wordpress",
          wp_username: undefined,
          wp_app_password: undefined,
        },
      },
    ]);
  });

  it("accepts header aliases and a UTF-8 BOM", () => {
    const { rows, missingColumns } = parseSiteCsv(
      '﻿Site Name,URL\nThe Trail Post,https://trail.example.com',
    );

    expect(missingColumns).toEqual([]);
    expect(rows[0].site).toMatchObject({
      name: "The Trail Post",
      base_url: "https://trail.example.com",
      platform: "wordpress", // defaulted, and shown in the preview
    });
  });

  it("sniffs semicolon-delimited exports", () => {
    const { rows } = parseSiteCsv("name;base_url\nTrail;https://trail.example.com");
    expect(rows[0].site?.base_url).toBe("https://trail.example.com");
  });

  it("accepts content-pool sources", () => {
    const { rows } = parseSiteCsv(`${header}\nNews,https://example.com/feed.xml,pool`);
    expect(rows[0].site?.platform).toBe("pool");
  });

  it("reports the real file line for each bad row and keeps the good ones", () => {
    const { rows } = parseSiteCsv(
      [
        header,
        "Good,https://good.example.com,wordpress",
        ",https://no-name.example.com,wordpress",
        "No URL,,wordpress",
        "Bad platform,https://bad.example.com,drupal",
        "Not a URL,trail.example.com,html",
      ].join("\n"),
    );

    expect(rows.map((row) => [row.line, row.error])).toEqual([
      [2, null],
      [3, "name is empty"],
      [4, "base_url is empty"],
      [5, 'unknown platform "drupal"'],
      [6, "base_url must start with http:// or https://"],
    ]);
  });

  it("keeps physical line numbers after a quoted field spans multiple lines", () => {
    const { rows } = parseSiteCsv(
      [
        header,
        '"First\nSite",https://first.example.com,wordpress',
        "Broken,not-a-url,html",
      ].join("\n"),
    );

    expect(rows.map((row) => [row.line, row.error])).toEqual([
      [2, null],
      [4, "base_url must start with http:// or https://"],
    ]);
  });

  it("flags in-file duplicates, ignoring a trailing slash", () => {
    const { rows } = parseSiteCsv(
      [
        header,
        "First,https://trail.example.com,wordpress",
        "Second,https://trail.example.com/,wordpress",
      ].join("\n"),
    );

    expect(rows[0].error).toBeNull();
    expect(rows[1].error).toBe("duplicate base_url in this file");
  });

  it("requires credentials to arrive as a pair, matching the API", () => {
    const { rows } = parseSiteCsv(
      "name,base_url,wp_username,wp_app_password\nTrail,https://trail.example.com,editor,",
    );

    expect(rows[0].error).toBe("wp_username and wp_app_password must be filled in together");
  });

  it("skips blank spacer lines instead of reporting them as errors", () => {
    const { rows } = parseSiteCsv(
      `${header}\nTrail,https://trail.example.com,wordpress\n,,\n\n`,
    );

    expect(rows).toHaveLength(1);
  });

  it("names the columns a file is missing", () => {
    expect(parseSiteCsv("nickname,platform\nTrail,wordpress").missingColumns).toEqual([
      "name",
      "base_url",
    ]);
    expect(parseSiteCsv("").missingColumns).toEqual(["name", "base_url"]);
  });
});

describe("content-pool CSV mode", () => {
  const options = {
    defaultPlatform: "pool" as const,
    allowedPlatforms: ["pool"] as const,
    allowWordPressCredentials: false,
    requireHttps: true,
  };

  it("forces rows without a platform into the content pool", () => {
    const { rows, missingColumns } = parseSiteCsv(
      [
        "name,base_url",
        "Wikipedia AI,https://en.wikipedia.org/wiki/Artificial_intelligence",
        "Industry feed,https://news.example.com/feed.xml",
      ].join("\n"),
      options,
    );

    expect(missingColumns).toEqual([]);
    expect(rows.map((row) => row.site?.platform)).toEqual(["pool", "pool"]);
    expect(rows.map((row) => poolSourceType(row.site!.base_url))).toEqual([
      "Wikipedia",
      "RSS/Atom candidate",
    ]);
  });

  it("rejects non-pool platforms, insecure URLs, and WordPress credentials", () => {
    const { rows } = parseSiteCsv(
      [
        "name,base_url,platform,wp_username,wp_app_password",
        "Owned,https://owned.example.com,wordpress,,",
        "Insecure,http://news.example.com/feed.xml,pool,,",
        "Credentialed,https://news.example.com/feed.xml,pool,editor,secret",
      ].join("\n"),
      options,
    );

    expect(rows.map((row) => row.error)).toEqual([
      'platform "wordpress" is not allowed in this import',
      "content-pool base_url must start with https://",
      "WordPress credentials are not allowed for content-pool sources",
    ]);
  });
});

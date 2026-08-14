import { describe, expect, it } from "vitest";

import { parseArticleCsv } from "./articleCsvImport";

describe("parseArticleCsv", () => {
  it("maps Screaming Frog headers and preserves row-level errors", () => {
    const parsed = parseArticleCsv(
      [
        "Address,Title 1,Status Code,Indexability Status",
        "https://example.com/a,Article A,200,Indexable",
        "https://example.com/b,Article B,404,Non-Indexable",
        ",Missing URL,200,Indexable",
      ].join("\n"),
    );

    expect(parsed.missingColumns).toEqual([]);
    expect(parsed.rows[0]).toMatchObject({
      line: 2,
      article: {
        url: "https://example.com/a",
        title: "Article A",
        status_code: 200,
        indexability: "Indexable",
      },
      error: null,
    });
    expect(parsed.rows[1].article?.status_code).toBe(404);
    expect(parsed.rows[2]).toEqual({ line: 4, article: null, error: "url is empty" });
  });

  it("sniffs semicolon exports and reports a missing URL column", () => {
    expect(parseArticleCsv("Title;Content\nArticle;Text").missingColumns).toEqual(["url"]);
  });
});

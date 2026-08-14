import { describe, expect, it } from "vitest";

import {
  countChanges,
  diffHtml,
  foldUnchanged,
  tokenizeHtml,
  tokenizeLines,
  type Token,
} from "./htmlDiff";

const kinds = (tokens: Token[]) => tokens.map((token) => [token.kind, token.text]);
const text = (tokens: Token[]) => tokens.map((token) => token.text).join("");

describe("tokenizeHtml", () => {
  it("separates the parts of a tag from the words of the article", () => {
    expect(kinds(tokenizeHtml('<a href="/target">solar panel</a>'))).toEqual([
      ["punct", "<"],
      ["tag", "a"],
      ["punct", " "],
      ["attr", "href"],
      ["punct", "="],
      ["value", '"/target"'],
      ["punct", ">"],
      ["text", "solar panel"],
      ["punct", "</"],
      ["tag", "a"],
      ["punct", ">"],
    ]);
  });

  it("marks comments and doctypes as unrendered", () => {
    expect(kinds(tokenizeHtml("<!doctype html><!-- note -->"))).toEqual([
      ["comment", "<!doctype html>"],
      ["comment", "<!-- note -->"],
    ]);
  });

  /** `a < b` is prose. Reading it as a tag would swallow the rest of the article. */
  it("leaves a bare angle bracket in the text", () => {
    expect(kinds(tokenizeHtml("5 < 6 and <b>true</b>"))).toEqual([
      ["text", "5 "],
      ["text", "<"],
      ["text", " 6 and "],
      ["punct", "<"],
      ["tag", "b"],
      ["punct", ">"],
      ["text", "true"],
      ["punct", "</"],
      ["tag", "b"],
      ["punct", ">"],
    ]);
  });

  /** Whatever it colours, it must never lose or invent a character. */
  it("keeps the document whole", () => {
    const source =
      '<!-- lead -->\n<p class="intro" data-flag>Cost & value <em>now</em></p>\n<img src="x.png"/>';
    expect(text(tokenizeHtml(source))).toBe(source);
  });

  it("cuts lines without keeping the newlines", () => {
    const lines = tokenizeLines("<p>one</p>\r\n<p>two</p>");
    expect(lines.map(text)).toEqual(["<p>one</p>", "<p>two</p>"]);
  });
});

describe("diffHtml", () => {
  const original = "<article>\n  <p>solar panel costs</p>\n</article>";
  const updated =
    '<article>\n  <p><a href="/target">solar panel</a> costs</p>\n</article>';

  it("pairs a rewritten line on one row and marks only what changed", () => {
    const rows = diffHtml(original, updated);

    expect(rows.map((row) => row.kind)).toEqual(["same", "changed", "same"]);
    expect(rows[1].left?.number).toBe(2);
    expect(rows[1].right?.number).toBe(2);

    const marked = (side: "left" | "right") => {
      const line = rows[1][side]!;
      const [from, to] = line.mark!;
      return line.tokens
        .map((token) => token.text)
        .join("")
        .slice(from, to);
    };

    // The words of the article do not change; the anchor around them does. The
    // shared tail — " costs</p>" — stays out of the mark, so what is lit is
    // exactly what this approval writes.
    expect(marked("left")).toBe("solar panel");
    expect(marked("right")).toBe('<a href="/target">solar panel</a>');
  });

  it("leaves an inserted line as a hole on the other side", () => {
    const rows = diffHtml("<p>one</p>\n<p>three</p>", "<p>one</p>\n<p>two</p>\n<p>three</p>");

    expect(rows.map((row) => row.kind)).toEqual(["same", "added", "same"]);
    expect(rows[1].left).toBeNull();
    expect(rows[1].right?.number).toBe(2);
    expect(countChanges(rows)).toEqual({ added: 1, removed: 0 });
  });

  it("reports no change when the approval writes nothing", () => {
    const rows = diffHtml(original, original);

    expect(rows.every((row) => row.kind === "same")).toBe(true);
    expect(countChanges(rows)).toEqual({ added: 0, removed: 0 });
  });

  it("counts both sides of a rewritten line", () => {
    expect(countChanges(diffHtml(original, updated))).toEqual({ added: 1, removed: 1 });
  });
});

describe("foldUnchanged", () => {
  it("keeps the changed lines with their context and folds the rest", () => {
    const before = Array.from({ length: 30 }, (_, index) => `<p>${index}</p>`);
    const after = [...before];
    after[15] = "<p>fifteen</p>";

    const view = foldUnchanged(diffHtml(before.join("\n"), after.join("\n")), 3);
    const folds = view.filter((row) => row.kind === "skipped");

    expect(view.filter((row) => row.kind === "changed")).toHaveLength(1);
    expect(folds).toHaveLength(2);
    // 12 above the change and 11 below it, out of 30 lines.
    expect(folds.reduce((total, fold) => total + (fold as { count: number }).count, 0)).toBe(23);
  });

  it("folds a document that never changed into one run", () => {
    const source = Array.from({ length: 10 }, (_, index) => `<p>${index}</p>`).join("\n");
    const view = foldUnchanged(diffHtml(source, source), 3);

    expect(view).toEqual([{ kind: "skipped", count: 10, from: 1 }]);
  });
});

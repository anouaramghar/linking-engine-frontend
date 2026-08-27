import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import AgentMarkdown from "./AgentMarkdown";

afterEach(cleanup);

const draw = (content: string) => render(<AgentMarkdown content={content} />).container;

describe("AgentMarkdown", () => {
  it("renders a bold figure as emphasis rather than asterisks", () => {
    const container = draw("There are **146 suggestions** pending review.");
    expect(container.querySelector(".assistant-md-strong")?.textContent).toBe("146 suggestions");
    expect(container.textContent).not.toContain("**");
  });

  it("renders an italic article title as emphasis", () => {
    const container = draw("Source: *How to Private Browse*");
    expect(container.querySelector(".assistant-md-em")?.textContent).toBe("How to Private Browse");
    expect(container.textContent).toBe("Source: How to Private Browse");
  });

  it("renders backticked ids as code", () => {
    const container = draw("Method `hybrid_bm25` on site 1.");
    expect(container.querySelector("code")?.textContent).toBe("hybrid_bm25");
  });

  it("builds a bulleted list from the markers the model writes", () => {
    const container = draw("Review queue\n* pending: 146\n- approved: 1");
    const items = container.querySelectorAll(".assistant-md-ul > .assistant-md-li");
    expect(items.length).toBe(2);
    expect(items[0].textContent).toBe("pending: 146");
    expect(items[1].textContent).toBe("approved: 1");
  });

  it("builds a numbered list for ranked answers", () => {
    const container = draw("1. Suggestion 92\n2. Suggestion 93");
    expect(container.querySelectorAll(".assistant-md-ol > .assistant-md-li").length).toBe(2);
  });

  it("nests indented detail inside the entry it belongs to", () => {
    const container = draw("1. Suggestion 92\n   * Score: 0.948\n   * Method: hybrid_bm25");
    const entries = container.querySelectorAll(".assistant-md-ol > .assistant-md-li");
    expect(entries.length).toBe(1);
    expect(entries[0].querySelectorAll(".assistant-md-ul--nested > .assistant-md-li").length).toBe(2);
  });

  it("keeps an indented unmarked line with the entry it describes", () => {
    const container = draw("* Suggestion 92 — score 0.948\n  method: hybrid_bm25, trace 851b975c");
    expect(container.querySelectorAll(".assistant-md-p").length).toBe(0);
    const items = container.querySelectorAll(".assistant-md-li");
    expect(items.length).toBe(1);
    expect(items[0].textContent).toBe("Suggestion 92 — score 0.948 method: hybrid_bm25, trace 851b975c");
  });

  it("keeps a blank line as a paragraph break and a single newline as a soft one", () => {
    const container = draw("First answer.\n\nSecond block.\nSame block, next line.");
    const paragraphs = container.querySelectorAll(".assistant-md-p");
    expect(paragraphs.length).toBe(2);
    expect(paragraphs[1].querySelectorAll("br").length).toBe(1);
  });

  it("links a bare dashboard URL and leaves the sentence's punctuation behind", () => {
    const container = draw("Queue: http://localhost:5173/queue?site=1.");
    const link = container.querySelector("a");
    expect(link?.getAttribute("href")).toBe("http://localhost:5173/queue?site=1");
    expect(link?.getAttribute("rel")).toBe("noopener noreferrer");
    expect(link?.getAttribute("target")).toBe("_blank");
    expect(container.textContent?.endsWith(".")).toBe(true);
  });

  // Replies quote crawled article titles verbatim. These are the cases where a
  // title written by someone else's website tries to become part of the page.
  it("renders markup inside a crawled title as the characters it is made of", () => {
    const container = draw('Source: *<img src=x onerror="alert(1)">*');
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain('<img src=x onerror="alert(1)">');
  });

  it("never builds an anchor from a non-http scheme", () => {
    const container = draw("See javascript:alert(1) and data:text/html,<b>x</b> for details.");
    expect(container.querySelector("a")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
    expect(container.textContent).toContain("javascript:alert(1)");
  });

  it("leaves an unbalanced marker as a literal character", () => {
    const container = draw("A 3 * 4 grid and an unclosed **bold");
    expect(container.querySelector(".assistant-md-strong")).toBeNull();
    expect(container.textContent).toBe("A 3 * 4 grid and an unclosed **bold");
  });

  it("renders nothing for an empty reply without throwing", () => {
    expect(draw("").querySelectorAll(".assistant-md > *").length).toBe(0);
  });

  it("renders a real captured reply as structure rather than punctuation", () => {
    const container = draw(
      "Your connected site is **hipcollection** (site_id 1, WordPress).\n\n" +
        "**Review queue**\n* pending: 146\n* approved: 1\n\n" +
        "Queue: http://localhost:5173/queue?site=1&status=pending",
    );
    expect(container.querySelectorAll(".assistant-md-strong").length).toBe(2);
    expect(container.querySelectorAll(".assistant-md-li").length).toBe(2);
    expect(container.querySelectorAll("a").length).toBe(1);
    expect(container.textContent).not.toContain("**");
  });
});

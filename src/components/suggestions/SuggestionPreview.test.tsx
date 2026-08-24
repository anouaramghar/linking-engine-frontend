import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Suggestion } from "../../types/suggestion";
import SuggestionCard from "./SuggestionCard";
import SuggestionPreview from "./SuggestionPreview";

afterEach(cleanup);

const suggestion = (status: Suggestion["status"]): Suggestion => ({
  id: 1,
  site_id: 1,
  source_article: { id: 10, title: "Source", url: "https://example.com/source" },
  target_article: { id: 11, title: "Target", url: "https://example.com/target" },
  target_origin: "internal",
  target_site_name: "Example site",
  method: "baseline_cosine",
  score: 0.9,
  rank_score: 0.9,
  status,
  anchor_text: "anchor",
  created_at: "2026-07-16T10:00:00Z",
});

/** Placement is generated per suggestion by the page; these tests are about
 *  everything else in the drawer, so they render it already resolved. */
const placement = {
  data: {
    suggestion_id: 1,
    found: true,
    placement_context: "The long steep pulls fewer acids out of the grounds.",
    anchor_text: "fewer acids",
    llm_model: "google/gemma-4-31b-it",
    generated_at: "2026-08-03T10:00:00Z",
  },
  isLoading: false,
  error: null,
  onRetry: vi.fn(),
};

const trace = {
  data: [],
  isLoading: false,
  error: null,
  onRetry: vi.fn(),
};

const renderPreview = (
  status: Suggestion["status"],
  onUndo = vi.fn(),
  onReviewPublication?: () => void,
) =>
  render(
    <SuggestionPreview
      suggestion={suggestion(status)}
      siteName="Example site"
      placement={placement}
      onClose={vi.fn()}
      onAccept={vi.fn()}
      onReject={vi.fn()}
      onUndo={onUndo}
      onReviewPublication={onReviewPublication}
    />,
  );

describe("SuggestionPreview publication state", () => {
  it("keeps suggestion details without advertising unsupported future signals", () => {
    renderPreview("pending");

    expect(screen.getByText("Internal link")).not.toBeNull();
    expect(screen.getByText("Placement context")).not.toBeNull();
    expect(document.body.textContent).not.toContain("Soon");
    expect(document.body.textContent).not.toContain("GraphSAGE");
    expect(document.body.textContent).not.toContain("Shared taxonomy");
  });

  it("does not render the removed similarity summary card", () => {
    const hybrid = { ...suggestion("pending"), method: "hybrid_bm25" };
    render(
      <SuggestionPreview
        suggestion={hybrid}
        siteName="Example site"
        placement={placement}
        onClose={vi.fn()}
        onAccept={vi.fn()}
        onReject={vi.fn()}
        onUndo={vi.fn()}
      />,
    );

    expect(screen.queryByText("Semantic similarity")).toBeNull();
    expect(screen.queryByText("Cosine baseline")).toBeNull();
    expect(screen.queryByText(/Selected by BM25/)).toBeNull();
  });

  it("identifies a selected suggestion as chosen but not yet approved", () => {
    renderPreview("approved");

    expect(screen.getByText("Selected for review")).not.toBeNull();
    expect(
      screen.getByText("Selected for review. Not scheduled and not live until its exact edit is approved."),
    ).not.toBeNull();
  });

  it("offers a direct exact-edit review action for a selected suggestion", () => {
    const onReviewPublication = vi.fn();
    renderPreview("approved", vi.fn(), onReviewPublication);

    fireEvent.click(screen.getByRole("button", { name: "Review exact edit" }));
    expect(onReviewPublication).toHaveBeenCalledTimes(1);
  });

  it("puts the decision before collapsed technical provenance", () => {
    render(
      <SuggestionPreview
        suggestion={suggestion("pending")}
        siteName="Example site"
        placement={placement}
        trace={trace}
        onClose={vi.fn()}
        onAccept={vi.fn()}
        onReject={vi.fn()}
        onUndo={vi.fn()}
      />,
    );

    const action = screen.getByRole("button", { name: "Select for review" });
    const provenance = screen.getByText("Technical provenance").closest("details");

    expect(provenance).not.toBeNull();
    expect(provenance?.open).toBe(false);
    expect(action.compareDocumentPosition(provenance!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("identifies an in-progress publication", () => {
    renderPreview("applying");

    expect(screen.getByText("Publishing")).not.toBeNull();
    expect(screen.getByText("Publishing is in progress.")).not.toBeNull();
  });

  it("identifies an applied suggestion as published", () => {
    renderPreview("applied");

    expect(screen.getByText("Published")).not.toBeNull();
    expect(screen.getByText("Published to the live article.")).not.toBeNull();
  });

  it.each<[Suggestion["status"], boolean]>([
    ["approved", true],
    ["rejected", true],
    ["applying", false],
    ["applied", false],
  ])("offers undo for %s: %s", (status, reversible) => {
    const onUndo = vi.fn();
    renderPreview(status, onUndo);

    const undo = screen.queryByRole("button", { name: "Undo" });
    expect(undo === null).toBe(!reversible);
    if (undo) {
      fireEvent.click(undo);
      expect(onUndo).toHaveBeenCalled();
    }
  });

  it("offers undo on a reviewed card without opening the preview", () => {
    const onUndo = vi.fn();
    const onOpen = vi.fn();
    render(
      <SuggestionCard
        suggestion={suggestion("approved")}
        siteName="Example site"
        selected={false}
        onOpen={onOpen}
        onAccept={vi.fn()}
        onReject={vi.fn()}
        onUndo={onUndo}
      />,
    );

    expect(screen.getByText("Selected for review")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^Undo decision/ }));
    expect(onUndo).toHaveBeenCalled();
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("keeps a published card final", () => {
    render(
      <SuggestionCard
        suggestion={suggestion("applied")}
        siteName="Example site"
        selected={false}
        onOpen={vi.fn()}
        onAccept={vi.fn()}
        onReject={vi.fn()}
        onUndo={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: /^Undo decision/ })).toBeNull();
  });

  it("keeps method details out of the compact queue row", () => {
    render(
      <SuggestionCard
        suggestion={{ ...suggestion("pending"), method: "hybrid_bm25" }}
        siteName="Example site"
        selected={false}
        onOpen={vi.fn()}
        onAccept={vi.fn()}
        onReject={vi.fn()}
        onUndo={vi.fn()}
      />,
    );

    expect(screen.queryByText("hybrid BM25")).toBeNull();
  });

  it("shows the rank score without repeating the final delivery rank", () => {
    render(
      <SuggestionCard
        suggestion={{ ...suggestion("pending"), score: 0.72, rank_score: 0.89, final_rank: 1 }}
        siteName="Example site"
        selected={false}
        onOpen={vi.fn()}
        onAccept={vi.fn()}
        onReject={vi.fn()}
        onUndo={vi.fn()}
      />,
    );

    expect(screen.queryByText("Final rank #1")).toBeNull();
    expect(screen.getByText("89%")).not.toBeNull();
    expect(screen.getByText("Rank score")).not.toBeNull();
    // The cosine score is a different number and must not be mistaken for it.
    expect(screen.queryByText("72%")).toBeNull();
  });

  it("identifies a content-pool target as an external link", () => {
    const external = {
      ...suggestion("pending"),
      target_origin: "content_pool" as const,
      target_site_name: "Wikipedia",
      target_article: {
        id: 12,
        title: "External target",
        url: "https://en.wikipedia.org/wiki/External_target",
      },
    };
    render(
      <SuggestionPreview
        suggestion={external}
        siteName="Example site"
        placement={placement}
        onClose={vi.fn()}
        onAccept={vi.fn()}
        onReject={vi.fn()}
        onUndo={vi.fn()}
      />,
    );

    expect(screen.getByText("External link · Content pool")).not.toBeNull();
    expect(screen.getByText("Wikipedia")).not.toBeNull();
    expect(
      screen.getByRole("link", { name: "Open target article in a new tab" }).getAttribute("href"),
    ).toBe(
      "https://en.wikipedia.org/wiki/External_target",
    );
  });

  it("shows a direct Tavily target with its discovery context", () => {
    const webSearch: Suggestion = {
      ...suggestion("pending"),
      target_article: {
        id: null,
        title: "Independent SEO guide",
        url: "https://reference.example/seo-guide",
      },
      target_origin: "web_search",
      target_site_name: "Tavily",
      method: "external_search",
      external_snippet: "Independent guidance about useful SEO links.",
      search_query: "SEO Orlando",
    };
    render(
      <SuggestionPreview
        suggestion={webSearch}
        siteName="Example site"
        placement={placement}
        onClose={vi.fn()}
        onAccept={vi.fn()}
        onReject={vi.fn()}
        onUndo={vi.fn()}
      />,
    );

    expect(screen.getByText("External link · Web search")).not.toBeNull();
    expect(screen.getByText("Tavily")).not.toBeNull();
    expect(document.body.textContent).toContain(
      "Independent guidance about useful SEO links.",
    );
    expect(document.body.textContent).toContain("Search query: SEO Orlando");
    expect(
      screen.getByRole("link", { name: "Open target article in a new tab" }).getAttribute("href"),
    ).toBe(
      "https://reference.example/seo-guide",
    );
  });

  it("renders a quarantined row and offers the only way back", () => {
    // The worker returns 'failed' rows in the default queue. A status the
    // client does not know about reads its metadata off undefined, which takes
    // the whole queue down rather than one card, and leaves the editor no way
    // to retry a suggestion the worker has stopped retrying.
    const onUndo = vi.fn();
    render(
      <SuggestionCard
        suggestion={suggestion("failed")}
        siteName="Example site"
        selected={false}
        onOpen={vi.fn()}
        onAccept={vi.fn()}
        onReject={vi.fn()}
        onUndo={onUndo}
      />,
    );

    expect(screen.getByText("Publishing failed")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^Undo decision/ }));
    expect(onUndo).toHaveBeenCalled();
  });

  it("explains a quarantined row in the drawer", () => {
    const failed = {
      ...suggestion("failed"),
      publish_error: "HTTP 403: editor-bot needs permission to edit posts",
    };
    render(
      <SuggestionPreview
        suggestion={failed}
        siteName="Example site"
        placement={placement}
        onClose={vi.fn()}
        onAccept={vi.fn()}
        onReject={vi.fn()}
        onUndo={vi.fn()}
      />,
    );

    expect(screen.getByText("Publishing failed")).not.toBeNull();
    expect(document.body.textContent).toContain("stopped retrying");
    expect(document.body.textContent).toContain(
      "HTTP 403: editor-bot needs permission to edit posts",
    );
  });

  it("keeps the target origin on a compact queue card", () => {
    render(
      <SuggestionCard
        suggestion={{
          ...suggestion("pending"),
          target_origin: "content_pool",
          target_site_name: "Wikipedia",
        }}
        siteName="Example site"
        selected={false}
        onOpen={vi.fn()}
        onAccept={vi.fn()}
        onReject={vi.fn()}
        onUndo={vi.fn()}
      />,
    );

    expect(screen.getByText("External link · Content pool")).not.toBeNull();
    expect(screen.getByText("Wikipedia")).not.toBeNull();
  });
});

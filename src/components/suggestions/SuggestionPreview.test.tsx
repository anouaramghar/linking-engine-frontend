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

const renderPreview = (status: Suggestion["status"], onUndo = vi.fn()) =>
  render(
    <SuggestionPreview
      suggestion={suggestion(status)}
      siteName="Example site"
      placement={placement}
      onClose={vi.fn()}
      onAccept={vi.fn()}
      onReject={vi.fn()}
      onUndo={onUndo}
    />,
  );

describe("SuggestionPreview publication state", () => {
  it("keeps the live cosine score without advertising unsupported future signals", () => {
    renderPreview("pending");

    expect(screen.getByText("90%")).not.toBeNull();
    expect(screen.getByText("Internal link")).not.toBeNull();
    expect(screen.getByText("Placement context")).not.toBeNull();
    expect(document.body.textContent).not.toContain("Soon");
    expect(document.body.textContent).not.toContain("GraphSAGE");
    expect(document.body.textContent).not.toContain("Shared taxonomy");
  });

  it("labels Hybrid suggestions without calling the score BM25 confidence", () => {
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

    expect(screen.getByText("Semantic similarity")).not.toBeNull();
    expect(screen.queryByText("Cosine baseline")).toBeNull();
  });

  it("reports the BM25 selection score as its own raw number", () => {
    // The percentage is similarity; BM25 is what chose the row. Showing BM25 as a
    // second percentage would read as a confidence, which it is not.
    const hybrid: Suggestion = {
      ...suggestion("pending"),
      method: "hybrid_bm25",
      score_components: {
        version: "hybrid_bm25_v1",
        final_order: "bm25_512",
        bm25_score: 12.47,
        semantic: 0.9,
      },
    };
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

    expect(screen.getByText("Selected by BM25 · score 12.5")).not.toBeNull();
    expect(screen.getByText("90%")).not.toBeNull();
    expect(screen.queryByText("12%")).toBeNull();
  });

  it("shows no selection score when the engine reported none", () => {
    // A baseline row, or an engine that predates the components.
    renderPreview("pending");

    expect(screen.queryByText(/Selected by BM25/)).toBeNull();
  });

  it("identifies an approved suggestion as queued but not live", () => {
    renderPreview("approved");

    expect(screen.getByText("Queued for publish")).not.toBeNull();
    expect(screen.getByText("Queued for the next publish batch. Not live yet.")).not.toBeNull();
  });

  it("identifies an in-progress publication", () => {
    renderPreview("applying");

    expect(screen.getByText("Publishing")).not.toBeNull();
    expect(screen.getByText("Publishing is in progress.")).not.toBeNull();
  });

  it("identifies an applied suggestion as published live", () => {
    renderPreview("applied");

    expect(screen.getByText("Published live")).not.toBeNull();
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

    expect(screen.getByText("Queued for publish")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
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

    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
  });

  it("shows the Hybrid method on a current card", () => {
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

    expect(screen.getByText("hybrid BM25")).not.toBeNull();
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
    expect(screen.getByRole("link", { name: "open target" }).getAttribute("href")).toBe(
      "https://en.wikipedia.org/wiki/External_target",
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
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
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

  it("shows the origin on a queue card", () => {
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

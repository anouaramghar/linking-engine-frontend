import { cleanup, render, screen } from "@testing-library/react";
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
  method: "baseline_cosine",
  score: 0.9,
  status,
  anchor_text: "anchor",
  external_url: null,
  external_title: null,
  trust_score: null,
  context_before: "before ",
  context_after: " after",
  created_at: "2026-07-16T10:00:00Z",
});

const renderPreview = (status: Suggestion["status"]) =>
  render(
    <SuggestionPreview
      suggestion={suggestion(status)}
      siteName="Example site"
      onClose={vi.fn()}
      onAccept={vi.fn()}
      onReject={vi.fn()}
    />,
  );

describe("SuggestionPreview publication state", () => {
  it("identifies an approved suggestion as queued but not live", () => {
    renderPreview("approved");

    expect(screen.getByText("Queued for publish")).not.toBeNull();
    expect(screen.getByText("Queued for the next publish batch. Not live yet.")).not.toBeNull();
  });

  it("identifies an applied suggestion as published live", () => {
    renderPreview("applied");

    expect(screen.getByText("Published live")).not.toBeNull();
    expect(screen.getByText("Published to the live article.")).not.toBeNull();
  });

  it("identifies an approved card as queued for publish", () => {
    render(
      <SuggestionCard
        suggestion={suggestion("approved")}
        siteName="Example site"
        selected={false}
        onOpen={vi.fn()}
        onAccept={vi.fn()}
        onReject={vi.fn()}
        onUndo={vi.fn()}
      />,
    );

    expect(screen.getByText("Queued for publish")).not.toBeNull();
  });
});

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Suggestion } from "../../types/suggestion";
import SuggestionTraceCard from "./SuggestionTraceCard";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const suggestion: Suggestion = {
  id: 7,
  trace_id: "d6d02e21-fbd9-47e9-aa78-17d94810e4a5",
  site_id: 1,
  source_article: { id: 10, title: "Source", url: "/source" },
  target_article: { id: 11, title: "Target", url: "/target" },
  target_origin: "internal",
  target_site_name: "Example",
  method: "hybrid_bm25",
  score: 0.84,
  score_components: { bm25_score: 12.4 },
  status: "approved",
  anchor_text: "anchor",
  created_at: "2026-08-05T10:00:00Z",
};

describe("SuggestionTraceCard", () => {
  it("renders useful statistics and newest lifecycle events", () => {
    render(
      <SuggestionTraceCard
        suggestion={suggestion}
        trace={{
          data: [
            {
              id: 2,
              suggestion_id: 7,
              event_type: "reviewed",
              actor: "editor@example.com",
              details: { from_status: "pending", to_status: "approved" },
              created_at: "2026-08-05T11:00:00Z",
            },
            {
              id: 1,
              suggestion_id: 7,
              event_type: "generated",
              actor: "analysis-engine",
              details: { method: "hybrid_bm25", score: 0.84 },
              created_at: "2026-08-05T10:00:00Z",
            },
          ],
          isLoading: false,
          error: null,
          onRetry: vi.fn(),
        }}
      />,
    );

    expect(
      screen.getByRole("region", { name: "Suggestion traceability" }).className,
    ).toContain("mb-5");
    expect(document.body.textContent).not.toContain("Selected by Hybrid BM25");
    expect(document.body.textContent).toContain(suggestion.trace_id);
    expect(screen.getByRole("group", { name: "Suggestion statistics" })).not.toBeNull();
    expect(screen.getByText("Semantic match")).not.toBeNull();
    expect(screen.getByText("BM25 score")).not.toBeNull();
    expect(screen.getByText("Decision time")).not.toBeNull();
    expect(screen.getByText("1h 0m")).not.toBeNull();
    expect(screen.getByText("Activity events")).not.toBeNull();
    expect(screen.getByText("2")).not.toBeNull();
    expect(screen.getByText("Accepted")).not.toBeNull();
    expect(document.body.textContent).toContain("editor@example.com");
  });

  it("shows queue age and the ranking method while history is loading", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-05T12:30:00Z"));

    render(
      <SuggestionTraceCard
        suggestion={{
          ...suggestion,
          method: "baseline_cosine",
          score_components: null,
          status: "pending",
        }}
        trace={{ data: undefined, isLoading: true, error: null, onRetry: vi.fn() }}
      />,
    );

    expect(screen.getByText("Ranking")).not.toBeNull();
    expect(screen.getByText("Cosine")).not.toBeNull();
    expect(screen.getByText("Queue age")).not.toBeNull();
    expect(screen.getByText("2h 30m")).not.toBeNull();
    expect(screen.getByText("\u2014")).not.toBeNull();
  });

  it("offers a retry when history cannot be loaded", () => {
    const onRetry = vi.fn();
    render(
      <SuggestionTraceCard
        suggestion={suggestion}
        trace={{ data: undefined, isLoading: false, error: new Error("offline"), onRetry }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

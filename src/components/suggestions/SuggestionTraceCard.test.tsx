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

  it("explains the persisted final rank without treating cosine as the order", () => {
    render(
      <SuggestionTraceCard
        suggestion={{
          ...suggestion,
          final_rank: 1,
          retrieval_version: "hybrid_bm25_v1",
          ranking_version: "hybrid_bm25:graph=off:feedback=off",
          score_components: {
            version: "hybrid_bm25_v1",
            final_order: "bm25_512",
            recipe: "structured_t3_tax2_c512",
            bm25_score: 12.4,
            fusion_rank: 3,
            dense_rank: 9,
            lexical_rank: 2,
          },
        }}
        trace={{ data: [], isLoading: false, error: null, onRetry: vi.fn() }}
      />,
    );

    expect(screen.getByText("How the rank was decided")).not.toBeNull();
    expect(screen.getByText("Final rank #1")).not.toBeNull();
    expect(document.body.textContent).toContain(
      "Semantic match remains the separate cosine similarity shown above.",
    );

    const details = screen.getByText("Show ranking details").closest("details");
    expect(details?.open).toBe(false);
    fireEvent.click(screen.getByText("Show ranking details"));
    expect(details?.open).toBe(true);
    expect(screen.getByText("Dense retrieval position")).not.toBeNull();
    expect(screen.getByText("#9")).not.toBeNull();
    expect(screen.getByText("structured_t3_tax2_c512")).not.toBeNull();
    expect(screen.getByText("hybrid_bm25:graph=off:feedback=off")).not.toBeNull();
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

  it("shows the policy-relative trust score for an external target", () => {
    render(
      <SuggestionTraceCard
        suggestion={{
          ...suggestion,
          target_origin: "content_pool",
          score_components: {
            bm25_score: 12.4,
            external_trust: {
              domain: "wikipedia.org",
              score: 95,
              eligible: true,
              reasons: [],
              checks: { https: true },
            },
          },
        }}
        trace={{ data: [], isLoading: false, error: null, onRetry: vi.fn() }}
      />,
    );

    expect(screen.getByText("External trust")).not.toBeNull();
    expect(screen.getByText("95/100")).not.toBeNull();
  });

  it("shows graph context without presenting structure as relevance", () => {
    render(
      <SuggestionTraceCard
        suggestion={{
          ...suggestion,
          score_components: {
            bm25_score: 12.4,
            graph: {
              snapshot_id: 8,
              graph_version: "a".repeat(64),
              target_in_degree: 0,
              source_out_degree: 4,
              target_orphan: true,
              target_underlinked: true,
              target_saturated: false,
              adjustment: 0.03,
              mode: "shadow",
            },
          },
        }}
        trace={{ data: [], isLoading: false, error: null, onRetry: vi.fn() }}
      />,
    );

    expect(screen.getByText("Graph context")).not.toBeNull();
    expect(screen.getByText("Target inlinks")).not.toBeNull();
    expect(screen.getByText("Orphan")).not.toBeNull();
    expect(screen.getByText("Observed beside BM25")).not.toBeNull();
    expect(document.body.textContent).toContain("orphan status does not qualify");
  });

  it("shows Tavily provenance without treating provider relevance as semantic score", () => {
    render(
      <SuggestionTraceCard
        suggestion={{
          ...suggestion,
          target_article: {
            id: null,
            title: "Independent SEO guide",
            url: "https://reference.example/seo-guide",
          },
          target_origin: "web_search",
          target_site_name: "Tavily",
          method: "external_search",
          provider: "tavily",
          provider_request_id: "request-123",
          provider_score: 0.74,
          score_components: {
            external_safety: {
              domain: "reference.example",
              eligible: true,
              reasons: [],
              checks: {
                https: true,
                blocklisted: false,
                competitor: false,
                owned_domain: false,
              },
            },
          },
        }}
        trace={{ data: [], isLoading: false, error: null, onRetry: vi.fn() }}
      />,
    );

    expect(screen.getByText("Search relevance")).not.toBeNull();
    expect(screen.getByText("74%")).not.toBeNull();
    expect(screen.getByText("Safety checks")).not.toBeNull();
    expect(screen.getByText("Passed")).not.toBeNull();
    expect(screen.getByText("Web search")).not.toBeNull();
    expect(document.body.textContent).toContain("Provider request: request-123");
  });
});

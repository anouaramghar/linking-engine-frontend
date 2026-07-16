import { describe, expect, it } from "vitest";

import type { Suggestion } from "../types/suggestion";
import {
  adjustedStatusCount,
  clampThreshold,
  filterSuggestions,
  getBulkTargets,
  resolveSuggestionStatuses,
} from "./suggestionReview";

const suggestion = (id: number, overrides: Partial<Suggestion> = {}): Suggestion => ({
  id,
  site_id: 1,
  source_article: { id: id * 10, title: `Source ${id}`, url: `/source-${id}` },
  target_article: { id: id * 10 + 1, title: `Target ${id}`, url: `/target-${id}` },
  method: "baseline_cosine",
  score: 0.8,
  status: "pending",
  anchor_text: "anchor",
  external_url: null,
  external_title: null,
  trust_score: null,
  context_before: "before ",
  context_after: " after",
  created_at: "2026-07-16T10:00:00Z",
  ...overrides,
});

describe("clampThreshold", () => {
  it.each([
    [-20, 0],
    [65, 65],
    [140, 100],
  ])("clamps %s to %s", (input, expected) => {
    expect(clampThreshold(input)).toBe(expected);
  });
});

describe("resolveSuggestionStatuses", () => {
  it("uses local status overrides without mutating fetched suggestions", () => {
    const fetched = [suggestion(1), suggestion(2, { status: "applied" })];
    const resolved = resolveSuggestionStatuses(fetched, { 1: "approved" });

    expect(resolved.map((item) => item.status)).toEqual(["approved", "applied"]);
    expect(fetched[0].status).toBe("pending");
  });
});

describe("filterSuggestions", () => {
  it("filters by site, status, and method together", () => {
    const suggestions = [
      suggestion(1),
      suggestion(2, { method: "gnn_graphsage" }),
      suggestion(3, { site_id: 2, method: "gnn_graphsage" }),
      suggestion(4, { status: "approved", method: "gnn_graphsage" }),
    ];

    expect(
      filterSuggestions(suggestions, {
        siteId: 1,
        status: "pending",
        method: "gnn_graphsage",
      }).map((item) => item.id),
    ).toEqual([2]);
  });
});

describe("getBulkTargets", () => {
  const suggestions = [
    suggestion(1, { score: 0.8 }),
    suggestion(2, { score: 0.799 }),
    suggestion(3, { score: 0.95, method: "gnn_graphsage" }),
    suggestion(4, { score: 0.9, status: "approved" }),
    suggestion(5, { score: 0.9, site_id: 2 }),
  ];

  it("accepts pending suggestions at and above the inclusive threshold", () => {
    expect(
      getBulkTargets(suggestions, {
        action: "approve",
        siteId: 1,
        method: "baseline_cosine",
        threshold: 80,
      }).map((item) => item.id),
    ).toEqual([1]);
  });

  it("rejects pending suggestions strictly below the threshold", () => {
    expect(
      getBulkTargets(suggestions, {
        action: "reject",
        siteId: 1,
        method: "baseline_cosine",
        threshold: 80,
      }).map((item) => item.id),
    ).toEqual([2]);
  });

  it("never targets a non-pending suggestion", () => {
    expect(
      getBulkTargets(suggestions, {
        action: "approve",
        siteId: 0,
        method: "all",
        threshold: 0,
      }).map((item) => item.id),
    ).not.toContain(4);
  });
});

describe("adjustedStatusCount", () => {
  it("applies local status deltas to backend aggregate counts", () => {
    const fetched = [suggestion(1), suggestion(2), suggestion(3, { site_id: 2 })];
    const overrides = { 1: "approved", 3: "rejected" } as const;

    expect(adjustedStatusCount(10, fetched, overrides, "pending", 1)).toBe(9);
    expect(adjustedStatusCount(4, fetched, overrides, "approved", 1)).toBe(5);
    expect(adjustedStatusCount(20, fetched, overrides, "pending", 0)).toBe(18);
  });
});

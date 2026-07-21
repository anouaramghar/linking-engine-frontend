import { describe, expect, it } from "vitest";

import type { Suggestion } from "../types/suggestion";
import {
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
  it("uses saved status overrides without mutating fetched suggestions", () => {
    const fetched = [suggestion(1), suggestion(2, { status: "applied" })];
    const resolved = resolveSuggestionStatuses(fetched, { 1: "approved" });

    expect(resolved.map((item) => item.status)).toEqual(["approved", "applied"]);
    expect(fetched[0].status).toBe("pending");
  });
});

describe("filterSuggestions", () => {
  it("filters the current queue by site and status", () => {
    const suggestions = [
      suggestion(1),
      suggestion(2, { site_id: 2 }),
      suggestion(3, { status: "approved" }),
    ];

    expect(
      filterSuggestions(suggestions, { siteId: 1, status: "pending" }).map(
        (item) => item.id,
      ),
    ).toEqual([1]);
  });
});

describe("getBulkTargets", () => {
  const suggestions = [
    suggestion(1, { score: 0.8 }),
    suggestion(2, { score: 0.799 }),
    suggestion(3, { score: 0.95, site_id: 2 }),
    suggestion(4, { score: 0.9, status: "approved" }),
  ];

  it("accepts pending suggestions at and above the inclusive threshold", () => {
    expect(
      getBulkTargets(suggestions, {
        action: "approve",
        siteId: 1,
        threshold: 80,
      }).map((item) => item.id),
    ).toEqual([1]);
  });

  it("rejects pending suggestions strictly below the threshold", () => {
    expect(
      getBulkTargets(suggestions, {
        action: "reject",
        siteId: 1,
        threshold: 80,
      }).map((item) => item.id),
    ).toEqual([2]);
  });

  it("never targets a non-pending suggestion", () => {
    expect(
      getBulkTargets(suggestions, {
        action: "approve",
        siteId: 0,
        threshold: 0,
      }).map((item) => item.id),
    ).not.toContain(4);
  });
});

import { describe, expect, it } from "vitest";

import type { Suggestion } from "../types/suggestion";
import {
  clampThreshold,
  filterSuggestions,
  getBulkTargets,
  pruneStatusOverrides,
  resolveSuggestionStatuses,
} from "./suggestionReview";
import type { StatusFilter } from "./suggestionReview";

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
    suggestion(2, { score: 0.79 }),
    suggestion(3, { score: 0.95, site_id: 2 }),
    suggestion(4, { score: 0.9, status: "approved" }),
  ];

  it("accepts pending suggestions at and above the inclusive threshold", () => {
    expect(
      getBulkTargets(suggestions, {
        action: "approve",
        siteId: 1,
        status: "pending",
        threshold: 80,
      }).map((item) => item.id),
    ).toEqual([1]);
  });

  it("rejects pending suggestions strictly below the threshold", () => {
    expect(
      getBulkTargets(suggestions, {
        action: "reject",
        siteId: 1,
        status: "pending",
        threshold: 80,
      }).map((item) => item.id),
    ).toEqual([2]);
  });

  it("never targets a non-pending suggestion", () => {
    expect(
      getBulkTargets(suggestions, {
        action: "approve",
        siteId: 0,
        status: "all",
        threshold: 0,
      }).map((item) => item.id),
    ).not.toContain(4);
  });

  it("compares against the score the editor sees, not the raw float", () => {
    // 0.799 renders as 80%, so an 'at least 80%' rule must accept it and a
    // 'below 80%' rule must leave it alone.
    const rounded = [suggestion(5, { score: 0.799 })];
    const rule = { siteId: 1, status: "pending", threshold: 80 } as const;

    expect(getBulkTargets(rounded, { ...rule, action: "approve" })).toHaveLength(1);
    expect(getBulkTargets(rounded, { ...rule, action: "reject" })).toHaveLength(0);
  });

  it.each<StatusFilter>(["approved", "rejected", "applying", "applied"])(
    "targets nothing while the %s list is showing",
    (status) => {
      expect(
        getBulkTargets(suggestions, {
          action: "reject",
          siteId: 0,
          status,
          threshold: 100,
        }),
      ).toEqual([]);
    },
  );
});

describe("pruneStatusOverrides", () => {
  it("drops an override the server has caught up with", () => {
    const overrides = pruneStatusOverrides([suggestion(1, { status: "approved" })], {
      1: "approved",
    });

    expect(overrides).toEqual({});
  });

  it("keeps an override the server has not caught up with yet", () => {
    const overrides = pruneStatusOverrides([suggestion(1, { status: "approved" })], {
      1: "pending",
    });

    expect(overrides).toEqual({ 1: "pending" });
  });

  it.each<Suggestion["status"]>(["applying", "applied"])(
    "lets the publication worker's %s status win over any override",
    (status) => {
      expect(pruneStatusOverrides([suggestion(1, { status })], { 1: "pending" })).toEqual({});
    },
  );
});

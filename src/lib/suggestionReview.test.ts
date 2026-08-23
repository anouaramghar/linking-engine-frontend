import { describe, expect, it } from "vitest";

import type { Suggestion } from "../types/suggestion";
import {
  clampThreshold,
  filterSuggestions,
  pruneStatusOverrides,
  resolveSuggestionStatuses,
} from "./suggestionReview";

const suggestion = (id: number, overrides: Partial<Suggestion> = {}): Suggestion => ({
  id,
  site_id: 1,
  source_article: { id: id * 10, title: `Source ${id}`, url: `/source-${id}` },
  target_article: { id: id * 10 + 1, title: `Target ${id}`, url: `/target-${id}` },
  target_origin: "internal",
  target_site_name: "Example site",
  method: "baseline_cosine",
  score: 0.8,
  status: "pending",
  anchor_text: "anchor",
  created_at: "2026-07-16T10:00:00Z",
  ...overrides,
  // A baseline_cosine row ranks on its cosine score, so the two move together
  // unless a test pins the rank score itself.
  rank_score: overrides.rank_score ?? overrides.score ?? 0.8,
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

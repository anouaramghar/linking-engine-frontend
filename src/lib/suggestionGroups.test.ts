import { describe, expect, it } from "vitest";

import type { Suggestion } from "../types/suggestion";
import { groupSuggestionsBySource, sortSuggestionsByFinalRank } from "./suggestionGroups";

const suggestion = (
  id: number,
  score: number,
  final_rank: number | null | undefined,
  sourceId = 10,
): Suggestion => ({
  id,
  site_id: 1,
  source_article: { id: sourceId, title: `Source ${sourceId}`, url: `/source-${sourceId}` },
  target_article: { id: id + 100, title: `Target ${id}`, url: `/target-${id}` },
  target_origin: "internal",
  target_site_name: "Example",
  method: "hybrid_bm25",
  score,
  final_rank,
  status: "pending",
  anchor_text: null,
  created_at: "2026-08-16T10:00:00Z",
});

describe("suggestion grouping order", () => {
  it("uses final rank inside a source group instead of semantic score order", () => {
    const groups = groupSuggestionsBySource([
      suggestion(1, 0.95, 2),
      suggestion(2, 0.89, 1),
      suggestion(3, 0.85, 3),
    ]);

    expect(groups[0]?.suggestions.map((item) => item.id)).toEqual([2, 1, 3]);
  });

  it("keeps legacy unranked rows after ranked rows in their original order", () => {
    const sorted = sortSuggestionsByFinalRank([
      suggestion(1, 0.95, null),
      suggestion(2, 0.89, 2),
      suggestion(3, 0.85, 1),
      suggestion(4, 0.99, undefined),
    ]);

    expect(sorted.map((item) => item.id)).toEqual([3, 2, 1, 4]);
  });
});

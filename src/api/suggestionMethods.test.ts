/**
 * The queue must never filter itself down to one ranking method.
 *
 * During the pilot a site's queue holds `baseline_cosine` rows written before
 * enrollment and `hybrid_bm25` rows written after it. The backend returns every
 * method unless a request asks for one, so these tests pin the absence of that
 * parameter: a `method` key silently added to any of these calls would hide real
 * rows from the editor who has to decide about them, and would make the counts
 * disagree with the list they label.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  bulkReview,
  bulkReviewByFilter,
  countSuggestions,
  listSuggestionPage,
  reviewSuggestion,
} from "./suggestions";

const api = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
}));

vi.mock("./client", () => ({ api }));

beforeEach(() => {
  api.get.mockReset();
  api.post.mockReset();
  api.put.mockReset();
});

/** Every filter the queue UI can express, so no path can smuggle one in. */
const EVERY_FILTER = {
  siteId: 3,
  status: "pending",
  minPercent: 10,
  maxPercent: 90,
} as const;

describe("mixed-method queue reads", () => {
  it("asks the list endpoint for every method", async () => {
    api.get.mockResolvedValue({
      data: { items: [], total: 0, limit: 1000, next_cursor: null },
    });

    await listSuggestionPage(EVERY_FILTER, null);

    const [, options] = api.get.mock.calls[0];
    expect(options.params).not.toHaveProperty("method");
  });

  it("asks the counts endpoint for every method", async () => {
    api.get.mockResolvedValue({ data: { pending: 0, total: 0 } });

    await countSuggestions(EVERY_FILTER);

    const [, options] = api.get.mock.calls[0];
    expect(options.params).not.toHaveProperty("method");
  });

  it("returns hybrid and baseline rows from one page without distinction", async () => {
    const items = [
      {
        id: 1,
        method: "hybrid_bm25",
        score: 0.82,
        score_components: { final_order: "bm25_512", bm25_score: 12.5 },
      },
      { id: 2, method: "baseline_cosine", score: 0.81, score_components: null },
    ];
    api.get.mockResolvedValue({
      data: { items, total: 2, limit: 1000, next_cursor: null },
    });

    const page = await listSuggestionPage({ siteId: 3 }, null);

    expect(page.items.map((item) => item.method)).toEqual([
      "hybrid_bm25",
      "baseline_cosine",
    ]);
    // The components survive the client boundary rather than being dropped.
    expect(page.items[0].score_components?.bm25_score).toBe(12.5);
  });
});

describe("mixed-method review", () => {
  it("applies a bulk rule to every method it matches", async () => {
    api.post.mockResolvedValue({
      data: { reviewed: 2, skipped: 0, reviewed_ids: [1, 2], status: "approved" },
    });

    await bulkReviewByFilter({ siteId: 3, status: "approved", thresholdPercent: 80 });

    const [, body] = api.post.mock.calls[0];
    expect(body).not.toHaveProperty("method");
  });

  it("reviews hybrid and baseline ids in the same batch", async () => {
    api.post.mockResolvedValue({
      data: { reviewed: [1, 2], skipped: [], status: "approved" },
    });

    await bulkReview([1, 2], "approved");

    const [, body] = api.post.mock.calls[0];
    expect(body).toEqual({ suggestion_ids: [1, 2], status: "approved" });
  });

  it("reviews a single hybrid row through the same route as any other", async () => {
    api.put.mockResolvedValue({ data: { id: 7, method: "hybrid_bm25", status: "approved" } });

    await reviewSuggestion(7, "approved");

    expect(api.put).toHaveBeenCalledWith("/suggestions/7", { status: "approved" });
  });
});

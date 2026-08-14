import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  BulkReviewChunkError,
  bulkReview,
  bulkReviewByFilter,
  countSuggestions,
  listSuggestionPage,
  markSuggestionsExposed,
  reviewSuggestion,
  triggerAnalysis,
  triggerComparison,
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

describe("cursor queue reads", () => {
  it("requests exactly one filtered page and continues from its score/id cursor", async () => {
    const first = {
      items: [{ id: 10, score: 0.9 }],
      total: 2000,
      limit: 1000,
      next_cursor: { score: 0.9, id: 10 },
    };
    const second = {
      items: [{ id: 9, score: 0.8 }],
      total: null,
      limit: 1000,
      next_cursor: null,
    };
    api.get
      .mockResolvedValueOnce({ data: first })
      .mockResolvedValueOnce({ data: second });

    await expect(
      listSuggestionPage(
        { siteId: 3, status: "pending" },
        null,
      ),
    ).resolves.toEqual(first);
    await expect(
      listSuggestionPage(
        { siteId: 3, status: "pending" },
        first.next_cursor,
      ),
    ).resolves.toEqual(second);

    expect(api.get).toHaveBeenNthCalledWith(1, "/suggestions", {
      params: {
        site_id: 3,
        status: "pending",
        limit: 1000,
      },
    });
    expect(api.get).toHaveBeenNthCalledWith(2, "/suggestions", {
      params: {
        site_id: 3,
        status: "pending",
        after_score: 0.9,
        after_id: 10,
        limit: 1000,
      },
    });
    expect(api.get).toHaveBeenCalledTimes(2);
  });

  it("loads chip and threshold counts from the server", async () => {
    const counts = {
      pending: 4,
      approved: 2,
      rejected: 1,
      applying: 0,
      applied: 3,
      expired: 0,
      total: 10,
    };
    api.get.mockResolvedValue({ data: counts });

    await expect(
      countSuggestions({ siteId: 3, minPercent: 80 }),
    ).resolves.toEqual(counts);

    expect(api.get).toHaveBeenCalledWith("/suggestions/counts", {
      params: {
        site_id: 3,
        min_percent: 80,
      },
    });
  });

  it("serializes the complementary below-threshold count", async () => {
    api.get.mockResolvedValue({ data: { pending: 12, total: 12 } });

    await countSuggestions({ maxPercent: 80 });

    expect(api.get).toHaveBeenCalledWith("/suggestions/counts", {
      params: {
        max_percent: 80,
      },
    });
  });
});

describe("filtered bulk review", () => {
  it("posts the displayed-percent rule rather than enumerating ids", async () => {
    const result = {
      reviewed: 2,
      skipped: 0,
      reviewed_ids: [8, 9],
      status: "approved",
    };
    api.post.mockResolvedValue({ data: result });

    await expect(
      bulkReviewByFilter({
        siteId: 3,
        status: "approved",
        thresholdPercent: 80,
      }),
    ).resolves.toEqual(result);

    expect(api.post).toHaveBeenCalledWith(
      "/suggestions/bulk-review-by-filter",
      {
        status: "approved",
        threshold_percent: 80,
        site_id: 3,
      },
    );
  });

  it("makes fleet scope explicit when no site is selected", async () => {
    api.post.mockResolvedValue({
      data: {
        reviewed: 1001,
        skipped: 0,
        reviewed_ids: null,
        status: "rejected",
      },
    });

    await bulkReviewByFilter({
      status: "rejected",
      thresholdPercent: 80,
    });

    expect(api.post).toHaveBeenCalledWith(
      "/suggestions/bulk-review-by-filter",
      expect.objectContaining({ all_sites: true }),
    );
  });
});

describe("discovery filters on the wire", () => {
  it("sends each filter under the name the engine expects", async () => {
    api.get.mockResolvedValue({ data: { items: [], total: null, limit: 50, next_cursor: null } });

    await listSuggestionPage(
      {
        siteId: 3,
        q: "hooks",
        targetOrigin: "content_pool",
        excludeReciprocal: true,
        minPercent: 90,
      },
      null,
    );

    expect(api.get.mock.calls[0][1].params).toMatchObject({
      site_id: 3,
      q: "hooks",
      target_origin: "content_pool",
      exclude_reciprocal: true,
      min_percent: 90,
    });
  });

  it("omits a blank search rather than sending an empty term", async () => {
    api.get.mockResolvedValue({ data: { items: [], total: null, limit: 50, next_cursor: null } });

    await listSuggestionPage({ q: "" }, null);
    await countSuggestions({ q: "", excludeReciprocal: false });

    expect(api.get.mock.calls[0][1].params).not.toHaveProperty("q");
    expect(api.get.mock.calls[1][1].params).not.toHaveProperty("q");
    expect(api.get.mock.calls[1][1].params).not.toHaveProperty("exclude_reciprocal");
  });

  it("carries the queue's filters into the bulk rule", async () => {
    api.post.mockResolvedValue({ data: { reviewed: 1, skipped: 0, reviewed_ids: [1], status: "approved" } });

    await bulkReviewByFilter({
      siteId: 3,
      status: "approved",
      thresholdPercent: 80,
      q: "hooks",
      targetOrigin: "content_pool",
      excludeReciprocal: true,
    });

    expect(api.post.mock.calls[0][1]).toMatchObject({
      site_id: 3,
      status: "approved",
      threshold_percent: 80,
      q: "hooks",
      target_origin: "content_pool",
      exclude_reciprocal: true,
    });
  });
});

describe("current suggestion mutations", () => {
  it("records rendered suggestions on the exposure endpoint", async () => {
    const result = { exposed: 2 };
    api.post.mockResolvedValue({ data: result });

    await expect(markSuggestionsExposed([7, 8], "preview")).resolves.toEqual(result);

    expect(api.post).toHaveBeenCalledWith("/suggestions/exposure", {
      suggestion_ids: [7, 8],
      surface: "preview",
    });
  });

  it("serializes an optional rejection reason without changing approval", async () => {
    api.put.mockResolvedValue({ data: { id: 7, status: "rejected" } });

    await reviewSuggestion(7, "rejected", "wrong_target");

    expect(api.put).toHaveBeenCalledWith("/suggestions/7", {
      status: "rejected",
      rejection_reason: "wrong_target",
    });
  });

  it("uses the backend's review, generation, and comparison routes", async () => {
    api.put.mockResolvedValue({ data: { id: 7, status: "approved" } });
    api.post
      .mockResolvedValueOnce({ data: { reviewed: [8, 9], skipped: [], status: "rejected" } })
      .mockResolvedValueOnce({ data: { job_id: "analysis-job" } })
      .mockResolvedValueOnce({ data: { job_id: "comparison-job" } });

    await reviewSuggestion(7, "approved");
    await bulkReview([8, 9], "rejected");
    await triggerAnalysis(3);
    await triggerComparison(3);

    expect(api.put).toHaveBeenCalledWith("/suggestions/7", { status: "approved" });
    expect(api.post).toHaveBeenNthCalledWith(1, "/suggestions/bulk-review", {
      suggestion_ids: [8, 9],
      status: "rejected",
    });
    expect(api.post).toHaveBeenNthCalledWith(2, "/suggestions/3");
    expect(api.post).toHaveBeenNthCalledWith(3, "/suggestions/3/compare");
  });
});

describe("bulkReview", () => {
  it("splits a batch past the engine's bound and merges the results", async () => {
    // "Approve all" sends everything the editor has accumulated, which is not
    // bounded by the page size — unsplit, the engine 422s the whole action.
    const ids = Array.from({ length: 2400 }, (_, index) => index + 1);
    const firstReviewed = ids.slice(0, 1000).filter((id) => id !== 7);
    const secondReviewed = ids.slice(1000, 2000);
    const thirdReviewed = ids.slice(2000).filter((id) => id !== 2001);
    api.post
      .mockResolvedValueOnce({
        data: { reviewed: firstReviewed, skipped: [7], status: "approved" },
      })
      .mockResolvedValueOnce({
        data: { reviewed: secondReviewed, skipped: [], status: "approved" },
      })
      .mockResolvedValueOnce({
        data: { reviewed: thirdReviewed, skipped: [2001], status: "approved" },
      });

    const result = await bulkReview(ids, "approved");

    expect(api.post).toHaveBeenCalledTimes(3);
    expect(api.post.mock.calls.map(([, body]) => body.suggestion_ids.length)).toEqual([
      1000, 1000, 400,
    ]);
    expect(result).toEqual({
      reviewed: ids.filter((id) => id !== 7 && id !== 2001),
      reviewedCount: 2398,
      skipped: [7, 2001],
      status: "approved",
    });
  });

  it("tolerates the legacy response: a reviewed count and no skipped", async () => {
    // The engine before the id list reported {reviewed: <count>, status} —
    // survive that during a mixed-version window rather than crashing the merge.
    api.post.mockResolvedValueOnce({ data: { reviewed: 2, status: "approved" } });

    await expect(bulkReview([1, 2], "approved")).resolves.toEqual({
      reviewed: [],
      reviewedCount: 2,
      skipped: [],
      status: "approved",
    });
  });

  it("preserves completed chunks when a later request fails", async () => {
    const ids = Array.from({ length: 2500 }, (_, index) => index + 1);
    const failure = new Error("request failed");
    api.post
      .mockResolvedValueOnce({
        data: { reviewed: ids.slice(0, 1000), skipped: [], status: "rejected" },
      })
      .mockRejectedValueOnce(failure);

    const error = await bulkReview(ids, "rejected").catch((caught) => caught);

    expect(error).toBeInstanceOf(BulkReviewChunkError);
    const partial = error as BulkReviewChunkError;
    expect(partial.completed).toEqual({
      reviewed: ids.slice(0, 1000),
      reviewedCount: 1000,
      skipped: [],
      status: "rejected",
    });
    expect(partial.failedIds).toEqual(ids.slice(1000, 2000));
    expect(partial.notAttemptedIds).toEqual(ids.slice(2000));
    expect(partial.cause).toBe(failure);
    expect(api.post).toHaveBeenCalledTimes(2);
  });

  it("does not issue a request for an empty batch", async () => {
    // The engine rejects an empty batch as a client bug; never send one.
    await expect(bulkReview([], "approved")).resolves.toEqual({
      reviewed: [],
      reviewedCount: 0,
      skipped: [],
      status: "approved",
    });
    expect(api.post).not.toHaveBeenCalled();
  });
});

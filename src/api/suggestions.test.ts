import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  BulkReviewChunkError,
  bulkReview,
  bulkReviewByFilter,
  countSuggestions,
  listSuggestionPage,
  reviewSuggestion,
  triggerAnalysis,
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
        true,
      ),
    ).resolves.toEqual(first);
    await expect(
      listSuggestionPage(
        { siteId: 3, status: "pending" },
        first.next_cursor,
        false,
      ),
    ).resolves.toEqual(second);

    expect(api.get).toHaveBeenNthCalledWith(1, "/suggestions", {
      params: {
        method: "baseline_cosine",
        site_id: 3,
        status: "pending",
        include_total: true,
        limit: 1000,
      },
    });
    expect(api.get).toHaveBeenNthCalledWith(2, "/suggestions", {
      params: {
        method: "baseline_cosine",
        site_id: 3,
        status: "pending",
        after_score: 0.9,
        after_id: 10,
        include_total: false,
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
        method: "baseline_cosine",
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
        method: "baseline_cosine",
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
        method: "baseline_cosine",
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

describe("current suggestion mutations", () => {
  it("uses the backend's single-review, bulk-review, and baseline-analysis routes", async () => {
    api.put.mockResolvedValue({ data: { id: 7, status: "approved" } });
    api.post
      .mockResolvedValueOnce({ data: { reviewed: [8, 9], skipped: [], status: "rejected" } })
      .mockResolvedValueOnce({ data: { job_id: "analysis-job" } });

    await reviewSuggestion(7, "approved");
    await bulkReview([8, 9], "rejected");
    await triggerAnalysis(3);

    expect(api.put).toHaveBeenCalledWith("/suggestions/7", { status: "approved" });
    expect(api.post).toHaveBeenNthCalledWith(1, "/suggestions/bulk-review", {
      suggestion_ids: [8, 9],
      status: "rejected",
    });
    expect(api.post).toHaveBeenNthCalledWith(2, "/suggestions/3");
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
      skipped: [],
      status: "approved",
    });
    expect(api.post).not.toHaveBeenCalled();
  });
});

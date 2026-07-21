import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  bulkReview,
  listSuggestionsForSites,
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

describe("listSuggestionsForSites", () => {
  it("loads every page for every site and sorts the combined queue by score", async () => {
    const firstPage = Array.from({ length: 1000 }, (_, index) => ({
      id: index + 1,
      score: 0.5,
    }));
    api.get.mockImplementation((path: string, config: { params: { offset: number } }) => {
      if (path === "/suggestions/1" && config.params.offset === 0) {
        return Promise.resolve({ data: firstPage });
      }
      if (path === "/suggestions/1") {
        return Promise.resolve({ data: [{ id: 1001, score: 0.95 }] });
      }
      return Promise.resolve({ data: [{ id: 2001, score: 0.8 }] });
    });

    const suggestions = await listSuggestionsForSites([1, 2]);

    expect(suggestions[0]).toEqual({ id: 1001, score: 0.95 });
    expect(suggestions[1]).toEqual({ id: 2001, score: 0.8 });
    expect(api.get).toHaveBeenCalledWith("/suggestions/1", {
      params: { limit: 1000, offset: 0 },
    });
    expect(api.get).toHaveBeenCalledWith("/suggestions/1", {
      params: { limit: 1000, offset: 1000 },
    });
    expect(api.get).toHaveBeenCalledWith("/suggestions/2", {
      params: { limit: 1000, offset: 0 },
    });
  });

  it("does not issue a request when no sites are connected", async () => {
    await expect(listSuggestionsForSites([])).resolves.toEqual([]);
    expect(api.get).not.toHaveBeenCalled();
  });
});

describe("current suggestion mutations", () => {
  it("uses the backend's single-review, bulk-review, and baseline-analysis routes", async () => {
    api.put.mockResolvedValue({ data: { id: 7, status: "approved" } });
    api.post
      .mockResolvedValueOnce({ data: { reviewed: 2, status: "rejected" } })
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

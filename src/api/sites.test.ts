import { beforeEach, describe, expect, it, vi } from "vitest";

import { bulkCreateSites, listSites, updateSuggestionMode } from "./sites";

const get = vi.hoisted(() => vi.fn());
const post = vi.hoisted(() => vi.fn());
const put = vi.hoisted(() => vi.fn());

vi.mock("./client", () => ({ api: { get, post, put } }));

beforeEach(() => {
  get.mockReset();
  post.mockReset();
  put.mockReset();
});

describe("listSites", () => {
  it("loads every page instead of stopping at the API's default limit", async () => {
    const firstPage = Array.from({ length: 1000 }, (_, index) => ({ id: index + 1 }));
    const secondPage = [{ id: 1001 }];
    get.mockResolvedValueOnce({ data: firstPage }).mockResolvedValueOnce({ data: secondPage });

    const sites = await listSites();

    expect(sites).toHaveLength(1001);
    expect(get).toHaveBeenNthCalledWith(1, "/sites", {
      params: { limit: 1000, offset: 0 },
    });
    expect(get).toHaveBeenNthCalledWith(2, "/sites", {
      params: { limit: 1000, offset: 1000 },
    });
  });

  it("fails visibly when the API repeats a full page", async () => {
    const repeatedPage = Array.from({ length: 1000 }, (_, index) => ({
      id: index + 1,
    }));
    get.mockResolvedValue({ data: repeatedPage });

    await expect(listSites()).rejects.toThrow(
      "The sites API repeated a page instead of advancing its offset.",
    );
    expect(get).toHaveBeenCalledTimes(2);
  });
});

describe("bulkCreateSites", () => {
  it("posts the parsed sites using the backend bulk-import contract", async () => {
    const sites = [
      { name: "Example", base_url: "https://example.com", platform: "html" as const },
    ];
    const result = { created: [], skipped: [], rejected: [] };
    post.mockResolvedValue({ data: result });

    await expect(bulkCreateSites(sites)).resolves.toEqual(result);
    expect(post).toHaveBeenCalledWith("/sites/bulk", { sites });
  });
});

describe("updateSuggestionMode", () => {
  it("saves one site's future generation method", async () => {
    const state = {
      suggestion_mode: "experimental",
      suggestion_mode_managed: false,
      suggestion_comparison_enabled: false,
    };
    put.mockResolvedValue({ data: state });

    await expect(updateSuggestionMode(42, "experimental")).resolves.toEqual(state);
    expect(put).toHaveBeenCalledWith("/sites/42/suggestion-mode", {
      suggestion_mode: "experimental",
    });
  });
});

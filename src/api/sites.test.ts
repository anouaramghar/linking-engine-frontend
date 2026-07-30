import { beforeEach, describe, expect, it, vi } from "vitest";

import { bulkCreateSites, listSites } from "./sites";

const get = vi.hoisted(() => vi.fn());
const post = vi.hoisted(() => vi.fn());

vi.mock("./client", () => ({ api: { get, post } }));

beforeEach(() => {
  get.mockReset();
  post.mockReset();
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

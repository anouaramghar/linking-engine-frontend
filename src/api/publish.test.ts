import { beforeEach, describe, expect, it, vi } from "vitest";

import { getPublicationDryRun, listPendingPublication } from "./publish";

const api = vi.hoisted(() => ({
  get: vi.fn(),
}));

vi.mock("./client", () => ({ api }));

beforeEach(() => {
  api.get.mockReset();
});

describe("listPendingPublication", () => {
  it("reads approved backlogs independently of loaded queue pages", async () => {
    const pending = [
      { site_id: 3, awaiting_publication: 24 },
      { site_id: 8, awaiting_publication: 2 },
    ];
    api.get.mockResolvedValue({ data: pending });

    await expect(listPendingPublication()).resolves.toEqual(pending);
    expect(api.get).toHaveBeenCalledWith("/publish/pending");
  });
});

describe("getPublicationDryRun", () => {
  it("requests a bounded live preview with enough time for WordPress reads", async () => {
    const preview = { site_id: 3, articles: [] };
    api.get.mockResolvedValue({ data: preview });

    await expect(getPublicationDryRun(3, 7)).resolves.toEqual(preview);
    expect(api.get).toHaveBeenCalledWith("/publish/3/dry-run", {
      params: { max_articles: 7 },
      timeout: 180_000,
    });
  });
});

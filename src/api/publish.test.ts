import { beforeEach, describe, expect, it, vi } from "vitest";

import { listPendingPublication } from "./publish";

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

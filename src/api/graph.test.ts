import { beforeEach, describe, expect, it, vi } from "vitest";

import { getGraphNetwork } from "./graph";

const api = vi.hoisted(() => ({
  get: vi.fn(),
}));

vi.mock("./client", () => ({ api }));

beforeEach(() => {
  api.get.mockReset();
});

describe("graph API", () => {
  it("loads the complete site network", async () => {
    const network = { nodes: [], edges: [] };
    api.get.mockResolvedValue({ data: network });

    await expect(getGraphNetwork(7)).resolves.toEqual(network);
    expect(api.get).toHaveBeenCalledWith("/sites/7/graph/network");
  });
});

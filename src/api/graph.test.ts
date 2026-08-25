import { beforeEach, describe, expect, it, vi } from "vitest";

import { getGraphNeighborhood, getGraphNetwork } from "./graph";

const api = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}));

vi.mock("./client", () => ({ api }));

beforeEach(() => {
  api.get.mockReset();
  api.post.mockReset();
});

describe("graph API", () => {
  it("loads the complete site network", async () => {
    const network = { nodes: [], edges: [] };
    api.get.mockResolvedValue({ data: network });

    await expect(getGraphNetwork(7)).resolves.toEqual(network);
    expect(api.get).toHaveBeenCalledWith("/sites/7/graph/network");
  });

  it("loads the selected suggestions for the prepared-link overlay", async () => {
    const neighborhood = { proposed_edges: [] };
    api.post.mockResolvedValue({ data: neighborhood });

    await expect(getGraphNeighborhood(7, [11, 12])).resolves.toEqual(neighborhood);
    expect(api.post).toHaveBeenCalledWith("/sites/7/graph/neighborhood", {
      suggestion_ids: [11, 12],
      max_nodes: 80,
    });
  });
});

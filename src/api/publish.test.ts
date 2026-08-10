import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  approvePublicationPlans,
  listPendingPublication,
  preparePublicationPlans,
  queueApprovedPlans,
} from "./publish";

const api = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}));

vi.mock("./client", () => ({ api }));

beforeEach(() => {
  api.get.mockReset();
  api.post.mockReset();
});

describe("listPendingPublication", () => {
  it("keeps selected suggestions and approved plans as separate counts", async () => {
    const pending = [
      { site_id: 3, selected_suggestions: 24, approved_plans: 0 },
      { site_id: 8, selected_suggestions: 0, approved_plans: 2 },
    ];
    api.get.mockResolvedValue({ data: pending });

    await expect(listPendingPublication()).resolves.toEqual(pending);
    expect(api.get).toHaveBeenCalledWith("/publish/pending");
  });
});

describe("preparePublicationPlans", () => {
  it("requests a bounded preparation with enough time for live WordPress reads", async () => {
    const preparation = { site_id: 3, plans: [] };
    api.post.mockResolvedValue({ data: preparation });

    await expect(preparePublicationPlans(3, 7)).resolves.toEqual(preparation);
    expect(api.post).toHaveBeenCalledWith("/publish/3/plans/prepare", undefined, {
      params: { max_articles: 7 },
      timeout: 180_000,
    });
  });
});

describe("approvePublicationPlans", () => {
  it("names each plan by id and by the hash the operator was shown", async () => {
    api.post.mockResolvedValue({ data: { approved: [55], approved_by: "telegram:1" } });

    await approvePublicationPlans(3, [{ id: 55, plan_hash: "a".repeat(64) }]);

    expect(api.post).toHaveBeenCalledWith("/publish/3/plans/approve", {
      plans: [{ id: 55, plan_hash: "a".repeat(64) }],
    });
  });
});

describe("queueApprovedPlans", () => {
  it("can intentionally queue every approved plan for recovery", async () => {
    api.post.mockResolvedValue({ data: { job_id: "abc" } });

    await queueApprovedPlans(3);

    expect(api.post).toHaveBeenCalledWith("/publish/3", undefined);
  });

  it("limits the approval click to the plans that were visible", async () => {
    api.post.mockResolvedValue({ data: { job_id: "abc" } });

    await queueApprovedPlans(3, [55, 56]);

    expect(api.post).toHaveBeenCalledWith("/publish/3", { plan_ids: [55, 56] });
  });
});

describe("the removed publish-from-a-site-id path", () => {
  it("is not exported by the sites API any more", async () => {
    const sites = await import("./sites");

    // The old `publishSite(id)` published every selected suggestion for a site
    // with nobody having seen the resulting edit. Publication is reachable only
    // through preparation and approval now.
    expect("publishSite" in sites).toBe(false);
  });
});

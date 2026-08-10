import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  approvePoolSource,
  bulkCreateSites,
  getExternalLinkPolicy,
  listExternalSourceEvaluations,
  listPoolAuditEvents,
  listSites,
  reactivatePoolSource,
  revokePoolSource,
  updateExternalLinkPolicy,
} from "./sites";

const get = vi.hoisted(() => vi.fn());
const post = vi.hoisted(() => vi.fn());
const del = vi.hoisted(() => vi.fn());
const put = vi.hoisted(() => vi.fn());

vi.mock("./client", () => ({ api: { get, post, put, delete: del } }));

beforeEach(() => {
  get.mockReset();
  post.mockReset();
  del.mockReset();
  put.mockReset();
});

describe("external-link policy", () => {
  it("reads and updates one managed site's policy", async () => {
    const policy = { site_id: 8, min_trust_score: 70 };
    get.mockResolvedValue({ data: policy });
    put.mockResolvedValue({ data: policy });

    await expect(getExternalLinkPolicy(8)).resolves.toEqual(policy);
    expect(get).toHaveBeenCalledWith("/sites/8/external-link-policy");

    const update = {
      external_links_enabled: true,
      require_https: true,
      min_trust_score: 70,
      min_domain_age_days: 30,
      trusted_tlds: ["org"],
      allowlist_domains: [],
      blocklist_domains: [],
      competitor_domains: ["competitor.example"],
    };
    await expect(updateExternalLinkPolicy({ siteId: 8, policy: update })).resolves.toEqual(
      policy,
    );
    expect(put).toHaveBeenCalledWith("/sites/8/external-link-policy", update);
  });

  it("returns the source evaluation items", async () => {
    const items = [{ site_id: 4, trust_score: 90 }];
    get.mockResolvedValue({ data: { items } });

    await expect(listExternalSourceEvaluations(8)).resolves.toEqual(items);
    expect(get).toHaveBeenCalledWith("/sites/8/external-link-policy/sources");
  });
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

describe("content-pool controls", () => {
  // The operator is identified by their API key, so these carry no body. A
  // browser-supplied name would be self-asserted, and the audit trail these
  // actions write is only worth keeping if the identity in it is not.
  it("approves a pool source without asserting an identity", async () => {
    post.mockResolvedValue({ data: { id: 7 } });

    await approvePoolSource(7);

    expect(post).toHaveBeenCalledWith("/sites/7/pool-source/approval");
  });

  it("revokes pool approval", async () => {
    del.mockResolvedValue({ data: { id: 7 } });

    await revokePoolSource(7);

    expect(del).toHaveBeenCalledWith("/sites/7/pool-source/approval");
  });

  it("reactivates a quarantined pool source without asserting an identity", async () => {
    post.mockResolvedValue({ data: { id: 7 } });

    await reactivatePoolSource(7);

    expect(post).toHaveBeenCalledWith("/sites/7/pool-source/reactivate");
  });

  it("reads the audit trail newest-first within one page", async () => {
    get.mockResolvedValue({ data: [] });

    await listPoolAuditEvents(7);

    expect(get).toHaveBeenCalledWith("/sites/7/pool-source/audit-events", {
      params: { limit: 50, offset: 0 },
    });
  });
});

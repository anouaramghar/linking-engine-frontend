import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  approvePoolSource,
  bulkCreateSites,
  deleteSite,
  getExternalLinkPolicy,
  importArticleRows,
  ingestPoolSourceBatch,
  listExternalSourceEvaluations,
  listPoolAuditEvents,
  listSites,
  reactivatePoolSource,
  revokePoolSource,
  updateExternalLinkPolicy,
  validatePoolSources,
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
  it("loads one bounded server page with optional search", async () => {
    const page = [{ id: 1001 }];
    get.mockResolvedValue({ data: page });

    const sites = await listSites(1000, "docs");

    expect(sites).toEqual(page);
    expect(get).toHaveBeenCalledWith("/sites", {
      params: { limit: 1000, offset: 1000, search: "docs" },
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

describe("importArticleRows", () => {
  it("sends normalized CSV rows and keeps snapshot replacement explicit", async () => {
    const rows = [{ url: "https://example.com/a", title: "A" }];
    const result = { ingestion_run_id: 4, imported: 1, updated: 0 };
    post.mockResolvedValue({ data: result });

    await expect(importArticleRows(8, rows, true)).resolves.toEqual(result);
    expect(post).toHaveBeenCalledWith("/sites/8/articles/import", {
      rows,
      replace_snapshot: true,
    });
  });
});

describe("deleteSite", () => {
  it("sends the site name so the backend can refuse accidental deletes", async () => {
    del.mockResolvedValue({ data: undefined });

    await deleteSite(9, "Acme Blog");

    expect(del).toHaveBeenCalledWith("/sites/9", {
      params: { confirm_name: "Acme Blog" },
    });
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

  it("validates pool sources with bounded requests and keeps their row order", async () => {
    let active = 0;
    let maximumActive = 0;
    post.mockImplementation(async (_url: string, payload: { base_url: string }) => {
      active++;
      maximumActive = Math.max(maximumActive, active);
      await Promise.resolve();
      active--;
      return {
        data: {
          base_url: payload.base_url,
          valid: true,
          source_type: "rss_atom",
          reason: null,
        },
      };
    });
    const sources = Array.from({ length: 8 }, (_, index) => ({
      name: `Feed ${index}`,
      base_url: `https://news-${index}.example.com/feed.xml`,
      platform: "pool" as const,
    }));

    const result = await validatePoolSources(sources);

    expect(maximumActive).toBe(5);
    expect(result.map((entry) => entry.base_url)).toEqual(
      sources.map((source) => source.base_url),
    );
    expect(post).toHaveBeenCalledTimes(8);
    expect(post).toHaveBeenNthCalledWith(1, "/sites/pool-source/validate", {
      name: "Feed 0",
      base_url: "https://news-0.example.com/feed.xml",
    });
  });

  it("queues a bounded pool crawl batch and reports partial failures", async () => {
    let active = 0;
    let maximumActive = 0;
    post.mockImplementation(async (url: string) => {
      const siteId = Number(url.split("/")[2]);
      active++;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, 0));
      active--;
      if (siteId === 4) throw new Error("already crawling");
      return { data: { job_id: `job-${siteId}`, job_run_id: siteId } };
    });

    const result = await ingestPoolSourceBatch([1, 2, 3, 4, 5, 6, 7]);

    expect(maximumActive).toBe(5);
    expect(result.queued.map(({ siteId }) => siteId).sort((a, b) => a - b)).toEqual([
      1, 2, 3, 5, 6, 7,
    ]);
    expect(result.failed.map(({ siteId }) => siteId)).toEqual([4]);
    expect(post).toHaveBeenCalledWith("/sites/1/ingest");
  });

  it("supports loading older audit pages", async () => {
    get.mockResolvedValue({ data: [] });

    await listPoolAuditEvents(7, 25, 50);

    expect(get).toHaveBeenCalledWith("/sites/7/pool-source/audit-events", {
      params: { limit: 25, offset: 50 },
    });
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  approvePoolSource,
  bulkCreateSites,
  deleteSite,
  listPoolAuditEvents,
  listSites,
  reactivatePoolSource,
  revokePoolSource,
} from "./sites";

const get = vi.hoisted(() => vi.fn());
const post = vi.hoisted(() => vi.fn());
const del = vi.hoisted(() => vi.fn());

vi.mock("./client", () => ({ api: { get, post, delete: del } }));

beforeEach(() => {
  get.mockReset();
  post.mockReset();
  del.mockReset();
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

  it("supports loading older audit pages", async () => {
    get.mockResolvedValue({ data: [] });

    await listPoolAuditEvents(7, 25, 50);

    expect(get).toHaveBeenCalledWith("/sites/7/pool-source/audit-events", {
      params: { limit: 25, offset: 50 },
    });
  });
});

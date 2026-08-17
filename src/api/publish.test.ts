import axios from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  approvePublicationPlans,
  exportPublicationCsv,
  getPendingPublicationSite,
  getPublicationPlanHtml,
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
    const pending = {
      items: [
        { site_id: 3, selected_suggestions: 24, approved_plans: 0 },
        { site_id: 8, selected_suggestions: 0, approved_plans: 2 },
      ],
      next_cursor: null,
      total_sites: 2,
      total_selected_suggestions: 24,
      total_approved_plans: 2,
    };
    api.get.mockResolvedValue({ data: pending });

    await expect(listPendingPublication()).resolves.toEqual(pending);
    expect(api.get).toHaveBeenCalledWith("/publish/pending", {
      params: {
        cursor: undefined,
        include_totals: true,
        limit: 50,
        search: undefined,
      },
    });
  });

  it("loads one site directly without walking the fleet pages", async () => {
    const pending = { site_id: 1001, selected_suggestions: 3, approved_plans: 0 };
    api.get.mockResolvedValue({ data: pending });

    await expect(getPendingPublicationSite(1001)).resolves.toEqual(pending);
    expect(api.get).toHaveBeenCalledWith("/publish/pending/1001");
  });

  it("does not recompute fleet totals on later cursor pages", async () => {
    api.get.mockResolvedValue({
      data: {
        items: [],
        next_cursor: null,
        total_sites: null,
        total_selected_suggestions: null,
        total_approved_plans: null,
      },
    });

    await listPendingPublication(1000, "news");

    expect(api.get).toHaveBeenCalledWith("/publish/pending", {
      params: {
        cursor: 1000,
        include_totals: false,
        limit: 50,
        search: "news",
      },
    });
  });
});

describe("preparePublicationPlans", () => {
  it("queues durable preparation instead of holding an HTTP request open", async () => {
    const accepted = { job_id: "prepare-3" };
    api.post.mockResolvedValue({ data: accepted });

    await expect(preparePublicationPlans(3, 7)).resolves.toEqual(accepted);
    expect(api.post).toHaveBeenCalledWith("/publish/3/plans/prepare-async", undefined, {
      params: { max_articles: 7, suggestion_ids: undefined },
      paramsSerializer: { indexes: null },
    });
  });

  /**
   * The wire format, not the call shape, because this is where it can silently
   * go wrong. Axios writes an array as `suggestion_ids[]=7` by default and
   * FastAPI binds nothing from that: the engine would prepare the whole site
   * while the operator believed they had asked about one link.
   */
  it("sends a named link as repeated bare keys", async () => {
    api.post.mockResolvedValue({ data: { job_id: "prepare-3" } });

    await preparePublicationPlans(3, 10, [7, 9]);

    const [url, , config] = api.post.mock.calls[0] as [string, undefined, object];
    expect(axios.getUri({ url, ...config })).toBe(
      "/publish/3/plans/prepare-async?max_articles=10&suggestion_ids=7&suggestion_ids=9",
    );
  });

  it("asks for the whole site when no link is named", async () => {
    api.post.mockResolvedValue({ data: { job_id: "prepare-3" } });

    await preparePublicationPlans(3, 10, []);

    const [url, , config] = api.post.mock.calls[0] as [string, undefined, object];
    expect(axios.getUri({ url, ...config })).toBe(
      "/publish/3/plans/prepare-async?max_articles=10",
    );
  });
});

describe("getPublicationPlanHtml", () => {
  it("loads the heavy exact bytes only when advanced review asks for them", async () => {
    const html = {
      id: 55,
      plan_hash: "a".repeat(64),
      original_html: "<p>before</p>",
      updated_html: "<p>after</p>",
    };
    api.get.mockResolvedValue({ data: html });

    await expect(getPublicationPlanHtml(3, 55)).resolves.toEqual(html);
    expect(api.get).toHaveBeenCalledWith("/publish/3/plans/55/html");
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

describe("exportPublicationCsv", () => {
  it("downloads the server-verified non-WordPress artifact", async () => {
    const blob = new Blob(["plan_id,plan_hash\n55,abc"]);
    api.get.mockResolvedValue({ data: blob });

    await expect(exportPublicationCsv(3)).resolves.toBe(blob);
    expect(api.get).toHaveBeenCalledWith("/publish/3/export.csv", {
      responseType: "blob",
    });
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

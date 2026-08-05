import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import SitesPage from "./SitesPage";

const mocks = vi.hoisted(() => ({
  sites: {
    data: [] as unknown[],
    isPending: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
    dataUpdatedAt: 0,
  },
  activeJobs: {
    data: [] as unknown[],
  },
  batch: {
    data: undefined as unknown,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
    requestedId: null as number | null,
  },
  createBatch: {
    isPending: false,
    mutateAsync: vi.fn(),
  },
  retryBatch: {
    isPending: false,
    variables: undefined as { siteId: number } | undefined,
    mutateAsync: vi.fn(),
  },
}));

vi.mock("../hooks/useSites", () => ({
  useSites: () => mocks.sites,
  useDeleteSite: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("../hooks/useJobs", () => ({
  useActiveJobs: () => mocks.activeJobs,
  useJob: () => ({ data: undefined }),
}));

vi.mock("../hooks/usePipeline", () => ({
  usePipelineBatch: (batchId: number | null) => {
    mocks.batch.requestedId = batchId;
    return mocks.batch;
  },
  useCreatePipelineBatch: () => mocks.createBatch,
  useRetryPipelineSite: () => mocks.retryBatch,
}));

beforeEach(() => {
  Object.assign(mocks.sites, {
    data: [],
    isPending: false,
    isError: false,
    isFetching: false,
    dataUpdatedAt: 0,
  });
  mocks.activeJobs.data = [];
  Object.assign(mocks.batch, {
    data: undefined,
    isError: false,
    isFetching: false,
    requestedId: null,
  });
  Object.assign(mocks.createBatch, { isPending: false });
  mocks.createBatch.mutateAsync.mockReset();
  Object.assign(mocks.retryBatch, { isPending: false, variables: undefined });
  mocks.retryBatch.mutateAsync.mockReset();
  window.history.replaceState({}, "", "/sites");
});

afterEach(cleanup);

describe("SitesPage scheduler copy", () => {
  it("identifies RQ as the re-crawl scheduler", () => {
    render(<SitesPage />);

    expect(document.body.textContent).toContain("Scheduled re-crawls run through RQ.");
    expect(document.body.textContent?.toLowerCase()).not.toContain("celery");
  });

  it("does not expose unsupported future or fleet actions", () => {
    render(<SitesPage />);

    expect(document.body.textContent).not.toContain("GNN");
    expect(document.body.textContent).not.toContain("External links");
    expect(document.body.textContent).not.toContain("Generate anchors");
    expect(document.body.textContent).not.toContain("Crawl all");
    expect(document.body.textContent).not.toContain("Analyze all");
  });

  it("does not expose a manual refresh control", () => {
    render(<SitesPage />);

    expect(screen.queryByRole("button", { name: "Refresh" })).toBeNull();
  });
});

describe("SitesPage batch pipeline", () => {
  it("selects non-pool sites and starts one batch", async () => {
    mocks.sites.data = [
      {
        id: 4,
        name: "Nona",
        base_url: "https://nona.example.com",
        platform: "html",
        crawl_frequency: "manual",
        created_at: "2026-08-04T08:00:00Z",
      },
      {
        id: 5,
        name: "Shawn",
        base_url: "https://shawn.example.com",
        platform: "wordpress",
        crawl_frequency: "manual",
        created_at: "2026-08-04T08:00:00Z",
      },
      {
        id: 6,
        name: "Pool",
        base_url: "https://pool.example.com",
        platform: "pool",
        crawl_frequency: "daily",
        created_at: "2026-08-04T08:00:00Z",
      },
    ];
    mocks.createBatch.mutateAsync.mockResolvedValue({ id: 12, total: 2 });
    render(<SitesPage />);

    fireEvent.click(screen.getByRole("checkbox", { name: "Select Nona for batch" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Select Shawn for batch" }));
    expect(screen.queryByRole("checkbox", { name: "Select Pool for batch" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Run batch (2)" }));

    await waitFor(() => expect(mocks.createBatch.mutateAsync).toHaveBeenCalledWith([4, 5]));
    expect(window.location.search).toBe("?batch=12");
  });

  it("restores batch monitoring from the page URL", () => {
    window.history.replaceState({}, "", "/sites?batch=27");

    render(<SitesPage />);

    expect(mocks.batch.requestedId).toBe(27);
  });
});

describe("SitesPage load states", () => {
  it("tells a failed load apart from an empty account", () => {
    mocks.sites.isError = true;
    render(<SitesPage />);

    expect(screen.getByRole("alert").textContent).toContain(
      "Your sites could not be loaded",
    );
    expect(document.body.textContent).not.toContain("No sites are connected yet");
  });

  it("offers a retry that refetches", () => {
    mocks.sites.isError = true;
    render(<SitesPage />);

    screen.getByRole("button", { name: "Try again" }).click();
    expect(mocks.sites.refetch).toHaveBeenCalled();
  });

  it("shows a placeholder instead of an empty list while loading", () => {
    mocks.sites.isPending = true;
    render(<SitesPage />);

    expect(screen.getByLabelText("Loading sites")).not.toBeNull();
    expect(document.body.textContent).not.toContain("No sites are connected yet");
  });

  it("invites a first site once the load succeeds with nothing", () => {
    render(<SitesPage />);

    expect(document.body.textContent).toContain("No sites are connected yet");
  });

  it("shows the real site details returned by the API", () => {
    const lastCrawl = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    mocks.sites.data = [
      {
        id: 42,
        name: "Docs",
        base_url: "https://docs.example.com",
        platform: "wordpress",
        crawl_frequency: "daily",
        created_at: "2026-07-28T08:00:00Z",
        last_ingestion_status: "succeeded",
        article_count: 482,
        internal_link_count: 3914,
        last_crawl_at: lastCrawl,
      },
    ];

    render(<SitesPage />);

    expect(document.body.textContent).toContain("Articles");
    expect(document.body.textContent).toContain("Int. links");
    expect(document.body.textContent).toContain("Last crawl");
    expect(document.body.textContent).toContain("482");
    // Grouped, and grouped the same way everywhere: counts run through
    // `formatCount`, which pins the separator rather than leaving it to
    // whatever locale the browser happens to be in.
    expect(document.body.textContent).toContain("3,914");
    expect(document.body.textContent).toContain("2 h ago");
    expect(document.body.textContent).not.toContain("Soon");
  });
});

describe("SitesPage job progress", () => {
  it("restores a durable active job as the site's single status badge", () => {
    mocks.sites.data = [
      {
        id: 42,
        name: "Docs",
        base_url: "https://docs.example.com",
        platform: "wordpress",
        crawl_frequency: "daily",
        created_at: "2026-07-28T08:00:00Z",
        last_ingestion_status: "succeeded",
      },
    ];
    mocks.activeJobs.data = [
      {
        id: 9,
        site_id: 42,
        kind: "ingestion",
        status: "running",
        queue_job_id: "rq-9",
        attempts: 1,
        result: null,
        progress: { stage: "resolving_links" },
        progress_at: "2026-07-28T08:01:00Z",
        error: null,
        enqueued_at: "2026-07-28T08:00:30Z",
        started_at: "2026-07-28T08:00:31Z",
        finished_at: null,
      },
    ];

    render(<SitesPage />);

    expect(screen.getByRole("status", { name: "Resolving links" })).not.toBeNull();
    expect(document.body.textContent).not.toContain("Indexed");
  });
});

describe("SitesPage crawled vs analysed", () => {
  const crawled = {
    id: 42,
    name: "Docs",
    base_url: "https://docs.example.com",
    platform: "wordpress",
    crawl_frequency: "daily",
    created_at: "2026-07-28T08:00:00Z",
    last_ingestion_status: "succeeded",
    last_crawl_at: "2026-07-28T08:00:00Z",
  };

  it("calls a crawled but unanalysed site Indexed", () => {
    mocks.sites.data = [crawled];
    render(<SitesPage />);

    expect(document.body.textContent).toContain("Indexed");
    expect(document.body.textContent).not.toContain("Analyzed");
  });

  it("calls an analysed site Analyzed, not Indexed", () => {
    mocks.sites.data = [
      {
        ...crawled,
        last_analysis_status: "succeeded",
        last_analysis_at: "2026-07-28T09:00:00Z",
      },
    ];
    render(<SitesPage />);

    expect(document.body.textContent).toContain("Analyzed");
    expect(document.body.textContent).not.toContain("Indexed");
  });

  it("drops back to Indexed when the crawl is newer than the analysis", () => {
    mocks.sites.data = [
      {
        ...crawled,
        last_crawl_at: "2026-07-28T10:00:00Z",
        last_analysis_status: "succeeded",
        last_analysis_at: "2026-07-28T09:00:00Z",
      },
    ];
    render(<SitesPage />);

    expect(document.body.textContent).toContain("Indexed");
    expect(document.body.textContent).not.toContain("Analyzed");
  });

  it("surfaces a failed analysis on an indexed site", () => {
    mocks.sites.data = [
      {
        ...crawled,
        last_analysis_status: "failed",
        last_analysis_at: "2026-07-28T09:00:00Z",
      },
    ];
    render(<SitesPage />);

    expect(document.body.textContent).toContain("Analysis failed");
  });
});

describe("SitesPage Hybrid standard", () => {
  const site = {
    id: 42,
    name: "Docs",
    base_url: "https://docs.example.com",
    platform: "wordpress",
    crawl_frequency: "daily",
    suggestion_mode: "experimental",
    suggestion_mode_managed: true,
    suggestion_comparison_enabled: false,
    suggestion_slots_available: 3,
    created_at: "2026-07-28T08:00:00Z",
    last_ingestion_status: "succeeded",
    article_count: 20,
    internal_link_count: 10,
    last_crawl_at: "2026-07-28T08:00:00Z",
  };

  it("shows Hybrid as the managed generation method", () => {
    mocks.sites.data = [site];
    render(<SitesPage />);

    expect(document.body.textContent).toContain("Hybrid");

    fireEvent.click(screen.getByRole("button", { name: "Actions" }));
    expect(screen.getByRole("menuitem", { name: "Generate suggestions" })).not.toBeNull();
    expect(screen.queryByRole("menuitem", { name: /Compare methods/ })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: /Suggestion method/ })).toBeNull();
  });

  it("explains a full Hybrid queue", () => {
    mocks.sites.data = [{ ...site, suggestion_slots_available: 0 }];
    render(<SitesPage />);

    fireEvent.click(screen.getByRole("button", { name: "Actions" }));
    const generate = screen.getByRole("menuitem", {
      name: "Generate suggestions — queue full",
    }) as HTMLButtonElement;
    expect(generate.disabled).toBe(true);
  });
});

describe("SitesPage source controls", () => {
  it("keeps content-pool sources out of the owned-sites fleet", () => {
    mocks.sites.data = [
      { id: 1, name: "Docs", base_url: "https://docs.example.com", platform: "wordpress" },
      { id: 2, name: "News pool", base_url: "https://example.com/feed", platform: "pool" },
    ];
    render(<SitesPage />);

    expect(document.body.textContent).toContain("1 connected source");
    expect(document.body.textContent).toContain("docs.example.com");
    expect(document.body.textContent).not.toContain("News pool");
  });

  it("shows no owned-site row when the account only has a pool source", () => {
    mocks.sites.data = [{
      id: 2,
      name: "News pool",
      base_url: "https://example.com/feed",
      platform: "pool",
      suggestion_slots_available: 0,
    }];
    render(<SitesPage />);

    expect(document.body.textContent).toContain("No sites are connected yet");
    expect(document.body.textContent).not.toContain("News pool");
  });

  // Pool approval moved to ContentPoolPage, which owns its own tests. What is
  // still worth asserting here is the negative: an owned site carries none of
  // that gating and stays crawlable.
  it("leaves crawling available on an owned site", () => {
    mocks.sites.data = [
      {
        id: 1,
        name: "Docs",
        base_url: "https://docs.example.com",
        platform: "wordpress",
      },
    ];
    render(<SitesPage />);

    expect((screen.getByRole("button", { name: "Crawl" }) as HTMLButtonElement).disabled).toBe(false);
  });
});

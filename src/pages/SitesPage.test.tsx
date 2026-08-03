import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
}));

vi.mock("../hooks/useSites", () => ({
  useSites: () => mocks.sites,
  useDeleteSite: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("../hooks/useJobs", () => ({
  useActiveJobs: () => mocks.activeJobs,
  useJob: () => ({ data: undefined }),
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
  it("filters connected sources without hiding the fleet total", () => {
    mocks.sites.data = [
      { id: 1, name: "Docs", base_url: "https://docs.example.com", platform: "wordpress" },
      { id: 2, name: "News pool", base_url: "https://example.com/feed", platform: "pool" },
    ];
    render(<SitesPage />);

    fireEvent.change(screen.getByRole("searchbox", { name: "Search sources" }), {
      target: { value: "pool" },
    });

    expect(document.body.textContent).toContain("2 connected sources");
    expect(document.body.textContent).toContain("News pool");
    expect(document.body.textContent).not.toContain("docs.example.com");
  });

  it("keeps pool actions read-only", () => {
    mocks.sites.data = [{
      id: 2,
      name: "News pool",
      base_url: "https://example.com/feed",
      platform: "pool",
      suggestion_slots_available: 0,
    }];
    render(<SitesPage />);

    fireEvent.click(screen.getByRole("button", { name: "Actions" }));
    expect(screen.queryByRole("menuitem", { name: /Generate suggestions/ })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "Publish approved" })).toBeNull();
    expect(screen.getByRole("menuitem", { name: "Delete site" })).not.toBeNull();
  });
});

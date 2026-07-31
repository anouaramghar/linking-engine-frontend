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
  },
  activeJobs: {
    data: [] as unknown[],
  },
  updateMode: {
    mutate: vi.fn(),
    reset: vi.fn(),
    isPending: false,
    isError: false,
    error: null as unknown,
  },
}));

vi.mock("../hooks/useSites", () => ({
  useSites: () => mocks.sites,
  useDeleteSite: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateSuggestionMode: () => mocks.updateMode,
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
  });
  mocks.activeJobs.data = [];
  mocks.updateMode.mutate.mockReset();
  mocks.updateMode.reset.mockReset();
  mocks.updateMode.isPending = false;
  mocks.updateMode.isError = false;
  mocks.updateMode.error = null;
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
    expect(document.body.textContent?.replace(/\s/g, "")).toContain("3914");
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

describe("SitesPage suggestion method controls", () => {
  const site = {
    id: 42,
    name: "Docs",
    base_url: "https://docs.example.com",
    platform: "wordpress",
    crawl_frequency: "daily",
    suggestion_mode: "standard",
    suggestion_mode_managed: false,
    suggestion_comparison_enabled: false,
    suggestion_slots_available: 3,
    created_at: "2026-07-28T08:00:00Z",
    last_ingestion_status: "succeeded",
    article_count: 20,
    internal_link_count: 10,
    last_crawl_at: "2026-07-28T08:00:00Z",
  };

  it("uses one generation action and shows the saved site method", () => {
    mocks.sites.data = [site];
    render(<SitesPage />);

    expect(document.body.textContent).toContain("Standard");
    expect(document.body.textContent).not.toContain("Suggest (baseline)");

    fireEvent.click(screen.getByRole("button", { name: "Actions" }));
    expect(screen.getByRole("menuitem", { name: "Generate suggestions" })).not.toBeNull();
    expect(screen.getByRole("menuitem", { name: "Compare methods" })).not.toBeNull();
    expect(screen.getByRole("menuitem", { name: "Suggestion method…" })).not.toBeNull();
  });

  it("explains a full queue while leaving comparison available", () => {
    mocks.sites.data = [{ ...site, suggestion_slots_available: 0 }];
    render(<SitesPage />);

    fireEvent.click(screen.getByRole("button", { name: "Actions" }));
    const generate = screen.getByRole("menuitem", {
      name: "Generate suggestions — queue full",
    }) as HTMLButtonElement;
    const compare = screen.getByRole("menuitem", {
      name: "Compare methods",
    }) as HTMLButtonElement;

    expect(generate.disabled).toBe(true);
    expect(compare.disabled).toBe(false);
  });

  it("saves an experimental method without replacing existing suggestions", () => {
    mocks.sites.data = [site];
    render(<SitesPage />);

    fireEvent.click(screen.getByRole("button", { name: "Actions" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Suggestion method…" }));

    expect(screen.getByRole("dialog").textContent).toContain(
      "Existing suggestions and editorial decisions stay in place.",
    );
    fireEvent.click(screen.getByRole("radio", { name: /Experimental/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save method" }));

    expect(mocks.updateMode.mutate).toHaveBeenCalledWith(
      { siteId: 42, suggestionMode: "experimental" },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });
});

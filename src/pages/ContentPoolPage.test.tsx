import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ContentPoolPage from "./ContentPoolPage";

const mocks = vi.hoisted(() => ({
  sites: { data: [] as unknown[], isPending: false, isError: false, isFetching: false, refetch: vi.fn() },
  approve: vi.fn(),
  revoke: vi.fn(),
  reactivate: vi.fn(),
  remove: vi.fn(),
  bulk: vi.fn(),
  poolBatch: vi.fn(),
}));

vi.mock("../hooks/useSites", () => ({
  useSites: () => mocks.sites,
  useApprovePoolSource: () => ({ mutateAsync: mocks.approve }),
  useRevokePoolSource: () => ({ mutateAsync: mocks.revoke }),
  useReactivatePoolSource: () => ({ mutateAsync: mocks.reactivate }),
  useDeleteSite: () => ({ mutateAsync: mocks.remove, isPending: false }),
  useCreateSite: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
  useBulkCreateSites: () => ({
    mutate: mocks.bulk,
    reset: vi.fn(),
    data: undefined,
    isPending: false,
    isError: false,
  }),
  useValidatePoolSources: () => ({
    mutateAsync: vi.fn(),
    reset: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
  }),
  usePoolIngestionBatch: () => ({
    mutateAsync: mocks.poolBatch,
    isPending: false,
  }),
  usePoolAuditEvents: () => ({
    events: [],
    hasNextPage: false,
    isPending: false,
    isError: false,
    isFetching: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
  }),
}));

vi.mock("../api/sites", async (original) => ({
  ...(await original()),
  ingestSite: vi.fn(),
}));

vi.mock("../hooks/useJobs", () => ({
  useActiveJobs: () => ({ data: [], refetch: vi.fn() }),
  useJob: () => ({ data: undefined }),
}));

beforeEach(() => {
  mocks.sites.data = [];
  mocks.sites.isPending = false;
  mocks.sites.isError = false;
  mocks.approve.mockReset();
  mocks.revoke.mockReset();
  mocks.reactivate.mockReset();
  mocks.remove.mockReset();
  mocks.bulk.mockReset();
  mocks.poolBatch.mockReset();
});

afterEach(cleanup);

describe("ContentPoolPage", () => {
  it("shows only pool sources and exposes approval", async () => {
    mocks.sites.data = [
      { id: 1, name: "Owned", base_url: "https://owned.example.com", platform: "html" },
      {
        id: 2,
        name: "Industry feed",
        base_url: "https://news.example.com/feed",
        platform: "pool",
        pool_source_approved: false,
        pool_source_quarantined: false,
        article_count: 12,
      },
    ];
    mocks.approve.mockResolvedValue({});
    render(<ContentPoolPage />);

    expect(document.body.textContent).toContain("Industry feed");
    expect(document.body.textContent).toContain("Not approved");
    expect(document.body.textContent).not.toContain("Owned");
    fireEvent.click(screen.getByRole("button", { name: "Approve Industry feed" }));
    expect(screen.getByRole("dialog").textContent).toContain("https://news.example.com/feed");
    fireEvent.click(screen.getByRole("button", { name: "Approve source" }));

    await waitFor(() => expect(mocks.approve).toHaveBeenCalledWith(2));
  });

  it("shows quarantine context and allows reactivation", async () => {
    mocks.sites.data = [
      {
        id: 3,
        name: "Research feed",
        base_url: "https://research.example.com/feed",
        platform: "pool",
        pool_source_approved: true,
        pool_source_quarantined: true,
        pool_source_quarantine_reason: "three consecutive failures",
        pool_source_consecutive_failures: 3,
      },
    ];
    mocks.reactivate.mockResolvedValue({});
    render(<ContentPoolPage />);

    expect(document.body.textContent).toContain("Quarantined");
    expect(document.body.textContent).toContain("three consecutive failures");
    fireEvent.click(screen.getByRole("button", { name: /Actions for Research feed/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Reactivate" }));

    await waitFor(() => expect(mocks.reactivate).toHaveBeenCalledWith(3));
  });

  it("opens a creation form fixed to the content-pool connector", () => {
    render(<ContentPoolPage />);

    fireEvent.click(screen.getByRole("button", { name: "+ Connect pool source" }));
    expect(screen.getByRole("dialog").textContent).toContain("Connect a pool source");
    expect((screen.getByRole("combobox", { name: "Connector" }) as HTMLSelectElement).value).toBe(
      "pool",
    );
    expect((screen.getByRole("combobox", { name: "Connector" }) as HTMLSelectElement).disabled).toBe(
      true,
    );
  });

  it("selects approved sources and runs a crawl-only batch", async () => {
    mocks.sites.data = [
      {
        id: 2,
        name: "Wikipedia",
        base_url: "https://en.wikipedia.org/wiki/RSS",
        platform: "pool",
        pool_source_approved: true,
        pool_source_quarantined: false,
      },
      {
        id: 3,
        name: "Industry feed",
        base_url: "https://news.example.com/feed.xml",
        platform: "pool",
        pool_source_approved: true,
        pool_source_quarantined: false,
      },
      {
        id: 4,
        name: "Pending feed",
        base_url: "https://pending.example.com/feed.xml",
        platform: "pool",
        pool_source_approved: false,
        pool_source_quarantined: false,
      },
      {
        id: 5,
        name: "Quarantined feed",
        base_url: "https://quarantined.example.com/feed.xml",
        platform: "pool",
        pool_source_approved: true,
        pool_source_quarantined: true,
      },
    ];
    mocks.poolBatch.mockResolvedValue({
      queued: [
        { siteId: 2, job: { job_id: "job-2" } },
        { siteId: 3, job: { job_id: "job-3" } },
      ],
      failed: [],
    });
    render(<ContentPoolPage />);

    fireEvent.click(screen.getByRole("button", { name: "Select sources" }));
    fireEvent.click(
      screen.getByRole("checkbox", { name: "Select all eligible visible pool sources" }),
    );

    expect(
      (screen.getByRole("checkbox", { name: "Select Wikipedia for batch" }) as HTMLInputElement)
        .checked,
    ).toBe(true);
    expect(
      (screen.getByRole("checkbox", {
        name: "Select Industry feed for batch",
      }) as HTMLInputElement).checked,
    ).toBe(true);
    expect(
      (screen.getByRole("checkbox", { name: "Select Pending feed for batch" }) as HTMLInputElement)
        .disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("checkbox", {
        name: "Select Quarantined feed for batch",
      }) as HTMLInputElement).disabled,
    ).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Run batch (2)" }));

    await waitFor(() => expect(mocks.poolBatch).toHaveBeenCalledWith([2, 3]));
    expect(screen.queryByRole("region", { name: "Pool batch selection" })).toBeNull();
    expect(document.body.textContent).toContain("2 pool sources queued for crawl");
  });

  it("opens the dedicated content-pool CSV importer", () => {
    render(<ContentPoolPage />);

    fireEvent.click(screen.getByRole("button", { name: "Import CSV" }));

    expect(screen.getByRole("dialog").textContent).toContain(
      "Import content-pool sources from CSV",
    );
    expect(screen.getByRole("dialog").textContent).toContain(
      "valid rows are imported as unapproved content-pool sources",
    );
  });
});

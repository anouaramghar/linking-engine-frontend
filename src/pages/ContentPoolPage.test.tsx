import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ContentPoolPage from "./ContentPoolPage";

const mocks = vi.hoisted(() => ({
  sites: { data: [] as unknown[], isPending: false, isError: false, isFetching: false, refetch: vi.fn() },
  approve: vi.fn(),
  revoke: vi.fn(),
  reactivate: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("../hooks/useSites", () => ({
  useSites: () => mocks.sites,
  useApprovePoolSource: () => ({ mutateAsync: mocks.approve }),
  useRevokePoolSource: () => ({ mutateAsync: mocks.revoke }),
  useReactivatePoolSource: () => ({ mutateAsync: mocks.reactivate }),
  useDeleteSite: () => ({ mutateAsync: mocks.remove, isPending: false }),
  useCreateSite: () => ({ mutate: vi.fn(), isPending: false, isError: false }),
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
    fireEvent.click(screen.getByRole("button", { name: /Actions for Industry feed/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Approve" }));

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

  it("opens a pool source in a new tab instead of asking for a copy and paste", () => {
    mocks.sites.data = [
      {
        id: 2,
        name: "Industry feed",
        base_url: "https://news.example.com/feed",
        platform: "pool",
        pool_source_approved: true,
        pool_source_quarantined: false,
      },
    ];
    render(<ContentPoolPage />);

    const link = screen.getByRole("link", { name: "Open Industry feed in a new tab" });
    expect(link.getAttribute("href")).toBe("https://news.example.com/feed");
    // A new tab keeps the operator's place in the pool, and `noreferrer` keeps
    // the dashboard's address out of a third party's logs.
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noreferrer");
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
});

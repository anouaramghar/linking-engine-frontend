import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Suggestion } from "../types/suggestion";
import { QueueWorkspaceProvider } from "../hooks/useQueueWorkspace";
import ValidationPage from "./ValidationPage";

const SITE = {
  id: 1,
  name: "Example site",
  base_url: "https://example.com",
  platform: "wordpress",
  crawl_frequency: "daily",
  created_at: "2026-07-16T10:00:00Z",
  last_ingestion_status: "completed",
};

const suggestion = (overrides: Partial<Suggestion> = {}): Suggestion => ({
  id: 1,
  site_id: 1,
  source_article: { id: 10, title: "Source", url: "https://example.com/s" },
  target_article: { id: 20, title: "Target", url: "https://example.com/t" },
  target_origin: "internal",
  target_site_name: "Example site",
  method: "baseline_cosine",
  score: 0.9,
  status: "pending",
  anchor_text: null,
  created_at: "2026-07-16T10:00:00Z",
  ...overrides,
  // A baseline_cosine row ranks on its cosine score, so the two move together
  // unless a test pins the rank score itself.
  rank_score: overrides.rank_score ?? overrides.score ?? 0.9,
});

const mocks = vi.hoisted(() => ({
  /** Filters the page last asked the queue for — the assertion surface here. */
  queueFilters: null as Record<string, unknown> | null,
  filteredBulkMutate: vi.fn(),
  suggestions: [] as Suggestion[],
}));

vi.mock("../hooks/useSuggestions", () => ({
  useSuggestions: (filters: Record<string, unknown>) => {
    mocks.queueFilters = filters;
    return {
      items: mocks.suggestions,
      hasNextPage: false,
      fetchNextPage: vi.fn(),
      isFetchingNextPage: false,
      isPending: false,
      isError: false,
      isFetching: false,
      isPlaceholderData: false,
      refetch: vi.fn(),
    };
  },
  // Not what these tests are about; the filter assertions never open a row.
  usePlacement: () => ({
    data: undefined,
    isPending: false,
    isFetching: false,
    error: null,
    refetch: vi.fn(),
  }),
  useSuggestionEvents: () => ({
    data: [],
    isPending: false,
    isFetching: false,
    error: null,
    refetch: vi.fn(),
  }),
  useSuggestionCounts: () => ({
    data: {
      pending: 1,
      approved: 0,
      rejected: 0,
      applying: 0,
      applied: 0,
      failed: 0,
      expired: 0,
      total: 1,
    },
    isPending: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  }),
  useReview: () => ({ mutate: vi.fn() }),
  useMarkSuggestionsExposed: () => ({ mutate: vi.fn() }),
  useBulkReview: () => ({ mutate: vi.fn(), isPending: false }),
  useFilteredBulkReview: () => ({
    mutate: mocks.filteredBulkMutate,
    isPending: false,
  }),
  useFilteredBulkUndo: () => ({ mutate: vi.fn(), isPending: false }),
  useTriggerArticleAnalysis: () => ({
    mutate: vi.fn(),
    isPending: false,
    variables: undefined,
  }),
  useAllFilteredSuggestionIds: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock("../hooks/useSites", () => ({
  useSites: () => ({
    data: [SITE],
    isPending: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  }),
}));

vi.mock("../hooks/usePublish", () => ({
  useApprovePlans: () => ({ mutate: vi.fn(), isPending: false }),
  useQueueApprovedPlans: () => ({ mutate: vi.fn(), isPending: false }),
  usePreparePublicationPlans: () => ({
    data: undefined,
    isPending: false,
    isError: false,
    mutate: vi.fn(),
    reset: vi.fn(),
  }),
  usePendingPublication: () => ({
    data: [],
    isPending: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  }),
}));

/** Reports the current URL, so a test can assert what a shared link would carry. */
let currentSearch = "";
const TrackLocation = () => {
  const { search } = useLocation();
  // Recorded after commit, not during render: a discarded concurrent render
  // must not leave the tests asserting against a URL that never existed.
  useEffect(() => {
    currentSearch = search;
  }, [search]);
  return null;
};

const renderQueue = (initialEntry = "/") =>
  render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <QueueWorkspaceProvider>
        <ValidationPage />
        <TrackLocation />
      </QueueWorkspaceProvider>
    </MemoryRouter>,
  );

beforeEach(() => {
  mocks.queueFilters = null;
  mocks.suggestions = [suggestion()];
  mocks.filteredBulkMutate.mockReset();
  currentSearch = "";
});

afterEach(cleanup);

describe("queue filters", () => {
  it("asks the engine for a search term the editor typed", async () => {
    const user = userEvent.setup();
    renderQueue();

    await user.type(screen.getByRole("searchbox"), "hooks");

    await waitFor(() => expect(mocks.queueFilters?.q).toBe("hooks"));
  });

  it("puts the filters in the URL so a queue can be shared", async () => {
    const user = userEvent.setup();
    renderQueue();

    await user.selectOptions(screen.getByLabelText("Target filter"), "content_pool");

    await waitFor(() => expect(currentSearch).toContain("origin=content_pool"));
  });

  it("supports a shareable Tavily-only queue", async () => {
    const user = userEvent.setup();
    renderQueue();

    await user.selectOptions(screen.getByLabelText("Target filter"), "web_search");

    await waitFor(() => expect(currentSearch).toContain("origin=web_search"));
    expect(mocks.queueFilters?.targetOrigin).toBe("web_search");
  });

  it("restores a queue from a shared link", () => {
    renderQueue("/?q=hooks&origin=content_pool&unique=1&min=90&status=approved");

    expect(mocks.queueFilters).toMatchObject({
      q: "hooks",
      targetOrigin: "content_pool",
      excludeReciprocal: true,
      minPercent: 90,
      status: "approved",
    });
  });

  it("keeps an untouched queue out of the URL", () => {
    renderQueue();
    expect(currentSearch).toBe("");
  });

  it("falls back to defaults rather than trusting a hand-edited link", () => {
    renderQueue("/?status=nonsense&origin=elsewhere&site=-3&min=oops");

    expect(mocks.queueFilters).toMatchObject({ status: "pending" });
    expect(mocks.queueFilters?.targetOrigin).toBeUndefined();
    expect(mocks.queueFilters?.siteId).toBeUndefined();
    expect(mocks.queueFilters?.minPercent).toBeUndefined();
  });

  it("keeps advanced filter controls out of the queue toolbar", () => {
    renderQueue();

    expect(screen.queryByRole("button", { name: /More filters/ })).toBeNull();
    expect(screen.queryByText("Minimum match score")).toBeNull();
    expect(screen.queryByText("Hide reciprocal links")).toBeNull();
  });

  it("clears every filter at once", async () => {
    const user = userEvent.setup();
    renderQueue("/?q=hooks&origin=content_pool&min=90");

    await user.click(screen.getByRole("button", { name: "Clear filters" }));

    await waitFor(() => expect(currentSearch).toBe(""));
    expect(mocks.queueFilters?.q).toBeUndefined();
  });

  it("marks the selected status chip as pressed", () => {
    renderQueue();

    const pending = screen.getByRole("button", { name: /Pending review/ });
    const rejected = screen.getByRole("button", { name: /^Rejected/ });
    expect(pending.getAttribute("aria-pressed")).toBe("true");
    expect(rejected.getAttribute("aria-pressed")).toBe("false");
  });
});

describe("bulk rule preview", () => {
  it("shows the rows a rule will act on before it is confirmed", async () => {
    const user = userEvent.setup();
    renderQueue("/?min=10");

    // Browsing at a 10% floor; the rule's own window is what matters once the
    // editor asks to accept by it.
    expect(mocks.queueFilters?.minPercent).toBe(10);

    await user.click(screen.getByRole("button", { name: /^Select ≥/ }));

    await waitFor(() => expect(mocks.queueFilters?.minPercent).toBe(80));
    expect(mocks.queueFilters?.status).toBe("pending");
  });

  it("previews a reject rule as the rows below the threshold", async () => {
    const user = userEvent.setup();
    renderQueue();

    await user.click(screen.getByRole("button", { name: /^Reject </ }));

    await waitFor(() => expect(mocks.queueFilters?.maxPercent).toBe(80));
    expect(mocks.queueFilters?.minPercent).toBeUndefined();
  });

  it("gives the browse filter back when the rule is cancelled", async () => {
    const user = userEvent.setup();
    renderQueue("/?min=10");

    await user.click(screen.getByRole("button", { name: /^Select ≥/ }));
    await waitFor(() => expect(mocks.queueFilters?.minPercent).toBe(80));

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(mocks.queueFilters?.minPercent).toBe(10));
  });

  it("sends the queue's filters with the rule, so it cannot reach past them", async () => {
    const user = userEvent.setup();
    renderQueue("/?q=hooks&origin=content_pool&unique=1");

    await user.click(screen.getByRole("button", { name: /^Select ≥/ }));
    await user.click(screen.getByRole("button", { name: "Confirm selection" }));

    expect(mocks.filteredBulkMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "approved",
        thresholdPercent: 80,
        q: "hooks",
        targetOrigin: "content_pool",
        excludeReciprocal: true,
      }),
      expect.anything(),
    );
  });

  it("drops a confirmation when the filters underneath it change", async () => {
    const user = userEvent.setup();
    renderQueue();

    await user.click(screen.getByRole("button", { name: /^Select ≥/ }));
    expect(screen.queryByRole("button", { name: "Confirm selection" })).not.toBeNull();

    await user.selectOptions(screen.getByLabelText("Target filter"), "content_pool");

    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Confirm selection" })).toBeNull(),
    );
  });

  it("filters the queue by 'failed' status when the 'Publishing failed' chip is clicked", async () => {
    const user = userEvent.setup();
    renderQueue();

    await user.click(screen.getByRole("button", { name: /Publishing failed/i }));

    await waitFor(() => expect(mocks.queueFilters?.status).toBe("failed"));
  });
});

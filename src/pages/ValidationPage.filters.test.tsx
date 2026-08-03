import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Suggestion } from "../types/suggestion";
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
  useSuggestionCounts: () => ({
    data: {
      pending: 1,
      approved: 0,
      rejected: 0,
      applying: 0,
      applied: 0,
      expired: 0,
      total: 1,
    },
    isPending: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  }),
  useReview: () => ({ mutate: vi.fn() }),
  useBulkReview: () => ({ mutate: vi.fn(), isPending: false }),
  useFilteredBulkReview: () => ({
    mutate: mocks.filteredBulkMutate,
    isPending: false,
  }),
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
  usePublishSites: () => ({ mutate: vi.fn(), isPending: false }),
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
      <ValidationPage />
      <TrackLocation />
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

  it("excludes reverse duplicates when asked", async () => {
    const user = userEvent.setup();
    renderQueue();

    await user.click(screen.getByLabelText("Hide reverse duplicates"));

    await waitFor(() => expect(mocks.queueFilters?.excludeReciprocal).toBe(true));
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

    await user.click(screen.getByRole("button", { name: /^Accept ≥/ }));

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

    await user.click(screen.getByRole("button", { name: /^Accept ≥/ }));
    await waitFor(() => expect(mocks.queueFilters?.minPercent).toBe(80));

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(mocks.queueFilters?.minPercent).toBe(10));
  });

  it("locks the browse score field while the rule owns the window", async () => {
    const user = userEvent.setup();
    renderQueue();

    expect(
      (screen.getByLabelText("Minimum score") as HTMLInputElement).disabled,
    ).toBe(false);

    await user.click(screen.getByRole("button", { name: /^Accept ≥/ }));

    await waitFor(() =>
      expect(
        (screen.getByLabelText("Minimum score") as HTMLInputElement).disabled,
      ).toBe(true),
    );
  });

  it("sends the queue's filters with the rule, so it cannot reach past them", async () => {
    const user = userEvent.setup();
    renderQueue("/?q=hooks&origin=content_pool&unique=1");

    await user.click(screen.getByRole("button", { name: /^Accept ≥/ }));
    await user.click(screen.getByRole("button", { name: "Confirm accept" }));

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

    await user.click(screen.getByRole("button", { name: /^Accept ≥/ }));
    expect(screen.queryByRole("button", { name: "Confirm accept" })).not.toBeNull();

    await user.click(screen.getByLabelText("Hide reverse duplicates"));

    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Confirm accept" })).toBeNull(),
    );
  });
});

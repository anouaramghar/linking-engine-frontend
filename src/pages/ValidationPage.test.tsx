import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BulkReviewChunkError } from "../api/suggestions";
import type { Suggestion } from "../types/suggestion";
import ValidationPage from "./ValidationPage";

/**
 * The queue keeps its filters in the URL so they can be linked to, which means
 * it needs a router even when a test never navigates. Entries let a test start
 * from a filtered queue the way a shared link would.
 */
const renderQueue = (initialEntry = "/") =>
  render(<ValidationPage />, {
    wrapper: ({ children }) => (
      <MemoryRouter initialEntries={[initialEntry]}>{children}</MemoryRouter>
    ),
  });

const realMatchMedia = window.matchMedia;

const setNarrowViewport = () => {
  window.matchMedia = vi.fn().mockImplementation((media: string) => ({
    matches: true,
    media,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
};

const SITE = {
  id: 1,
  name: "Example site",
  base_url: "https://example.com",
  platform: "wordpress",
  crawl_frequency: "daily",
  created_at: "2026-07-16T10:00:00Z",
  last_ingestion_status: "completed",
};

const mocks = vi.hoisted(() => ({
  suggestions: [] as Suggestion[],
  reviewMutate: vi.fn(),
  bulkMutate: vi.fn(),
  filteredBulkMutate: vi.fn(),
  prepareMutate: vi.fn(),
  prepareReset: vi.fn(),
  approveMutate: vi.fn(),
  queueMutate: vi.fn(),
  /** Ids the engine reports it could not review, as a live publish would. */
  bulkSkipped: [] as number[],
  /** Undefined derives ids from the rule; null models a result over the cap. */
  filteredReviewedIds: undefined as number[] | null | undefined,
  filteredReviewedCount: undefined as number | undefined,
  bulkError: null as unknown,
  filteredBulkError: null as unknown,
  pendingPublication: [] as {
    site_id: number;
    selected_suggestions: number;
    approved_plans: number;
    can_publish?: boolean;
  }[],
  countsOverride: null as {
    pending: number;
    approved: number;
    rejected: number;
    applying: number;
    applied: number;
    expired: number;
    failed: number;
    total: number;
  } | null,
  /** Models the background refetch every review mutation sets off. */
  countsFetching: false,
  publicationPlans: {} as Record<string, unknown>,
  sitesQuery: {} as Record<string, unknown>,
  suggestionsQuery: {} as Record<string, unknown>,
}));

vi.mock("../hooks/useSuggestions", () => ({
  useSuggestions: () => ({
    items: mocks.suggestions,
    total: mocks.suggestions.length,
    hasNextPage: false,
    fetchNextPage: vi.fn(),
    isFetchingNextPage: false,
    ...mocks.suggestionsQuery,
  }),
  // Placement is generated per open suggestion and is not what these tests are
  // about; they assert on the queue and the keyboard, so it stays at rest.
  usePlacement: () => ({
    data: undefined,
    isPending: false,
    isFetching: false,
    error: null,
    refetch: vi.fn(),
  }),
  useSuggestionCounts: (filters: {
    siteId?: number;
    minPercent?: number;
    maxPercent?: number;
  }) => {
    if (mocks.countsOverride) {
      return {
        data: mocks.countsOverride,
        isPending: false,
        isError: false,
        isFetching: false,
        refetch: vi.fn(),
      };
    }
    const selected = mocks.suggestions.filter((item) => {
      if (filters.siteId !== undefined && item.site_id !== filters.siteId) return false;
      const percent = Math.round(item.score * 100);
      if (filters.minPercent !== undefined && percent < filters.minPercent) return false;
      if (filters.maxPercent !== undefined && percent >= filters.maxPercent) return false;
      return true;
    });
    const count = (status: Suggestion["status"]) =>
      selected.filter((item) => item.status === status).length;
    return {
      data: {
        pending: count("pending"),
        approved: count("approved"),
        rejected: count("rejected"),
        applying: count("applying"),
        applied: count("applied"),
        expired: 0,
        failed: count("failed"),
        total: selected.length,
      },
      isPending: false,
      isError: false,
      isFetching: mocks.countsFetching,
      refetch: vi.fn(),
    };
  },
  useReview: () => ({ mutate: mocks.reviewMutate }),
  useBulkReview: () => ({ mutate: mocks.bulkMutate, isPending: false }),
  useFilteredBulkReview: () => ({
    mutate: mocks.filteredBulkMutate,
    isPending: false,
  }),
}));

vi.mock("../hooks/useSites", () => ({
  useSites: () => ({ data: [SITE], ...mocks.sitesQuery }),
}));

vi.mock("../hooks/usePublish", () => ({
  usePendingPublication: () => ({
    data: mocks.pendingPublication,
    isPending: false,
    isError: false,
    isFetching: mocks.countsFetching,
    refetch: vi.fn(),
  }),
  usePreparePublicationPlans: () => ({
    data: undefined,
    isPending: false,
    isError: false,
    mutate: mocks.prepareMutate,
    reset: mocks.prepareReset,
    ...mocks.publicationPlans,
  }),
  useApprovePlans: () => ({ mutate: mocks.approveMutate, isPending: false }),
  useQueueApprovedPlans: () => ({ mutate: mocks.queueMutate, isPending: false }),
}));

const query = (overrides: Record<string, unknown> = {}) => ({
  isPending: false,
  isError: false,
  isFetching: false,
  refetch: vi.fn(),
  ...overrides,
});

const suggestion = (id: number, overrides: Partial<Suggestion> = {}): Suggestion => ({
  id,
  site_id: 1,
  source_article: { id: id * 10, title: `Source ${id}`, url: `/source-${id}` },
  target_article: { id: id * 10 + 1, title: `Target ${id}`, url: `/target-${id}` },
  target_origin: "internal",
  target_site_name: "Example site",
  method: "baseline_cosine",
  score: 0.8,
  status: "pending",
  anchor_text: "anchor",
  created_at: "2026-07-16T10:00:00Z",
  ...overrides,
});

beforeEach(() => {
  mocks.suggestions.splice(
    0,
    mocks.suggestions.length,
    suggestion(1, { score: 0.8 }),
    suggestion(2, { score: 0.79 }),
    suggestion(3, { score: 0.9, status: "applied" }),
  );
  mocks.reviewMutate.mockReset();
  mocks.bulkMutate.mockReset();
  mocks.filteredBulkMutate.mockReset();
  mocks.prepareMutate.mockReset();
  mocks.prepareReset.mockReset();
  mocks.approveMutate.mockReset();
  mocks.queueMutate.mockReset();
  mocks.bulkSkipped = [];
  mocks.filteredReviewedIds = undefined;
  mocks.filteredReviewedCount = undefined;
  mocks.bulkError = null;
  mocks.filteredBulkError = null;
  mocks.pendingPublication = [];
  mocks.countsOverride = null;
  mocks.publicationPlans = {};
  mocks.reviewMutate.mockImplementation((_variables, options) => options?.onSuccess?.());
  // Mirrors the real endpoint: a batch reports what it applied and what it had
  // to leave alone, so the page is exercised against a partial result.
  mocks.bulkMutate.mockImplementation(
    (variables: { ids: number[]; status: string }, options) => {
      if (mocks.bulkError) {
        options?.onError?.(mocks.bulkError);
        return;
      }
      options?.onSuccess?.({
        reviewed: variables.ids.filter((id) => !mocks.bulkSkipped.includes(id)),
        skipped: mocks.bulkSkipped,
        status: variables.status,
      });
    },
  );
  mocks.filteredBulkMutate.mockImplementation(
    (
      variables: {
        siteId?: number;
        status: "approved" | "rejected";
        thresholdPercent: number;
      },
      options,
    ) => {
      if (mocks.filteredBulkError) {
        options?.onError?.(mocks.filteredBulkError);
        return;
      }
      const targets = mocks.suggestions.filter((item) => {
        if (item.status !== "pending") return false;
        if (variables.siteId !== undefined && item.site_id !== variables.siteId) {
          return false;
        }
        const percent = Math.round(item.score * 100);
        return variables.status === "approved"
          ? percent >= variables.thresholdPercent
          : percent < variables.thresholdPercent;
      });
      const reviewedIds =
        mocks.filteredReviewedIds === undefined
          ? targets
              .map((item) => item.id)
              .filter((id) => !mocks.bulkSkipped.includes(id))
          : mocks.filteredReviewedIds;
      options?.onSuccess?.({
        reviewed:
          mocks.filteredReviewedCount ??
          reviewedIds?.length ??
          targets.length - mocks.bulkSkipped.length,
        skipped: mocks.bulkSkipped.length,
        reviewed_ids: reviewedIds,
        status: variables.status,
      });
    },
  );
  mocks.sitesQuery = query();
  mocks.suggestionsQuery = query();
  mocks.countsFetching = false;
});

afterEach(() => {
  cleanup();
  window.matchMedia = realMatchMedia;
});

describe("ValidationPage live review state", () => {
  // Reviewing a row invalidates the counts and the publication summary, so
  // every decision leaves them refetching. If that state paused the queue, an
  // editor working down it with `a` would be locked out after every row.
  it("keeps reviewing while the counts refetch behind a decision", () => {
    mocks.countsFetching = true;
    mocks.pendingPublication = [
      { site_id: 1, selected_suggestions: 2, approved_plans: 0 },
    ];
    renderQueue();

    expect(
      (screen.getByRole("button", {
        name: /Accept suggestion from Example site: Source 1/,
      }) as HTMLButtonElement).disabled,
    ).toBe(false);
    expect(
      (screen.getByRole("button", { name: /^Accept ≥/ }) as HTMLButtonElement).disabled,
    ).toBe(false);
    expect(screen.queryByText(/Review actions are paused/)).toBeNull();
    // The publish banner is driven by the same invalidated query, so it has to
    // survive the refetch too rather than blinking out to "nothing selected".
    expect(screen.getByText(/2 selected suggestions/)).not.toBeNull();
  });

  it("pauses review actions while filtered results are being replaced", () => {
    mocks.suggestionsQuery = query({ isPlaceholderData: true });
    renderQueue();

    expect(
      (screen.getByRole("button", {
        name: /Accept suggestion from Example site: Source 1/,
      }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: /^Accept ≥/ }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(screen.getByRole("status").textContent).toContain("Review actions are paused");
  });

  it("shows server counts beyond the suggestions loaded on the first page", () => {
    mocks.countsOverride = {
      pending: 2400,
      approved: 7,
      rejected: 3,
      applying: 1,
      applied: 9,
      failed: 0,
      expired: 2,
      total: 2420,
    };
    renderQueue();

    expect(screen.getByRole("button", { name: /Pending review.*2400/ })).not.toBeNull();
    expect(screen.getByRole("button", { name: /All.*2420/ })).not.toBeNull();
    expect(screen.getAllByRole("button", { name: /^Open suggestion:/ })).toHaveLength(2);
  });

  it("groups suggestions by source id and disambiguates duplicate titles by URL", () => {
    const firstSource = {
      id: 101,
      title: "Hello world!",
      url: "https://example.com/2026/hello-world/",
    };
    const secondSource = {
      id: 102,
      title: "Hello world!",
      url: "https://example.com/2025/hello-world-2/",
    };
    mocks.suggestions.splice(
      0,
      mocks.suggestions.length,
      suggestion(1, {
        source_article: firstSource,
        target_article: { id: 201, title: "First target", url: "/first-target" },
      }),
      suggestion(2, {
        source_article: firstSource,
        target_article: { id: 202, title: "Second target", url: "/second-target" },
      }),
      suggestion(3, {
        source_article: secondSource,
        target_article: { id: 203, title: "Third target", url: "/third-target" },
        status: "pending",
      }),
    );

    renderQueue();

    const groups = screen.getAllByRole("region", { name: "Hello world!" });
    expect(groups).toHaveLength(2);
    expect(
      within(groups[0]).getAllByRole("button", { name: /^Open suggestion:/ }),
    ).toHaveLength(2);
    expect(
      within(groups[1]).getAllByRole("button", { name: /^Open suggestion:/ }),
    ).toHaveLength(1);
    expect(within(groups[0]).getByText(/\/2026\/hello-world\//)).not.toBeNull();
    expect(within(groups[1]).getByText(/\/2025\/hello-world-2\//)).not.toBeNull();
    expect(within(groups[0]).getByText("2 suggestions")).not.toBeNull();
    expect(within(groups[1]).getByText("1 suggestion")).not.toBeNull();
  });

  it("collapses a source group without hiding other articles", async () => {
    const user = userEvent.setup();
    const sharedSource = {
      id: 101,
      title: "Shared source",
      url: "https://example.com/shared-source/",
    };
    mocks.suggestions.splice(
      0,
      mocks.suggestions.length,
      suggestion(1, { source_article: sharedSource }),
      suggestion(2, {
        source_article: sharedSource,
        target_article: { id: 202, title: "Second target", url: "/second-target" },
      }),
      suggestion(3, {
        source_article: {
          id: 103,
          title: "Another source",
          url: "https://example.com/another-source/",
        },
        status: "pending",
      }),
    );
    renderQueue();

    const group = screen.getByRole("region", { name: "Shared source" });
    const collapse = within(group).getByRole("button", {
      name: /Collapse suggestions for Shared source/,
    });
    await user.click(collapse);

    expect(collapse.getAttribute("aria-expanded")).toBe("false");
    expect(
      within(group).queryByRole("button", { name: /^Open suggestion:/ }),
    ).toBeNull();
    expect(screen.getAllByRole("button", { name: /^Open suggestion:/ })).toHaveLength(1);

    await user.click(
      within(group).getByRole("button", {
        name: /Expand suggestions for Shared source/,
      }),
    );
    expect(
      within(group).getAllByRole("button", { name: /^Open suggestion:/ }),
    ).toHaveLength(2);
  });

  it("saves a confirmed bulk action through the backend mutation", async () => {
    const user = userEvent.setup();
    renderQueue();

    await user.click(screen.getByRole("button", { name: /^Accept ≥/ }));
    expect(screen.getByRole("region", { name: /1 pending suggestion/ }).textContent).toContain(
      "1 pending suggestion",
    );
    await user.click(screen.getByRole("button", { name: "Confirm accept" }));

    expect(mocks.filteredBulkMutate).toHaveBeenCalledWith(
      { siteId: undefined, status: "approved", thresholdPercent: 80 },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    );
    expect(screen.getByRole("status").textContent).toContain("1 suggestion selected for preparation");
    await user.click(screen.getByRole("button", { name: /Selected.*1/ }));
    expect(screen.getByText("Source 1")).not.toBeNull();
  });

  it("saves an individual decision through the backend mutation", async () => {
    const user = userEvent.setup();
    renderQueue();

    await user.click(
      screen.getByRole("button", { name: /Accept suggestion from Example site: Source 1/ }),
    );

    expect(mocks.reviewMutate).toHaveBeenCalledWith(
      { id: 1, status: "approved" },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    );
    await user.click(screen.getByRole("button", { name: /Selected.*1/ }));
    expect(screen.getByText("Source 1")).not.toBeNull();
  });

  it("cancels a bulk action without sending or changing decisions", async () => {
    const user = userEvent.setup();
    renderQueue();

    await user.click(screen.getByRole("button", { name: /^Accept ≥/ }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("region", { name: /pending suggestion/ })).toBeNull();
    expect(screen.getByText("Source 1")).not.toBeNull();
    expect(screen.getByRole("button", { name: /Selected.*0/ })).not.toBeNull();
    expect(mocks.filteredBulkMutate).not.toHaveBeenCalled();
  });

  it("walks a bulk decision back through the undo action", async () => {
    const user = userEvent.setup();
    renderQueue();

    await user.click(screen.getByRole("button", { name: /^Accept ≥/ }));
    await user.click(screen.getByRole("button", { name: "Confirm accept" }));
    mocks.bulkMutate.mockClear();

    await user.click(screen.getByRole("button", { name: "Undo" }));

    expect(mocks.bulkMutate).toHaveBeenCalledWith(
      { ids: [1], status: "pending" },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
    expect(screen.getByRole("status").textContent).toContain("1 suggestion restored to pending");
    expect(screen.getByRole("button", { name: /Pending review.*2/ })).not.toBeNull();
  });

  it("keeps the rows a publish already claimed out of the local override", async () => {
    const user = userEvent.setup();
    mocks.suggestions.push(suggestion(4, { score: 0.85 }));
    renderQueue();

    // The worker claims suggestion 1 between the decision and this batch.
    mocks.bulkSkipped = [1];
    await user.click(screen.getByRole("button", { name: /^Accept ≥/ }));
    await user.click(screen.getByRole("button", { name: "Confirm accept" }));

    const notice = screen.getByRole("alert");
    expect(notice.textContent).toContain("1 suggestion selected for preparation");
    expect(notice.textContent).toContain(
      "1 suggestion was already picked up for publishing or had expired",
    );
    // Only the row that actually moved leaves the pending list.
    expect(screen.getByRole("button", { name: /Pending review.*2/ })).not.toBeNull();
    expect(screen.getByRole("button", { name: /Selected.*1/ })).not.toBeNull();
  });

  it("uses only the engine's reviewed ids for local batch state", async () => {
    const user = userEvent.setup();
    mocks.suggestions.push(suggestion(4, { score: 0.85 }));
    // Suggestion 1 was requested but no longer exists, so it is neither
    // reviewed nor skipped by the engine.
    mocks.filteredReviewedIds = [4];
    renderQueue();

    await user.click(screen.getByRole("button", { name: /^Accept ≥/ }));
    await user.click(screen.getByRole("button", { name: "Confirm accept" }));

    expect(screen.getByRole("status").textContent).toContain(
      "1 suggestion selected for preparation",
    );
    expect(screen.getByRole("button", { name: /Pending review.*2/ })).not.toBeNull();
    expect(screen.getByRole("button", { name: /Selected.*1/ })).not.toBeNull();

    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(mocks.bulkMutate).toHaveBeenLastCalledWith(
      { ids: [4], status: "pending" },
      expect.anything(),
    );
  });

  it("reports committed undo chunks when a later explicit-id request fails", async () => {
    const user = userEvent.setup();
    mocks.suggestions.push(
      suggestion(4, { score: 0.85 }),
      suggestion(5, { score: 0.9 }),
    );
    renderQueue();

    await user.click(screen.getByRole("button", { name: /^Accept ≥/ }));
    await user.click(screen.getByRole("button", { name: "Confirm accept" }));
    mocks.bulkError = new BulkReviewChunkError(
      { reviewed: [1], reviewedCount: 1, skipped: [], status: "pending" },
      [4],
      [5],
    );
    await user.click(screen.getByRole("button", { name: "Undo" }));

    const notice = screen.getByRole("alert");
    expect(notice.textContent).toContain("1 decision was saved before the bulk review failed");
    expect(notice.textContent).toContain(
      "1 suggestion in the failed request could not be confirmed",
    );
    expect(notice.textContent).toContain("1 later suggestion was not attempted");
    expect(screen.getByRole("button", { name: /Pending review.*2/ })).not.toBeNull();
    expect(screen.getByRole("button", { name: /Selected.*2/ })).not.toBeNull();
  });

  it("says so plainly when a batch changed nothing at all", async () => {
    const user = userEvent.setup();
    renderQueue();

    mocks.bulkSkipped = [1];
    await user.click(screen.getByRole("button", { name: /^Accept ≥/ }));
    await user.click(screen.getByRole("button", { name: "Confirm accept" }));

    const notice = screen.getByRole("alert");
    expect(notice.textContent).toContain("Nothing changed");
    // No dead-end retry advice for an outcome that will never change.
    expect(notice.textContent).not.toContain("try again");
    expect(screen.getByRole("button", { name: /Pending review.*2/ })).not.toBeNull();
  });

  it("refetches a large rule result without offering impossible undo", async () => {
    const user = userEvent.setup();
    mocks.suggestions.splice(
      0,
      mocks.suggestions.length,
      ...Array.from({ length: 1001 }, (_, index) =>
        suggestion(index + 1, { score: 0.9 }),
      ),
    );
    mocks.filteredReviewedIds = null;
    mocks.filteredReviewedCount = 1001;
    renderQueue();

    await user.click(screen.getByRole("button", { name: /^Accept ≥/ }));
    expect(screen.getByRole("region", { name: /1001 pending suggestions/ }).textContent).toContain(
      "too large to undo in one step",
    );
    await user.click(screen.getByRole("button", { name: "Confirm accept" }));

    expect(screen.getByRole("status").textContent).toContain(
      "This change was too large to undo in one step",
    );
    expect(screen.queryByRole("button", { name: "Undo" })).toBeNull();
  });

  it("never targets suggestions hidden by the active status filter", async () => {
    const user = userEvent.setup();
    renderQueue();

    await user.click(screen.getByRole("button", { name: /Published live.*1/ }));

    expect(
      (screen.getByRole("button", { name: /^Reject </ }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: /^Accept ≥/ }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(document.body.textContent).toContain("Switch to Pending review or All to use bulk review");
  });

  it("shows the real scoring signal without advertising unsupported future methods", () => {
    renderQueue();

    expect(document.body.textContent).toContain("Semantic match");
    expect(document.body.textContent).not.toContain("GraphSAGE");
    expect(document.body.textContent).not.toContain("External links");
    expect(document.body.textContent).not.toContain("Generate anchors");
  });
});

const PLAN = {
  id: 55,
  status: "prepared" as const,
  plan_hash: "a".repeat(64),
  source_article_id: 10,
  source_url: "https://example.com/source",
  original_html: "<p>solar panel costs</p>",
  updated_html: '<p><a href="/target">solar panel</a> costs</p>',
  links: [
    {
      position: 0,
      suggestion_id: 1,
      target_url: "https://example.com/target",
      anchor_text: "solar panel",
      outcome: "inserted" as const,
    },
  ],
};

const SECOND_PLAN = {
  ...PLAN,
  id: 56,
  plan_hash: "b".repeat(64),
  source_article_id: 11,
  source_url: "https://example.com/other-source",
  links: [{ ...PLAN.links[0], suggestion_id: 2 }],
};

const preparedFor = (
  site: number,
  overrides: Record<string, unknown> = {},
  plans = [PLAN],
) => {
  mocks.pendingPublication = [
    { site_id: site, selected_suggestions: 1, approved_plans: 0 },
  ];
  mocks.publicationPlans = {
    data: {
      site_id: site,
      selected_suggestions: 1,
      plans,
      errors: [],
      has_more: false,
      ...overrides,
    },
  };
};

const openReview = async (user: ReturnType<typeof userEvent.setup>) => {
  renderQueue();
  await user.click(screen.getByRole("button", { name: "Review publication changes" }));
};

describe("ValidationPage publication approval", () => {
  it("stays quiet while nothing is selected or approved", () => {
    renderQueue();

    expect(document.body.textContent).not.toContain("waiting for review");
    expect(document.body.textContent).not.toContain("waiting to be published");
  });

  it("offers no way to publish a site straight from the queue", () => {
    mocks.pendingPublication = [
      { site_id: 1, selected_suggestions: 24, approved_plans: 0 },
    ];
    renderQueue();

    // Selecting rows is not consent to write to a customer's site. The only
    // route on is the review that renders the exact edits.
    expect(screen.queryByRole("button", { name: /^Publish \d+ site/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Publish this site" })).toBeNull();
    expect(screen.getByRole("button", { name: "Review publication changes" })).not.toBeNull();
    expect(document.body.textContent).toContain("waiting for review");
    expect(mocks.prepareMutate).not.toHaveBeenCalled();
  });

  it("renders no fleet-wide publication control when several sites have work", () => {
    mocks.pendingPublication = [
      { site_id: 1, selected_suggestions: 4, approved_plans: 0 },
      { site_id: 2, selected_suggestions: 9, approved_plans: 0 },
    ];
    renderQueue();

    expect(screen.queryByRole("button", { name: /^Publish \d+ site/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Review publication changes" })).toBeNull();
    expect(document.body.textContent).toContain("Filter to one site");
  });

  it("selecting a suggestion never calls a publication endpoint", async () => {
    const user = userEvent.setup();
    renderQueue();

    await user.click(
      screen.getByRole("button", { name: /Accept suggestion from Example site: Source 1/ }),
    );

    expect(mocks.approveMutate).not.toHaveBeenCalled();
    expect(mocks.queueMutate).not.toHaveBeenCalled();
  });

  it("shows the exact WordPress HTML and the hash the approval will name", async () => {
    const user = userEvent.setup();
    preparedFor(1);
    await openReview(userEvent.setup());
    void user;

    expect(screen.getByRole("dialog")).not.toBeNull();
    expect(document.body.textContent).toContain("Compare exact HTML");
    expect(document.body.textContent).toContain("<p>solar panel costs</p>");
    expect(document.body.textContent).toContain('<p><a href="/target">solar panel</a> costs</p>');
    expect(document.body.textContent).toContain(PLAN.plan_hash.slice(0, 12));
    expect(mocks.prepareMutate).toHaveBeenCalledWith(1);
  });

  it("never says the content may still change after approval", async () => {
    preparedFor(1);
    await openReview(userEvent.setup());

    expect(document.body.textContent).not.toMatch(/may (still )?change/i);
    expect(document.body.textContent).not.toContain("before publication");
  });

  it("sends only the displayed plans and hashes, then queues them", async () => {
    const user = userEvent.setup();
    mocks.approveMutate.mockImplementation((_variables, options) => options?.onSuccess?.());
    preparedFor(1);
    await openReview(user);

    await user.click(screen.getByRole("button", { name: /^Approve and queue 1 exact edit$/ }));

    expect(mocks.approveMutate).toHaveBeenCalledWith(
      { siteId: 1, plans: [{ id: 55, plan_hash: PLAN.plan_hash }] },
      expect.anything(),
    );
    expect(mocks.queueMutate).toHaveBeenCalledWith(
      { siteId: 1, planIds: [55] },
      expect.anything(),
    );
  });

  it("does not queue anything when the approval fails", async () => {
    const user = userEvent.setup();
    mocks.approveMutate.mockImplementation((_variables, options) =>
      options?.onError?.(new Error("nope")),
    );
    preparedFor(1);
    await openReview(user);

    await user.click(screen.getByRole("button", { name: /^Approve and queue/ }));

    expect(mocks.queueMutate).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("nothing was published");
  });

  it("keeps an approved-but-not-queued batch truthful and retryable", async () => {
    const user = userEvent.setup();
    mocks.approveMutate.mockImplementation((_variables, options) => options?.onSuccess?.());
    mocks.queueMutate.mockImplementation((_siteId, options) =>
      options?.onError?.(new Error("redis is down")),
    );
    preparedFor(1);
    await openReview(user);

    await user.click(screen.getByRole("button", { name: /^Approve and queue/ }));

    expect(document.body.textContent).toContain("approved but not queued");
    // The retry queues only; it must not ask for the same approval twice.
    mocks.approveMutate.mockClear();
    mocks.queueMutate.mockClear();
    await user.click(screen.getByRole("button", { name: "Queue approved edits" }));

    expect(mocks.approveMutate).not.toHaveBeenCalled();
    expect(mocks.queueMutate).toHaveBeenCalledWith(
      { siteId: 1, planIds: [55] },
      expect.anything(),
    );
  });

  it("cannot approve more than what is on screen, whatever else remains", async () => {
    const user = userEvent.setup();
    mocks.approveMutate.mockImplementation((_variables, options) => options?.onSuccess?.());
    preparedFor(1, {
      has_more: true,
      errors: [
        {
          source_article_id: 99,
          source_url: "https://example.com/broken",
          message: "post is gone",
        },
      ],
    });
    await openReview(user);

    await user.click(screen.getByRole("button", { name: /^Approve and queue/ }));

    // One plan was shown; `has_more` and the failed source describe work that is
    // explicitly not in this request.
    expect(mocks.approveMutate).toHaveBeenCalledWith(
      { siteId: 1, plans: [{ id: 55, plan_hash: PLAN.plan_hash }] },
      expect.anything(),
    );
    expect(document.body.textContent).toContain("left out of this batch");
  });

  it("says a site cannot publish instead of letting the review be opened", async () => {
    const user = userEvent.setup();
    mocks.pendingPublication = [
      { site_id: 1, selected_suggestions: 3, approved_plans: 0, can_publish: false },
    ];
    renderQueue();

    expect(document.body.textContent).toContain("has no WordPress account");
    expect(screen.queryByRole("button", { name: "Review publication changes" })).toBeNull();
    // Nothing to click means nothing spends a live request per source article.
    void user;
    expect(mocks.prepareMutate).not.toHaveBeenCalled();
  });

  it("ticks every prepared article, so the normal case is still one click", async () => {
    preparedFor(1, {}, [PLAN, SECOND_PLAN]);
    await openReview(userEvent.setup());

    expect(
      screen.getByRole("button", { name: /^Approve and queue 2 exact edits$/ }),
    ).not.toBeNull();
    expect(document.body.textContent).toContain("2 of 2 selected");
  });

  it("approves only the articles left ticked, and says what it held back", async () => {
    const user = userEvent.setup();
    mocks.approveMutate.mockImplementation((_variables, options) => options?.onSuccess?.());
    preparedFor(1, {}, [PLAN, SECOND_PLAN]);
    await openReview(user);

    await user.click(
      screen.getByRole("checkbox", {
        name: `Approve the edit to ${SECOND_PLAN.source_url}`,
      }),
    );

    expect(document.body.textContent).toContain("1 article stays unpublished");
    await user.click(screen.getByRole("button", { name: /^Approve and queue 1 exact edit$/ }));

    // The unticked article is as absent from the request as a failed source is.
    expect(mocks.approveMutate).toHaveBeenCalledWith(
      { siteId: 1, plans: [{ id: 55, plan_hash: PLAN.plan_hash }] },
      expect.anything(),
    );
    expect(mocks.queueMutate).toHaveBeenCalledWith(
      { siteId: 1, planIds: [55] },
      expect.anything(),
    );
  });

  it("cannot approve when every article is unticked", async () => {
    const user = userEvent.setup();
    preparedFor(1, {}, [PLAN, SECOND_PLAN]);
    await openReview(user);

    await user.click(screen.getByRole("checkbox", { name: "Select all prepared articles" }));

    expect(
      screen.getByRole("button", { name: /^Approve and queue 0 exact edits$/ }),
    ).toHaveProperty("disabled", true);
    expect(mocks.approveMutate).not.toHaveBeenCalled();
  });

  it("retries the queue with the subset that was approved, not the whole batch", async () => {
    const user = userEvent.setup();
    mocks.approveMutate.mockImplementation((_variables, options) => options?.onSuccess?.());
    mocks.queueMutate.mockImplementation((_variables, options) =>
      options?.onError?.(new Error("redis is down")),
    );
    preparedFor(1, {}, [PLAN, SECOND_PLAN]);
    await openReview(user);

    await user.click(
      screen.getByRole("checkbox", {
        name: `Approve the edit to ${SECOND_PLAN.source_url}`,
      }),
    );
    await user.click(screen.getByRole("button", { name: /^Approve and queue/ }));

    mocks.queueMutate.mockClear();
    await user.click(screen.getByRole("button", { name: "Queue approved edits" }));

    // Plan 56 was never approved, so naming it in the retry would be a 409 and
    // the operator would be stuck with an approval they could not queue.
    expect(mocks.queueMutate).toHaveBeenCalledWith(
      { siteId: 1, planIds: [55] },
      expect.anything(),
    );
  });
});

describe("ValidationPage keyboard review", () => {
  it("reserves the desktop detail rail before a suggestion is selected", () => {
    renderQueue();

    const preview = screen.getByRole("complementary", { name: "Suggestion detail" });
    expect(within(preview).getByText("Select a suggestion")).not.toBeNull();
    expect(within(preview).getByText(/placement context, target article/i)).not.toBeNull();
  });

  it("uses the overlay layout below the desktop rail breakpoint", () => {
    setNarrowViewport();
    renderQueue();

    expect(screen.queryByRole("complementary", { name: "Suggestion detail" })).toBeNull();
  });

  it("moves a cursor through the queue and decides without the mouse", async () => {
    const user = userEvent.setup();
    renderQueue();

    const preview = () => screen.getByRole("complementary", { name: "Suggestion detail" });

    await user.keyboard("j");
    expect(within(preview()).getByText("Source 1")).not.toBeNull();

    await user.keyboard("j");
    expect(within(preview()).getByText("Source 2")).not.toBeNull();

    await user.keyboard("r");
    expect(mocks.reviewMutate).toHaveBeenCalledWith(
      { id: 2, status: "rejected" },
      expect.anything(),
    );
  });

  it("hands the cursor to the next row after a decision", async () => {
    const user = userEvent.setup();
    renderQueue();

    const preview = () => screen.getByRole("complementary", { name: "Suggestion detail" });

    await user.keyboard("j");
    expect(within(preview()).getByText("Source 1")).not.toBeNull();

    // Accepting drops the row out of the pending filter. The cursor has to
    // follow the queue forward, or the next 'j' restarts from the top.
    await user.keyboard("a");
    expect(within(preview()).getByText("Source 2")).not.toBeNull();

    await user.keyboard("a");
    expect(mocks.reviewMutate).toHaveBeenLastCalledWith(
      { id: 2, status: "approved" },
      expect.anything(),
    );
  });

  it("resumes from the editor's place when a batch removes the cursor row", async () => {
    const user = userEvent.setup();
    // Pending order is [1 @80%, 2 @79%, 4 @50%, 5 @95%]; a "below 80%" rule
    // takes 2 and 4, so the cursor row goes but the row after it survives.
    mocks.suggestions.push(suggestion(4, { score: 0.5 }), suggestion(5, { score: 0.95 }));
    renderQueue();

    const preview = () => screen.getByRole("complementary", { name: "Suggestion detail" });

    await user.keyboard("jjj"); // cursor on the third pending row, id 4
    expect(within(preview()).getByText("Source 4")).not.toBeNull();

    // A bulk reject takes that row without going through `decide`.
    await user.click(screen.getByRole("button", { name: /^Reject </ }));
    await user.click(screen.getByRole("button", { name: "Confirm reject" }));
    await user.keyboard("j");

    // Index 2 now holds id 5 — not id 1 back at the top of the queue.
    expect(within(preview()).getByText("Source 5")).not.toBeNull();
  });

  it("resumes at the true vacated position when a batch also removes rows above", async () => {
    const user = userEvent.setup();
    // After ids 2 and 4 leave [1, 2, 4, 5, 6], id 5 slides from index 3 to 1.
    // Id 6 keeps the stale pre-removal index in bounds so clamping cannot hide
    // an incorrect resume position.
    mocks.suggestions.push(
      suggestion(4, { score: 0.5 }),
      suggestion(5, { score: 0.95 }),
      suggestion(6, { score: 0.9 }),
    );
    renderQueue();

    const preview = () => screen.getByRole("complementary", { name: "Suggestion detail" });

    await user.keyboard("jjj");
    expect(within(preview()).getByText("Source 4")).not.toBeNull();

    await user.click(screen.getByRole("button", { name: /^Reject </ }));
    await user.click(screen.getByRole("button", { name: "Confirm reject" }));
    await user.keyboard("j");

    expect(within(preview()).getByText("Source 5")).not.toBeNull();
  });

  it("closes the preview on Escape", async () => {
    const user = userEvent.setup();
    renderQueue();

    await user.keyboard("j");
    expect(screen.queryByRole("complementary", { name: "Suggestion detail" })).not.toBeNull();

    await user.keyboard("{Escape}");
    expect(
      within(screen.getByRole("complementary", { name: "Suggestion detail" })).getByText(
        "Select a suggestion",
      ),
    ).not.toBeNull();
  });

  it("ignores shortcuts while a field has focus", async () => {
    const user = userEvent.setup();
    renderQueue();

    await user.click(screen.getByLabelText("Score threshold"));
    await user.keyboard("r");

    expect(mocks.reviewMutate).not.toHaveBeenCalled();
  });

  it("opens a suggestion from the keyboard", async () => {
    const user = userEvent.setup();
    renderQueue();

    const open = screen.getAllByRole("button", { name: /^Open suggestion:/ })[0];
    open.focus();
    await user.keyboard("{Enter}");

    expect(screen.getByRole("complementary", { name: "Suggestion detail" })).not.toBeNull();
  });
});

describe("ValidationPage load states", () => {
  it("shows a placeholder rather than an empty queue while sites load", () => {
    mocks.sitesQuery = query({ isPending: true });
    renderQueue();

    expect(screen.getByLabelText("Loading suggestions")).not.toBeNull();
    expect(document.body.textContent).not.toContain("No suggestions match these filters");
  });

  it("never reports a failed load as an empty queue", () => {
    mocks.suggestionsQuery = query({ isError: true });
    renderQueue();

    expect(screen.getByRole("alert").textContent).toContain(
      "The review queue could not be loaded",
    );
    expect(document.body.textContent).not.toContain("No suggestions match these filters");
  });

  it("points a brand-new account at the Sites page", () => {
    mocks.suggestions.length = 0;
    mocks.sitesQuery = query({ data: [] });
    renderQueue();

    expect(document.body.textContent).toContain("No sites are connected yet");
  });
});

describe("ValidationPage mixed-method queue", () => {
  /**
   * A queue can retain historical cosine rows beside current Hybrid rows.
   * Neither may be hidden, miscounted, or made harder to act on than the other.
   */
  const hybrid = (id: number, overrides: Partial<Suggestion> = {}) =>
    suggestion(id, {
      method: "hybrid_bm25",
      score_components: {
        version: "hybrid_bm25_v1",
        final_order: "bm25_512",
        bm25_score: 12.5,
        semantic: 0.8,
      },
      ...overrides,
    });

  it("lists baseline and hybrid rows without method metadata", () => {
    mocks.suggestions.splice(
      0,
      mocks.suggestions.length,
      suggestion(1),
      hybrid(2),
    );
    renderQueue();

    expect(screen.getByText("Source 1")).not.toBeNull();
    expect(screen.getByText("Source 2")).not.toBeNull();
    expect(document.body.textContent).not.toContain("hybrid BM25");
    expect(document.body.textContent).not.toContain("cosine");
  });

  it("counts a hybrid row in the status chips like any other", () => {
    mocks.suggestions.splice(
      0,
      mocks.suggestions.length,
      suggestion(1),
      hybrid(2),
      hybrid(3, { status: "approved" }),
    );
    renderQueue();

    expect(screen.getByRole("button", { name: /Pending.*2/ })).not.toBeNull();
    expect(screen.getByRole("button", { name: /Selected.*1/ })).not.toBeNull();
  });

  it("reviews a hybrid row through the same mutation as a baseline row", async () => {
    const user = userEvent.setup();
    mocks.suggestions.splice(0, mocks.suggestions.length, hybrid(2));
    renderQueue();

    await user.click(screen.getByRole("button", { name: /^Accept suggestion/ }));

    expect(mocks.reviewMutate).toHaveBeenCalledWith(
      { id: 2, status: "approved" },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it("applies a threshold rule across both methods at once", async () => {
    const user = userEvent.setup();
    mocks.suggestions.splice(
      0,
      mocks.suggestions.length,
      suggestion(1, { score: 0.9 }),
      hybrid(2, { score: 0.85 }),
    );
    renderQueue();

    await user.click(screen.getByRole("button", { name: /^Accept ≥/ }));
    expect(screen.getByRole("region", { name: /2 pending suggestions/ }).textContent).toContain(
      "2 pending suggestions",
    );
    await user.click(screen.getByRole("button", { name: "Confirm accept" }));

    // The rule carries no method, so it reaches the hybrid row too.
    const [rule] = mocks.filteredBulkMutate.mock.calls[0];
    expect(rule).not.toHaveProperty("method");
    expect(rule.thresholdPercent).toBe(80);
  });
});

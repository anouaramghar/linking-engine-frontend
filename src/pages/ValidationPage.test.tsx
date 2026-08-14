import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useParams } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BulkReviewChunkError } from "../api/suggestions";
import { QueueWorkspaceProvider } from "../hooks/useQueueWorkspace";
import type { Suggestion } from "../types/suggestion";
import ValidationPage from "./ValidationPage";

/** Keeps legacy approval links observable while the queue owns the workflow. */
function PublishStub() {
  const { siteId } = useParams();
  return <div>Legacy approval link for site {siteId}</div>;
}

/**
 * The queue keeps its filters in the URL so they can be linked to, which means
 * it needs a router even when a test never navigates. Entries let a test start
 * from a filtered queue the way a shared link would.
 *
 * Legacy approval routes remain mounted as stubs so old-link behavior stays
 * observable, even though the current flow never navigates to them.
 */
const renderQueue = (initialEntry = "/") => {
  const result = render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route
          path="/"
          element={
            <QueueWorkspaceProvider>
              <ValidationPage />
            </QueueWorkspaceProvider>
          }
        />
        <Route path="/publish" element={<div>Approval site list</div>} />
        <Route path="/publish/:siteId" element={<PublishStub />} />
      </Routes>
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByText("Bulk review", { exact: true }));
  return result;
};

const WorkspaceHarness = ({ mounted }: { mounted: boolean }) => (
  <QueueWorkspaceProvider>
    {mounted ? <ValidationPage /> : <div>Another page</div>}
  </QueueWorkspaceProvider>
);

const renderPersistentQueue = () => {
  const result = render(
    <MemoryRouter initialEntries={["/"]}>
      <WorkspaceHarness mounted />
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByText("Bulk review", { exact: true }));
  return result;
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
  exposureMutate: vi.fn(),
  bulkMutate: vi.fn(),
  filteredBulkMutate: vi.fn(),
  filteredUndoMutate: vi.fn(),
  prepareMutate: vi.fn(),
  prepareReset: vi.fn(),
  approveMutate: vi.fn(),
  queueMutate: vi.fn(),
  /** Ids the engine reports it could not review, as a live publish would. */
  bulkSkipped: [] as number[],
  /** Undefined derives ids from the rule; null models a result over the cap. */
  filteredReviewedIds: undefined as number[] | null | undefined,
  filteredReviewedCount: undefined as number | undefined,
  filteredUndoOperationId: null as string | null,
  bulkError: null as unknown,
  filteredBulkError: null as unknown,
  pendingPublication: [] as {
    site_id: number;
    selected_suggestions: number;
    approved_plans: number;
    can_publish?: boolean;
  }[],
  /** Every count query the page asked for, and whether it was allowed to run. */
  countsQueries: [] as {
    filters: { siteId?: number; minPercent?: number; maxPercent?: number };
    enabled: boolean;
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
  // about; they assert on the queue and its review decisions, so it stays at rest.
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
  useSuggestionCounts: (
    filters: {
      siteId?: number;
      minPercent?: number;
      maxPercent?: number;
    },
    enabled = true,
  ) => {
    mocks.countsQueries.push({ filters, enabled });
    if (!enabled) {
      // What the real hook reports for a query it never ran.
      return {
        data: undefined,
        isPending: true,
        isError: false,
        isFetching: false,
        refetch: vi.fn(),
      };
    }
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
  useMarkSuggestionsExposed: () => ({ mutate: mocks.exposureMutate }),
  useBulkReview: () => ({ mutate: mocks.bulkMutate, isPending: false }),
  useFilteredBulkReview: () => ({
    mutate: mocks.filteredBulkMutate,
    isPending: false,
  }),
  useFilteredBulkUndo: () => ({ mutate: mocks.filteredUndoMutate, isPending: false }),
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
  mocks.exposureMutate.mockReset();
  mocks.bulkMutate.mockReset();
  mocks.filteredBulkMutate.mockReset();
  mocks.filteredUndoMutate.mockReset();
  mocks.prepareMutate.mockReset();
  mocks.prepareReset.mockReset();
  mocks.approveMutate.mockReset();
  mocks.queueMutate.mockReset();
  mocks.bulkSkipped = [];
  mocks.filteredReviewedIds = undefined;
  mocks.filteredReviewedCount = undefined;
  mocks.filteredUndoOperationId = null;
  mocks.bulkError = null;
  mocks.filteredBulkError = null;
  mocks.pendingPublication = [];
  mocks.countsOverride = null;
  mocks.countsQueries = [];
  mocks.publicationPlans = {};
  mocks.reviewMutate.mockImplementation((_variables, options) => options?.onSuccess?.());
  mocks.exposureMutate.mockImplementation((_variables, options) => options?.onSuccess?.());
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
        undo_operation_id: mocks.filteredUndoOperationId,
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
        name: /Select suggestion from Example site: Source 1/,
      }) as HTMLButtonElement).disabled,
    ).toBe(false);
    expect(
      (screen.getByRole("button", { name: /^Select ≥/ }) as HTMLButtonElement).disabled,
    ).toBe(false);
    expect(screen.queryByText(/Review actions are paused/)).toBeNull();
    // Publication review is opened from the selected suggestion detail, not a
    // second toolbar attached to the queue.
    expect(screen.queryByText(/ready for exact-edit review/)).toBeNull();
  });

  it("pauses review actions while filtered results are being replaced", () => {
    mocks.suggestionsQuery = query({ isPlaceholderData: true });
    renderQueue();

    expect(
      (screen.getByRole("button", {
        name: /Select suggestion from Example site: Source 1/,
      }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: /^Select ≥/ }) as HTMLButtonElement).disabled,
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

    await user.click(screen.getByRole("button", { name: /^Select ≥/ }));
    expect(screen.getByRole("region", { name: /1 pending suggestion/ }).textContent).toContain(
      "1 pending suggestion",
    );
    await user.click(screen.getByRole("button", { name: "Confirm selection" }));

    expect(mocks.filteredBulkMutate).toHaveBeenCalledWith(
      { siteId: undefined, status: "approved", thresholdPercent: 80 },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    );
    expect(screen.getByRole("status").textContent).toContain("1 suggestion selected for exact-edit review");
    await user.click(screen.getByRole("button", { name: /Selected.*1/ }));
    expect(screen.getByText("Source 1")).not.toBeNull();
  });

  it("saves an individual decision through the backend mutation", async () => {
    const user = userEvent.setup();
    renderQueue();

    await user.click(
      screen.getByRole("button", { name: /Select suggestion from Example site: Source 1/ }),
    );

    expect(mocks.reviewMutate).toHaveBeenCalledWith(
      { id: 1, status: "approved" },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    );
    await user.click(screen.getByRole("button", { name: /Selected.*1/ }));
    expect(screen.getByText("Source 1")).not.toBeNull();
  });

  it("captures an optional rejection reason before saving an individual decision", async () => {
    const user = userEvent.setup();
    renderQueue();

    await user.click(
      screen.getByRole("button", {
        name: "Reject suggestion from Example site: Source 1 to Target 1",
      }),
    );
    expect(screen.getByRole("dialog", { name: "Why reject this suggestion?" })).not.toBeNull();

    await user.click(screen.getByRole("button", { name: "Wrong target" }));

    expect(mocks.reviewMutate).toHaveBeenCalledWith(
      { id: 1, status: "rejected", rejectionReason: "wrong_target" },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    );
  });

  it("records the visible queue rows as exposed once", async () => {
    renderQueue();

    await waitFor(() =>
      expect(mocks.exposureMutate).toHaveBeenCalledWith(
        { ids: [1, 2], surface: "queue" },
        expect.objectContaining({ onError: expect.any(Function) }),
      ),
    );
    expect(mocks.exposureMutate).toHaveBeenCalledTimes(1);
  });

  it("cancels a bulk action without sending or changing decisions", async () => {
    const user = userEvent.setup();
    renderQueue();

    await user.click(screen.getByRole("button", { name: /^Select ≥/ }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("region", { name: /pending suggestion/ })).toBeNull();
    expect(screen.getByText("Source 1")).not.toBeNull();
    expect(screen.getByRole("button", { name: /Selected.*0/ })).not.toBeNull();
    expect(mocks.filteredBulkMutate).not.toHaveBeenCalled();
  });

  // A bulk rule only ever matches pending rows, so on any other chip its two
  // counts label a control that is already disabled. They are aggregates over
  // the whole fleet, and they change with the threshold and with the site
  // filter, so asking for them there is real database work for a number nobody
  // can act on.
  it("stops counting the bulk rule once a non-pending chip is shown", async () => {
    const user = userEvent.setup();
    renderQueue();

    const rule = () =>
      mocks.countsQueries.filter(
        ({ filters }) =>
          filters.minPercent !== undefined || filters.maxPercent !== undefined,
      );
    expect(rule().every(({ enabled }) => enabled)).toBe(true);

    await user.click(screen.getByText("More statuses", { exact: true }));
    mocks.countsQueries = [];
    await user.click(screen.getByRole("button", { name: /Rejected/ }));

    expect(rule()).not.toHaveLength(0);
    expect(rule().some(({ enabled }) => enabled)).toBe(false);
  });

  it("walks a bulk decision back through the undo action", async () => {
    const user = userEvent.setup();
    renderQueue();

    await user.click(screen.getByRole("button", { name: /^Select ≥/ }));
    await user.click(screen.getByRole("button", { name: "Confirm selection" }));
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
    await user.click(screen.getByRole("button", { name: /^Select ≥/ }));
    await user.click(screen.getByRole("button", { name: "Confirm selection" }));

    const notice = screen.getByRole("alert");
    expect(notice.textContent).toContain("1 suggestion selected for exact-edit review");
    expect(notice.textContent).toContain(
      "1 suggestion could not be changed: it is publishing, already published, expired, or part of an approved publication plan.",
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

    await user.click(screen.getByRole("button", { name: /^Select ≥/ }));
    await user.click(screen.getByRole("button", { name: "Confirm selection" }));

    expect(screen.getByRole("status").textContent).toContain(
      "1 suggestion selected for exact-edit review",
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

    await user.click(screen.getByRole("button", { name: /^Select ≥/ }));
    await user.click(screen.getByRole("button", { name: "Confirm selection" }));
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
    await user.click(screen.getByRole("button", { name: /^Select ≥/ }));
    await user.click(screen.getByRole("button", { name: "Confirm selection" }));

    const notice = screen.getByRole("alert");
    expect(notice.textContent).toContain("Nothing changed");
    // No dead-end retry advice for an outcome that will never change.
    expect(notice.textContent).not.toContain("try again");
    expect(screen.getByRole("button", { name: /Pending review.*2/ })).not.toBeNull();
  });

  it("keeps a large rule result undoable through its server-side cohort", async () => {
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
    mocks.filteredUndoOperationId = "operation-large";
    renderQueue();

    await user.click(screen.getByRole("button", { name: /^Select ≥/ }));
    expect(screen.getByRole("region", { name: /1001 pending suggestions/ }).textContent).toContain(
      "The decision can be undone",
    );
    await user.click(screen.getByRole("button", { name: "Confirm selection" }));

    expect(screen.getByRole("status").textContent).toContain("server-side cohort can be undone");
    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(mocks.filteredUndoMutate).toHaveBeenCalledWith(
      "operation-large",
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    );
  });

  it("never targets suggestions hidden by the active status filter", async () => {
    const user = userEvent.setup();
    renderQueue();

    await user.click(screen.getByText("More statuses", { exact: true }));
    await user.click(screen.getByRole("button", { name: /Published.*1/ }));

    expect(
      (screen.getByRole("button", { name: /^Reject </ }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: /^Select ≥/ }) as HTMLButtonElement).disabled,
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

describe("ValidationPage hand-over to approval", () => {
  const tray = () => screen.queryByRole("link", { name: "Open selected links" });

  it("stays quiet while nothing is selected or approved", () => {
    renderQueue();

    expect(tray()).toBeNull();
    expect(document.body.textContent).not.toContain("waiting for review");
    expect(document.body.textContent).not.toContain("waiting to be published");
  });

  it("keeps every publication control off the queue", () => {
    mocks.pendingPublication = [
      { site_id: 1, selected_suggestions: 24, approved_plans: 0 },
    ];
    renderQueue();

    // Selecting rows is not consent to write to a customer's site, so the tray
    // navigates and nothing here can approve or queue anything.
    expect(screen.queryByRole("button", { name: /^Publish \d+ site/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Publish this site" })).toBeNull();
    expect(screen.queryByText(/ready for exact-edit review/)).toBeNull();
    expect(mocks.prepareMutate).not.toHaveBeenCalled();
  });

  it("says what is selected and points at the scalable publication inbox", () => {
    mocks.pendingPublication = [
      { site_id: 1, selected_suggestions: 24, approved_plans: 0 },
    ];
    renderQueue();

    expect(document.body.textContent).toContain("24 links selected on 1 site");
    expect(tray()?.getAttribute("href")).toBe("/selected");
  });

  it("points at the site list when more than one site is waiting", () => {
    mocks.pendingPublication = [
      { site_id: 1, selected_suggestions: 4, approved_plans: 0 },
      { site_id: 2, selected_suggestions: 9, approved_plans: 0 },
    ];
    renderQueue();

    expect(document.body.textContent).toContain("13 links selected on 2 sites");
    const reviewLinks = screen.getAllByRole("link", { name: "Open selected links" });
    expect(reviewLinks).toHaveLength(1);
    expect(reviewLinks[0].getAttribute("href")).toBe("/selected");
  });

  it("opens the filtered site's exact edits directly", () => {
    mocks.pendingPublication = [
      { site_id: 1, selected_suggestions: 3, approved_plans: 0 },
      { site_id: 2, selected_suggestions: 9, approved_plans: 0 },
    ];
    renderQueue("/?site=1&status=approved");

    expect(tray()?.getAttribute("href")).toBe("/selected?site=1");
  });

  it("keeps the review action visible outside the long scrolling queue", () => {
    mocks.pendingPublication = [
      { site_id: 1, selected_suggestions: 35, approved_plans: 0 },
    ];
    renderQueue();

    const queueScroller = screen.getByRole("region", { name: "Suggestion queue" });
    const reviewLink = screen.getByRole("link", { name: "Open selected links" });

    expect(queueScroller.contains(reviewLink)).toBe(false);
  });

  it("leaves connection diagnosis to the publication inbox", () => {
    mocks.pendingPublication = [
      { site_id: 1, selected_suggestions: 3, approved_plans: 0, can_publish: false },
    ];
    renderQueue();

    expect(tray()?.getAttribute("href")).toBe("/selected");
  });

  it("shows progress while a selection is being saved", async () => {
    const user = userEvent.setup();
    mocks.reviewMutate.mockImplementation(() => undefined);
    renderQueue();

    await user.click(
      screen.getByRole("button", { name: /Select suggestion from Example site: Source 1/ }),
    );

    expect(screen.getByRole("status").textContent).toContain("Saving selection");
  });

  it("confirms a saved selection without opening a second surface", async () => {
    const user = userEvent.setup();
    mocks.pendingPublication = [
      { site_id: 1, selected_suggestions: 3, approved_plans: 0, can_publish: false },
    ];
    renderQueue();

    await user.click(
      screen.getByRole("button", { name: /Select suggestion from Example site: Source 1/ }),
    );

    expect(screen.getByRole("status").textContent).toContain(
      "1 suggestion selected for exact-edit review",
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("does not prepare, approve, or queue until the operator follows the inbox CTA", async () => {
    const user = userEvent.setup();
    renderQueue();

    await user.click(
      screen.getByRole("button", { name: /Select suggestion from Example site: Source 1/ }),
    );

    expect(mocks.approveMutate).not.toHaveBeenCalled();
    expect(mocks.queueMutate).not.toHaveBeenCalled();
    expect(mocks.prepareMutate).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("does not put a second exact-edit action inside an approved row", async () => {
    mocks.pendingPublication = [
      { site_id: 1, selected_suggestions: 1, approved_plans: 0 },
    ];
    mocks.suggestions[0] = suggestion(1, { status: "approved" });
    renderQueue("/?status=approved");

    expect(screen.queryByRole("button", { name: "Review exact edit" })).toBeNull();
    expect(tray()?.getAttribute("href")).toBe("/selected");
  });

  it("ignores legacy review query parameters", () => {
    renderQueue("/?status=approved&review=1");

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(mocks.prepareMutate).not.toHaveBeenCalled();
  });

  it("does not eagerly prepare an unpublishable site", () => {
    mocks.pendingPublication = [
      { site_id: 1, selected_suggestions: 3, approved_plans: 0, can_publish: false },
    ];
    renderQueue();

    expect(screen.queryByRole("button", { name: "Review exact edit" })).toBeNull();
    expect(mocks.prepareMutate).not.toHaveBeenCalled();
  });
});

describe("ValidationPage detail panel", () => {
  it("keeps suggestion detail closed until a row is selected", () => {
    renderQueue();

    expect(screen.queryByRole("complementary", { name: "Suggestion detail" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Expand suggestion detail" })).toBeNull();
  });

  it("restores an open suggestion detail from navigation state", () => {
    renderQueue("/?suggestion=1");

    const preview = screen.getByRole("complementary", { name: "Suggestion detail" });
    expect(within(preview).getByText("Source 1")).not.toBeNull();
  });

  it("keeps queue presentation state when the route is remounted", () => {
    mocks.suggestions.splice(
      0,
      mocks.suggestions.length,
      ...Array.from({ length: 21 }, (_, index) =>
        suggestion(index + 1, {
          source_article: { id: 10, title: "Shared source", url: "/shared-source" },
        }),
      ),
    );
    const result = renderPersistentQueue();

    fireEvent.click(screen.getByRole("button", { name: "Show more suggestions" }));
    fireEvent.click(
      screen.getByRole("button", { name: /Collapse suggestions for Shared source/ }),
    );
    const scroller = screen.getByRole("region", { name: "Suggestion queue" });
    Object.defineProperty(scroller, "scrollTop", {
      configurable: true,
      value: 240,
      writable: true,
    });
    fireEvent.scroll(scroller);

    result.rerender(
      <MemoryRouter initialEntries={["/"]}>
        <WorkspaceHarness mounted={false} />
      </MemoryRouter>,
    );
    result.rerender(
      <MemoryRouter initialEntries={["/"]}>
        <WorkspaceHarness mounted />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("button", { name: /Expand suggestions for Shared source/ }),
    ).not.toBeNull();
    expect(
      (screen.getByRole("region", { name: "Suggestion queue" }) as HTMLElement).scrollTop,
    ).toBe(240);

    fireEvent.click(
      screen.getByRole("button", { name: /Expand suggestions for Shared source/ }),
    );
    expect(screen.getAllByRole("button", { name: /^Open suggestion:/ })).toHaveLength(21);
  });

  it("restores the loaded source-group page after navigation", () => {
    mocks.suggestions.splice(
      0,
      mocks.suggestions.length,
      ...Array.from({ length: 21 }, (_, index) =>
        suggestion(index + 1, {
          source_article: {
            id: (index + 1) * 10,
            title: `Source ${index + 1}`,
            url: `/source-${index + 1}`,
          },
        }),
      ),
    );
    const result = renderPersistentQueue();

    fireEvent.click(screen.getByRole("button", { name: "Show more" }));
    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(21);

    result.rerender(
      <MemoryRouter initialEntries={["/"]}>
        <WorkspaceHarness mounted={false} />
      </MemoryRouter>,
    );
    result.rerender(
      <MemoryRouter initialEntries={["/"]}>
        <WorkspaceHarness mounted />
      </MemoryRouter>,
    );

    expect(screen.getAllByRole("heading", { level: 2 })).toHaveLength(21);
  });

  it("opens after a row click and closes from the preview", async () => {
    const user = userEvent.setup();
    renderQueue();

    await user.click(screen.getAllByRole("button", { name: /^Open suggestion:/ })[0]);
    const preview = screen.getByRole("complementary", { name: "Suggestion detail" });
    expect(within(preview).getByText("Source 1")).not.toBeNull();

    await user.click(within(preview).getByRole("button", { name: "Close preview" }));

    expect(screen.queryByRole("complementary", { name: "Suggestion detail" })).toBeNull();
  });

  it("hands the panel to the next row after a decision", async () => {
    const user = userEvent.setup();
    renderQueue();

    const preview = () => screen.getByRole("complementary", { name: "Suggestion detail" });

    await user.click(screen.getAllByRole("button", { name: /^Open suggestion:/ })[0]);
    expect(within(preview()).getByText("Source 1")).not.toBeNull();

    // Selecting drops the row out of the pending filter. The panel has to follow
    // the queue forward, or it is left standing on a row that has gone.
    await user.click(
      within(preview()).getByRole("button", { name: "Select for review" }),
    );

    expect(within(preview()).getByText("Source 2")).not.toBeNull();
  });

  it("keeps the queue scroll position when selecting from the detail panel", async () => {
    const user = userEvent.setup();
    const scrollIntoView = vi.fn();
    const original = Object.getOwnPropertyDescriptor(
      HTMLElement.prototype,
      "scrollIntoView",
    );
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
    });

    try {
      renderQueue();

      const preview = () => screen.getByRole("complementary", { name: "Suggestion detail" });
      await user.click(screen.getAllByRole("button", { name: /^Open suggestion:/ })[0]);
      scrollIntoView.mockClear();

      await user.click(
        within(preview()).getByRole("button", { name: "Select for review" }),
      );

      const nextPreview = screen.getByRole("complementary", {
        name: "Suggestion detail",
      });
      expect(nextPreview.contains(document.activeElement)).toBe(true);
      expect(scrollIntoView).not.toHaveBeenCalled();
    } finally {
      if (original) {
        Object.defineProperty(HTMLElement.prototype, "scrollIntoView", original);
      } else {
        Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
      }
    }
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

    await user.click(screen.getByRole("button", { name: /^Select suggestion/ }));

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

    await user.click(screen.getByRole("button", { name: /^Select ≥/ }));
    expect(screen.getByRole("region", { name: /2 pending suggestions/ }).textContent).toContain(
      "2 pending suggestions",
    );
    await user.click(screen.getByRole("button", { name: "Confirm selection" }));

    // The rule carries no method, so it reaches the hybrid row too.
    const [rule] = mocks.filteredBulkMutate.mock.calls[0];
    expect(rule).not.toHaveProperty("method");
    expect(rule.thresholdPercent).toBe(80);
  });
});

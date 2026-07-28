import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { BulkReviewChunkError } from "../api/suggestions";
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

const mocks = vi.hoisted(() => ({
  suggestions: [] as Suggestion[],
  reviewMutate: vi.fn(),
  bulkMutate: vi.fn(),
  filteredBulkMutate: vi.fn(),
  publishMutate: vi.fn(),
  /** Ids the engine reports it could not review, as a live publish would. */
  bulkSkipped: [] as number[],
  /** Undefined derives ids from the rule; null models a result over the cap. */
  filteredReviewedIds: undefined as number[] | null | undefined,
  filteredReviewedCount: undefined as number | undefined,
  bulkError: null as unknown,
  filteredBulkError: null as unknown,
  pendingPublication: [] as {
    site_id: number;
    awaiting_publication: number;
  }[],
  countsOverride: null as {
    pending: number;
    approved: number;
    rejected: number;
    applying: number;
    applied: number;
    expired: number;
    total: number;
  } | null,
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
        total: selected.length,
      },
      isPending: false,
      isError: false,
      isFetching: false,
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
  usePublishSites: () => ({ mutate: mocks.publishMutate, isPending: false }),
  usePendingPublication: () => ({
    data: mocks.pendingPublication,
    isPending: false,
    isError: false,
    isFetching: false,
    refetch: vi.fn(),
  }),
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
  mocks.publishMutate.mockReset();
  mocks.bulkSkipped = [];
  mocks.filteredReviewedIds = undefined;
  mocks.filteredReviewedCount = undefined;
  mocks.bulkError = null;
  mocks.filteredBulkError = null;
  mocks.pendingPublication = [];
  mocks.countsOverride = null;
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
});

afterEach(cleanup);

describe("ValidationPage live review state", () => {
  it("shows server counts beyond the suggestions loaded on the first page", () => {
    mocks.countsOverride = {
      pending: 2400,
      approved: 7,
      rejected: 3,
      applying: 1,
      applied: 9,
      expired: 2,
      total: 2420,
    };
    render(<ValidationPage />);

    expect(screen.getByRole("button", { name: /Pending review.*2400/ })).not.toBeNull();
    expect(screen.getByRole("button", { name: /All.*2420/ })).not.toBeNull();
    expect(screen.getAllByRole("button", { name: /^Open suggestion:/ })).toHaveLength(2);
  });

  it("saves a confirmed bulk action through the backend mutation", async () => {
    const user = userEvent.setup();
    render(<ValidationPage />);

    await user.click(screen.getByRole("button", { name: /Accept.*1/ }));
    expect(screen.getByRole("alertdialog").textContent).toContain("1 pending suggestion");
    await user.click(screen.getByRole("button", { name: "Confirm accept" }));

    expect(mocks.filteredBulkMutate).toHaveBeenCalledWith(
      { siteId: undefined, status: "approved", thresholdPercent: 80 },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    );
    expect(screen.getByRole("status").textContent).toContain("1 suggestion queued for publish");
    await user.click(screen.getByRole("button", { name: /Queued for publish.*1/ }));
    expect(screen.getByText("Source 1")).not.toBeNull();
  });

  it("saves an individual decision through the backend mutation", async () => {
    const user = userEvent.setup();
    render(<ValidationPage />);

    await user.click(screen.getAllByRole("button", { name: "Accept" })[0]);

    expect(mocks.reviewMutate).toHaveBeenCalledWith(
      { id: 1, status: "approved" },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    );
    await user.click(screen.getByRole("button", { name: /Queued for publish.*1/ }));
    expect(screen.getByText("Source 1")).not.toBeNull();
  });

  it("cancels a bulk action without sending or changing decisions", async () => {
    const user = userEvent.setup();
    render(<ValidationPage />);

    await user.click(screen.getByRole("button", { name: /Accept.*1/ }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getByText("Source 1")).not.toBeNull();
    expect(screen.getByRole("button", { name: /Queued for publish.*0/ })).not.toBeNull();
    expect(mocks.filteredBulkMutate).not.toHaveBeenCalled();
  });

  it("walks a bulk decision back through the undo action", async () => {
    const user = userEvent.setup();
    render(<ValidationPage />);

    await user.click(screen.getByRole("button", { name: /Accept.*1/ }));
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
    render(<ValidationPage />);

    // The worker claims suggestion 1 between the decision and this batch.
    mocks.bulkSkipped = [1];
    await user.click(screen.getByRole("button", { name: /Accept.*2/ }));
    await user.click(screen.getByRole("button", { name: "Confirm accept" }));

    const notice = screen.getByRole("alert");
    expect(notice.textContent).toContain("1 suggestion queued for publish");
    expect(notice.textContent).toContain(
      "1 suggestion was already picked up for publishing or had expired",
    );
    // Only the row that actually moved leaves the pending list.
    expect(screen.getByRole("button", { name: /Pending review.*2/ })).not.toBeNull();
    expect(screen.getByRole("button", { name: /Queued for publish.*1/ })).not.toBeNull();
  });

  it("uses only the engine's reviewed ids for local batch state", async () => {
    const user = userEvent.setup();
    mocks.suggestions.push(suggestion(4, { score: 0.85 }));
    // Suggestion 1 was requested but no longer exists, so it is neither
    // reviewed nor skipped by the engine.
    mocks.filteredReviewedIds = [4];
    render(<ValidationPage />);

    await user.click(screen.getByRole("button", { name: /Accept.*2/ }));
    await user.click(screen.getByRole("button", { name: "Confirm accept" }));

    expect(screen.getByRole("status").textContent).toContain(
      "1 suggestion queued for publish",
    );
    expect(screen.getByRole("button", { name: /Pending review.*2/ })).not.toBeNull();
    expect(screen.getByRole("button", { name: /Queued for publish.*1/ })).not.toBeNull();

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
    render(<ValidationPage />);

    await user.click(screen.getByRole("button", { name: /Accept.*3/ }));
    await user.click(screen.getByRole("button", { name: "Confirm accept" }));
    mocks.bulkError = new BulkReviewChunkError(
      { reviewed: [1], skipped: [], status: "pending" },
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
    expect(screen.getByRole("button", { name: /Queued for publish.*2/ })).not.toBeNull();
  });

  it("says so plainly when a batch changed nothing at all", async () => {
    const user = userEvent.setup();
    render(<ValidationPage />);

    mocks.bulkSkipped = [1];
    await user.click(screen.getByRole("button", { name: /Accept.*1/ }));
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
    render(<ValidationPage />);

    await user.click(screen.getByRole("button", { name: /Accept.*1001/ }));
    expect(screen.getByRole("alertdialog").textContent).toContain(
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
    render(<ValidationPage />);

    await user.click(screen.getByRole("button", { name: /Published live.*1/ }));

    expect(
      (screen.getByRole("button", { name: /^Reject </ }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByRole("button", { name: /^Accept ≥/ }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(document.body.textContent).toContain("Bulk rules act on pending suggestions");
  });

  it("marks the future suggestion method as Soon", () => {
    render(<ValidationPage />);

    expect(document.body.textContent).toContain("GraphSAGE Soon");
    expect(document.body.textContent).not.toContain("External links");
    expect(document.body.textContent).not.toContain("Generate anchors");
  });
});

describe("ValidationPage publish handoff", () => {
  it("stays quiet while nothing is approved", () => {
    render(<ValidationPage />);

    expect(document.body.textContent).not.toContain("waiting to be published");
  });

  it("surfaces an approved backlog and publishes the sites holding it", async () => {
    const user = userEvent.setup();
    mocks.pendingPublication = [{ site_id: 1, awaiting_publication: 24 }];
    render(<ValidationPage />);

    expect(document.body.textContent).toContain("waiting to be published");
    await user.click(screen.getByRole("button", { name: "Publish 1 site" }));

    expect(mocks.publishMutate).toHaveBeenCalledWith([1], expect.anything());
  });
});

describe("ValidationPage keyboard review", () => {
  it("moves a cursor through the queue and decides without the mouse", async () => {
    const user = userEvent.setup();
    render(<ValidationPage />);

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
    render(<ValidationPage />);

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
    render(<ValidationPage />);

    const preview = () => screen.getByRole("complementary", { name: "Suggestion detail" });

    await user.keyboard("jjj"); // cursor on the third pending row, id 4
    expect(within(preview()).getByText("Source 4")).not.toBeNull();

    // A bulk reject takes that row without going through `decide`.
    await user.click(screen.getByRole("button", { name: /Reject.*2/ }));
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
    render(<ValidationPage />);

    const preview = () => screen.getByRole("complementary", { name: "Suggestion detail" });

    await user.keyboard("jjj");
    expect(within(preview()).getByText("Source 4")).not.toBeNull();

    await user.click(screen.getByRole("button", { name: /Reject.*2/ }));
    await user.click(screen.getByRole("button", { name: "Confirm reject" }));
    await user.keyboard("j");

    expect(within(preview()).getByText("Source 5")).not.toBeNull();
  });

  it("closes the preview on Escape", async () => {
    const user = userEvent.setup();
    render(<ValidationPage />);

    await user.keyboard("j");
    expect(screen.queryByRole("complementary", { name: "Suggestion detail" })).not.toBeNull();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("complementary", { name: "Suggestion detail" })).toBeNull();
  });

  it("ignores shortcuts while a field has focus", async () => {
    const user = userEvent.setup();
    render(<ValidationPage />);

    await user.click(screen.getByLabelText("Score threshold"));
    await user.keyboard("r");

    expect(mocks.reviewMutate).not.toHaveBeenCalled();
  });

  it("opens a suggestion from the keyboard", async () => {
    const user = userEvent.setup();
    render(<ValidationPage />);

    const open = screen.getAllByRole("button", { name: /^Open suggestion:/ })[0];
    open.focus();
    await user.keyboard("{Enter}");

    expect(screen.getByRole("complementary", { name: "Suggestion detail" })).not.toBeNull();
  });
});

describe("ValidationPage load states", () => {
  it("shows a placeholder rather than an empty queue while sites load", () => {
    mocks.sitesQuery = query({ isPending: true });
    render(<ValidationPage />);

    expect(screen.getByLabelText("Loading suggestions")).not.toBeNull();
    expect(document.body.textContent).not.toContain("No suggestions match these filters");
  });

  it("never reports a failed load as an empty queue", () => {
    mocks.suggestionsQuery = query({ isError: true });
    render(<ValidationPage />);

    expect(screen.getByRole("alert").textContent).toContain(
      "The review queue could not be loaded",
    );
    expect(document.body.textContent).not.toContain("No suggestions match these filters");
  });

  it("points a brand-new account at the Sites page", () => {
    mocks.suggestions.length = 0;
    mocks.sitesQuery = query({ data: [] });
    render(<ValidationPage />);

    expect(document.body.textContent).toContain("No sites are connected yet");
  });
});

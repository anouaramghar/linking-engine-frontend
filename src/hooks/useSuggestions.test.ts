import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  useBulkReview,
  useFilteredBulkReview,
  useReview,
  useSuggestionCounts,
  useSuggestions,
} from "./useSuggestions";
import { countSuggestions } from "../api/suggestions";

const mocks = vi.hoisted(() => ({
  invalidateQueries: vi.fn(),
  listSuggestionPage: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  keepPreviousData: Symbol("keepPreviousData"),
  useInfiniteQuery: (options: unknown) => options,
  useMutation: (options: unknown) => options,
  useQuery: (options: unknown) => options,
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}));

vi.mock("../api/suggestions", () => ({
  bulkReview: vi.fn(),
  bulkReviewByFilter: vi.fn(),
  countSuggestions: vi.fn(),
  listSuggestionPage: mocks.listSuggestionPage,
  reviewSuggestion: vi.fn(),
}));

beforeEach(() => {
  mocks.invalidateQueries.mockReset();
  mocks.invalidateQueries.mockResolvedValue(undefined);
  mocks.listSuggestionPage.mockReset();
  vi.mocked(countSuggestions).mockReset();
});

describe("useSuggestions", () => {
  it("requests each cursor page without a redundant total count", async () => {
    const filters = { siteId: 3, status: "pending" as const };
    const cursor = { score: 0.8, id: 19 };
    const { result } = renderHook(() => useSuggestions(filters));
    const query = result.current as unknown as {
      queryFn: (context: { pageParam: typeof cursor | null }) => Promise<unknown>;
      getNextPageParam: (page: { next_cursor: typeof cursor | null }) =>
        | typeof cursor
        | undefined;
    };

    await query.queryFn({ pageParam: null });
    await query.queryFn({ pageParam: cursor });

    expect(mocks.listSuggestionPage).toHaveBeenNthCalledWith(1, filters, null);
    expect(mocks.listSuggestionPage).toHaveBeenNthCalledWith(2, filters, cursor);
    expect(query.getNextPageParam({ next_cursor: cursor })).toEqual(cursor);
    expect(query.getNextPageParam({ next_cursor: null })).toBeUndefined();
  });
});

describe("queue mutations", () => {
  it("does not refetch every loaded queue page after one decision", async () => {
    const { result } = renderHook(() => useReview());
    const mutation = result.current as unknown as {
      onSuccess: () => Promise<unknown>;
    };

    await mutation.onSuccess();

    expect(mocks.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["suggestions", "queue"],
      refetchType: "none",
    });
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["suggestions", "counts"],
    });
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["publish", "pending"],
    });
  });

  it.each([
    ["explicit", useBulkReview],
    ["filtered", useFilteredBulkReview],
  ])("invalidates queue counts and pending publication after %s review", async (_label, hook) => {
    const { result } = renderHook(() => hook());
    const mutation = result.current as unknown as {
      onSettled: () => Promise<unknown>;
    };

    await mutation.onSettled();

    expect(mocks.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["suggestions"],
    });
    expect(mocks.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["publish", "pending"],
    });
  });
});

type CountsQuery = {
  queryKey: unknown[];
  queryFn: () => Promise<unknown>;
  refetchOnWindowFocus?: boolean;
};

const countsOptions = (filters: Parameters<typeof useSuggestionCounts>[0]) =>
  renderHook(() => useSuggestionCounts(filters)).result.current as unknown as CountsQuery;

describe("useSuggestionCounts", () => {
  /**
   * `/suggestions/counts` answers with every status at once and accepts no
   * status bound, so SelectedPage asking with one bought a second cache entry
   * holding the identical answer the queue's chips were already paying for.
   */
  it("puts two callers that differ only by status on one cache entry", () => {
    expect(countsOptions({ siteId: 3, status: "approved" }).queryKey).toEqual(
      countsOptions({ siteId: 3 }).queryKey,
    );
  });

  it("does not send a bound the endpoint has no parameter for", async () => {
    await countsOptions({ siteId: 3, status: "approved" }).queryFn();
    expect(vi.mocked(countSuggestions)).toHaveBeenCalledWith({ siteId: 3 });
  });

  /**
   * Against the client-wide default, and only here. Nothing else moves these
   * numbers while this browser is idle — a colleague reviewing the same queue
   * does not reach this cache, and React Query stops its intervals in an
   * unfocused window — so a tab left open came back showing an old fleet.
   */
  it("opts back into a refetch when the operator returns to the tab", () => {
    expect(countsOptions({}).refetchOnWindowFocus).toBe(true);
  });
});

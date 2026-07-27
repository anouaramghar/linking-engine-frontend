import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  useBulkReview,
  useFilteredBulkReview,
  useSuggestions,
} from "./useSuggestions";

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
});

describe("useSuggestions", () => {
  it("requests total only on the first cursor page", async () => {
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

    expect(mocks.listSuggestionPage).toHaveBeenNthCalledWith(
      1,
      filters,
      null,
      true,
    );
    expect(mocks.listSuggestionPage).toHaveBeenNthCalledWith(
      2,
      filters,
      cursor,
      false,
    );
    expect(query.getNextPageParam({ next_cursor: cursor })).toEqual(cursor);
    expect(query.getNextPageParam({ next_cursor: null })).toBeUndefined();
  });
});

describe("queue mutations", () => {
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

import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useBulkReview } from "./useSuggestions";

const mocks = vi.hoisted(() => ({
  invalidateQueries: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({
  useMutation: (options: unknown) => options,
  useQuery: vi.fn(),
  useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }),
}));

vi.mock("../api/suggestions", () => ({
  bulkReview: vi.fn(),
  listSuggestionsForSites: vi.fn(),
  reviewSuggestion: vi.fn(),
}));

describe("useBulkReview", () => {
  it("invalidates suggestions after either mutation outcome", async () => {
    const { result } = renderHook(() => useBulkReview());
    const mutation = result.current as unknown as {
      onSettled: () => Promise<unknown>;
    };

    await mutation.onSettled();

    expect(mocks.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["suggestions"],
    });
  });
});

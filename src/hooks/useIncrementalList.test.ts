import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useIncrementalList } from "./useIncrementalList";

const items = (count: number) => Array.from({ length: count }, (_, index) => index);

describe("useIncrementalList", () => {
  it("mounts only the first page of a long list", () => {
    const { result } = renderHook(() => useIncrementalList(items(5000), "pending", 100));

    expect(result.current.visible).toHaveLength(100);
    expect(result.current.total).toBe(5000);
    expect(result.current.hasMore).toBe(true);
  });

  it("extends a page at a time", () => {
    const { result } = renderHook(() => useIncrementalList(items(250), "pending", 100));

    act(() => result.current.showMore());
    expect(result.current.visible).toHaveLength(200);

    act(() => result.current.showMore());
    expect(result.current.visible).toHaveLength(250);
    expect(result.current.hasMore).toBe(false);
  });

  it("returns to the first page when the filters change", () => {
    const { result, rerender } = renderHook(
      ({ key }) => useIncrementalList(items(500), key, 100),
      { initialProps: { key: "pending" } },
    );

    act(() => result.current.showMore());
    expect(result.current.shown).toBe(200);

    rerender({ key: "approved" });
    expect(result.current.shown).toBe(100);
  });

  it("reports a short list as fully shown", () => {
    const { result } = renderHook(() => useIncrementalList(items(4), "pending", 100));

    expect(result.current.hasMore).toBe(false);
    expect(result.current.shown).toBe(4);
  });
});

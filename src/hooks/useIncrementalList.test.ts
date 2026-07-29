import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useIncrementalList } from "./useIncrementalList";

const items = (count: number) => Array.from({ length: count }, (_, index) => index);

afterEach(() => vi.unstubAllGlobals());

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

  it("stops auto-loading once the mounted list gets long", () => {
    // 100 a page, auto-loading capped at 300: scrolling gets three pages, and
    // the rest is the editor's call. Without the cap an unattended scroll walks
    // the whole queue into the DOM, which is the freeze this hook exists for.
    let intersect = () => {};
    const observe = vi.fn();
    class MockIntersectionObserver {
      readonly root = null;
      readonly rootMargin = "0px";
      readonly thresholds = [0];
      readonly disconnect = vi.fn();
      readonly observe = observe;
      readonly takeRecords = () => [];
      readonly unobserve = vi.fn();

      constructor(callback: IntersectionObserverCallback) {
        intersect = () =>
          callback(
            [{ isIntersecting: true } as IntersectionObserverEntry],
            this as unknown as IntersectionObserver,
          );
      }
    }
    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);

    const { result } = renderHook(() => useIncrementalList(items(5000), "pending", 100, 300));
    const sentinel = document.createElement("div");
    act(() => result.current.sentinel(sentinel));
    expect(observe).toHaveBeenCalledWith(sentinel);

    act(intersect);
    act(intersect);
    expect(result.current.shown).toBe(300);
    expect(result.current.autoLoadPaused).toBe(true);

    // More intersections do nothing after the cap.
    act(intersect);
    expect(result.current.shown).toBe(300);

    // Asking explicitly still works — the cap bounds scrolling, not the editor.
    act(() => result.current.showMore());
    expect(result.current.shown).toBe(400);
  });

  it("does not pause on a list that is fully shown", () => {
    const { result } = renderHook(() => useIncrementalList(items(250), "pending", 100, 200));

    act(() => result.current.showMore());
    act(() => result.current.showMore());
    expect(result.current.hasMore).toBe(false);
    expect(result.current.autoLoadPaused).toBe(false);
  });

  it("reports a short list as fully shown", () => {
    const { result } = renderHook(() => useIncrementalList(items(4), "pending", 100));

    expect(result.current.hasMore).toBe(false);
    expect(result.current.shown).toBe(4);
  });
});

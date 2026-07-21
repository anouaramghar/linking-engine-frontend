import { useCallback, useRef, useState } from "react";

export const PAGE_SIZE = 100;

/**
 * Renders a long list a page at a time. The queue holds every suggestion for
 * every site, so committing all of them to the DOM at once is what freezes the
 * tab — this bounds what is mounted without changing what is loaded.
 *
 * `resetKey` returns the list to the first page when the filters change.
 */
export const useIncrementalList = <T,>(
  items: T[],
  resetKey: unknown,
  pageSize = PAGE_SIZE,
) => {
  const [count, setCount] = useState(pageSize);
  const [seenKey, setSeenKey] = useState(resetKey);
  const observer = useRef<IntersectionObserver | null>(null);

  // Adjusted during render rather than in an effect: the first page is what
  // this key should always have shown, so there is no correct intermediate
  // state to paint before an effect could correct it.
  if (seenKey !== resetKey) {
    setSeenKey(resetKey);
    setCount(pageSize);
  }

  const showMore = useCallback(
    () => setCount((current) => current + pageSize),
    [pageSize],
  );

  const shown = Math.min(count, items.length);
  const hasMore = items.length > count;

  // A callback ref, so the observer is wired when the sentinel mounts and torn
  // down when it leaves — no ref reads during render.
  const sentinel = useCallback(
    (node: HTMLDivElement | null) => {
      observer.current?.disconnect();
      if (!node || typeof IntersectionObserver === "undefined") return;

      observer.current = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) showMore();
      });
      observer.current.observe(node);
    },
    [showMore],
  );

  return {
    visible: items.slice(0, count),
    total: items.length,
    shown,
    hasMore,
    showMore,
    sentinel,
  };
};

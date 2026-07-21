import { useCallback, useEffect, useRef, useState } from "react";

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
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCount(pageSize);
  }, [resetKey, pageSize]);

  const showMore = useCallback(
    () => setCount((current) => current + pageSize),
    [pageSize],
  );

  const hasMore = items.length > count;

  // Extend on scroll where the browser supports it; the button below the list
  // stays the accessible path and the fallback everywhere else.
  useEffect(() => {
    const node = sentinel.current;
    if (!hasMore || !node || typeof IntersectionObserver === "undefined") return;

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) showMore();
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, showMore, count]);

  return {
    visible: items.slice(0, count),
    total: items.length,
    shown: Math.min(count, items.length),
    hasMore,
    showMore,
    sentinel,
  };
};

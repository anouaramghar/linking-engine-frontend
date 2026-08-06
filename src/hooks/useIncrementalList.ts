import { useCallback, useRef, useState } from "react";

export const PAGE_SIZE = 100;

/**
 * Where the sentinel stops pulling pages in on its own. Auto-loading is a
 * convenience for the first few screens; left unattended it walks the whole
 * queue into the DOM, which is the freeze this hook exists to prevent. Past
 * this point the editor has to ask.
 */
export const AUTO_LOAD_LIMIT = 500;
/** Hard ceiling for manual loading, so repeated clicks cannot mount an unbounded DOM. */
export const MAX_RENDER_LIMIT = 1000;

/**
 * Renders a long list a page at a time. The queue holds every suggestion for
 * every site, so committing all of them to the DOM at once is what freezes the
 * tab — this bounds what is mounted without changing what is loaded.
 *
 * Scrolling pulls in a page at a time up to `autoLoadLimit`, after which
 * `showMore` is the only way forward. `resetKey` returns the list to the first
 * page when the filters change.
 */
export const useIncrementalList = <T,>(
  items: T[],
  resetKey: unknown,
  pageSize = PAGE_SIZE,
  autoLoadLimit = AUTO_LOAD_LIMIT,
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
    () => setCount((current) => Math.min(MAX_RENDER_LIMIT, current + pageSize)),
    [pageSize],
  );

  // Scrolling grows the list only while it is still small. The guard lives in
  // the updater rather than the observer callback so it reads the committed
  // count, not one captured when the sentinel happened to mount.
  const autoShowMore = useCallback(
    () =>
      setCount((current) =>
        Math.min(
          MAX_RENDER_LIMIT,
          current >= autoLoadLimit ? current : current + pageSize,
        ),
      ),
    [autoLoadLimit, pageSize],
  );

  const shown = Math.min(count, items.length);
  const hasMore = items.length > count;
  const renderLimitReached = hasMore && count >= MAX_RENDER_LIMIT;

  // A callback ref, so the observer is wired when the sentinel mounts and torn
  // down when it leaves — no ref reads during render.
  const sentinel = useCallback(
    (node: HTMLDivElement | null) => {
      observer.current?.disconnect();
      if (!node || typeof IntersectionObserver === "undefined") return;

      observer.current = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) autoShowMore();
      });
      observer.current.observe(node);
    },
    [autoShowMore],
  );

  return {
    visible: items.slice(0, count),
    total: items.length,
    shown,
    hasMore,
    renderLimitReached,
    showMore,
    sentinel,
    /** Scrolling has stopped growing the list; only `showMore` will now. */
    autoLoadPaused: hasMore && count >= autoLoadLimit,
  };
};

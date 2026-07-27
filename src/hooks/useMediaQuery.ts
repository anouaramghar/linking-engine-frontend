import { useSyncExternalStore } from "react";

/**
 * The review queue is a two-pane layout: a list beside a fixed 410px detail
 * panel. Below Tailwind's `xl` the pair no longer fits — a 1024px window leaves
 * the list about 326px once the nav and panel take their share, which is less
 * than a row's own fixed columns need. Below this width the panel overlays the
 * list instead of sitting beside it.
 */
export const OVERLAY_PREVIEW_QUERY = "(max-width: 1279.98px)";

const subscribe = (query: string) => (onChange: () => void) => {
  const list = window.matchMedia?.(query);
  list?.addEventListener("change", onChange);
  return () => list?.removeEventListener("change", onChange);
};

/**
 * Read a media query as render state.
 *
 * `useSyncExternalStore` rather than an effect writing state: the layout branch
 * is derived from the viewport, so reading it during render avoids the extra
 * pass — and the flash of the wrong layout — that `useEffect` + `setState` costs.
 *
 * Falls back to "does not match" where `matchMedia` is unavailable, which keeps
 * jsdom on the side-by-side layout the component tests were written against.
 */
export const useMediaQuery = (query: string) =>
  useSyncExternalStore(
    subscribe(query),
    () => window.matchMedia?.(query).matches ?? false,
    () => false,
  );

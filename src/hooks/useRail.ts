import { useCallback, useState } from "react";

/**
 * Whether the desktop rail shows labels or only marks.
 *
 * Stored rather than held in React state alone: collapsing the rail is a
 * workspace decision, not a per-page one, and an operator who narrows it to buy
 * horizontal room for the queue table should not have to redo that on the next
 * reload. Same storage discipline as `useTheme` — one key, one read, and a
 * `catch` because storage throws outright under a restrictive privacy setting.
 *
 * Deliberately *not* mirrored by a pre-paint script the way the theme is. A
 * theme flash repaints the whole page; this one only settles a 176px width
 * inside a shell that is already painting, and the width transition is
 * suppressed until after mount so it reads as the initial state rather than an
 * animation nobody asked for.
 */
const STORAGE_KEY = "linkmesh.rail";

export type RailState = "expanded" | "collapsed";

export const readStoredRail = (): RailState => {
  try {
    return window.localStorage?.getItem(STORAGE_KEY) === "collapsed" ? "collapsed" : "expanded";
  } catch {
    return "expanded";
  }
};

export const useRail = () => {
  const [state, setState] = useState<RailState>(readStoredRail);

  const toggle = useCallback(() => {
    setState((current) => {
      const next: RailState = current === "collapsed" ? "expanded" : "collapsed";
      try {
        window.localStorage?.setItem(STORAGE_KEY, next);
      } catch {
        // The choice still holds for this session.
      }
      return next;
    });
  }, []);

  return { collapsed: state === "collapsed", toggle };
};

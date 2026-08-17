import { createContext, createElement, useCallback, useContext, useLayoutEffect, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";

import { useMediaQuery } from "./useMediaQuery";

export const THEMES = ["light", "dark", "system"] as const;
export type ThemePreference = (typeof THEMES)[number];
/** What actually gets painted. "system" is a preference, never an appearance. */
export type ResolvedTheme = "light" | "dark";

export const DARK_SCHEME_QUERY = "(prefers-color-scheme: dark)";
export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/** Screen-space point the reveal animation grows outward from. */
export interface ThemeSwitchOrigin {
  x: number;
  y: number;
}

const STORAGE_KEY = "linkmesh.theme";

const CIRCLE_REVEAL_DURATION_MS = 500;

/** The radius a circle at `origin` needs to cover every corner of the viewport. */
const coveringRadius = (origin: ThemeSwitchOrigin) =>
  Math.hypot(
    Math.max(origin.x, window.innerWidth - origin.x),
    Math.max(origin.y, window.innerHeight - origin.y),
  );

const isPreference = (value: unknown): value is ThemePreference =>
  THEMES.includes(value as ThemePreference);

/**
 * The stored preference, or "system" when there is nothing to read.
 *
 * Shared with the pre-paint script in `public/theme-boot.js`, which does the
 * same read in plain JS before React mounts. The two must agree on the key and the values or
 * the page repaints on hydration — that duplication is the price of having no
 * flash, and it is why both sides are one `localStorage.getItem` and nothing
 * more.
 */
export const readStoredTheme = (): ThemePreference => {
  try {
    const stored = window.localStorage?.getItem(STORAGE_KEY);
    return isPreference(stored) ? stored : "system";
  } catch {
    // Storage can throw outright under a restrictive privacy setting.
    return "system";
  }
};

/**
 * Read/write the colour theme.
 *
 * Three states rather than a boolean: "system" is not a third colour, it is the
 * absence of an override, and collapsing it into a toggle loses the ability to
 * follow the OS when it changes at sunset. `useMediaQuery` supplies that OS
 * reading and re-renders when it flips, so a user sitting on "system" sees the
 * change without a reload.
 *
 * The resolved value is written to `<html data-theme>` rather than held only in
 * React, because the palette lives in CSS: the attribute *is* the theme, and
 * everything outside the React tree — the scrollbars, the native form controls,
 * the modal portals — reads it from there.
 *
 * Written as `useLayoutEffect` rather than `useEffect`: the circle-reveal below
 * drives the attribute write through `flushSync` inside `startViewTransition`'s
 * callback, and only a layout effect is guaranteed to have run by the time that
 * call returns. A passive effect would leave the transition's "before" snapshot
 * showing the *old* theme, since it runs on a later tick.
 */
export const useTheme = () => {
  const [preference, setPreference] = useState<ThemePreference>(readStoredTheme);
  const prefersDark = useMediaQuery(DARK_SCHEME_QUERY);
  const prefersReducedMotion = useMediaQuery(REDUCED_MOTION_QUERY);

  const resolved: ResolvedTheme =
    preference === "system" ? (prefersDark ? "dark" : "light") : preference;

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = resolved;
  }, [resolved]);

  const applyPreference = useCallback((next: ThemePreference) => {
    setPreference(next);
    try {
      window.localStorage?.setItem(STORAGE_KEY, next);
    } catch {
      // The preference still holds for this session.
    }
  }, []);

  /**
   * `origin` is where the operator's pointer landed on the control that
   * triggered the change — the circle the new theme reveals through grows from
   * there. Omitted (keyboard activation with no measurable point, a browser
   * without View Transitions, or `prefers-reduced-motion`) and the swap is a
   * plain, instant repaint instead of a cut skipped for a real reason.
   */
  const setTheme = useCallback(
    (next: ThemePreference, origin?: ThemeSwitchOrigin) => {
      if (!origin || !document.startViewTransition || prefersReducedMotion) {
        applyPreference(next);
        return;
      }

      const transition = document.startViewTransition(() => {
        flushSync(() => applyPreference(next));
      });

      transition.ready
        .then(() => {
          document.documentElement.animate(
            {
              clipPath: [
                `circle(0px at ${origin.x}px ${origin.y}px)`,
                `circle(${coveringRadius(origin)}px at ${origin.x}px ${origin.y}px)`,
              ],
            },
            {
              duration: CIRCLE_REVEAL_DURATION_MS,
              easing: "ease-in-out",
              pseudoElement: "::view-transition-new(root)",
            },
          );
        })
        .catch(() => {
          // `.ready` rejects if the transition is skipped or superseded — the
          // theme has already applied above, so there is nothing left to do.
        });
    },
    [applyPreference, prefersReducedMotion],
  );

  return { preference, resolved, setTheme };
};

export interface ThemeContextValue {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setTheme: (next: ThemePreference, origin?: ThemeSwitchOrigin) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const value = useTheme();
  return createElement(ThemeContext.Provider, { value }, children);
}

export function useThemeContext() {
  return useContext(ThemeContext);
}

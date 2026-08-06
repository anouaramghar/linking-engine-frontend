import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DARK_SCHEME_QUERY, useTheme } from "./useTheme";

/**
 * jsdom ships no `matchMedia`, so the OS reading has to be supplied. Returns a
 * handle that can flip the match and notify listeners, which is how the
 * "sitting on system when the OS changes at sunset" case is exercised.
 */
const stubColorScheme = (initiallyDark: boolean) => {
  const listeners = new Set<() => void>();
  let dark = initiallyDark;

  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query === DARK_SCHEME_QUERY ? dark : false,
    media: query,
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
  }));

  return {
    set(next: boolean) {
      dark = next;
      act(() => listeners.forEach((fn) => fn()));
    },
  };
};

/**
 * This jsdom build exposes no `localStorage` at all, which is the same shape as
 * the privacy setting the hook guards against — so the store is supplied here
 * rather than assumed. `throws` covers the harsher case where the property
 * exists but every access raises.
 */
const stubStorage = ({ throws = false } = {}) => {
  const entries = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => {
      if (throws) throw new Error("denied");
      return entries.get(key) ?? null;
    },
    setItem: (key: string, value: string) => {
      if (throws) throw new Error("denied");
      entries.set(key, value);
    },
  });
  return entries;
};

beforeEach(() => {
  delete document.documentElement.dataset.theme;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useTheme", () => {
  it("follows the OS when no preference has been stored", () => {
    stubStorage();
    stubColorScheme(true);

    const { result } = renderHook(() => useTheme());

    expect(result.current.preference).toBe("system");
    expect(result.current.resolved).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("keeps tracking the OS while the preference stays on system", () => {
    stubStorage();
    const os = stubColorScheme(false);

    const { result } = renderHook(() => useTheme());
    expect(result.current.resolved).toBe("light");

    os.set(true);

    expect(result.current.resolved).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("lets an explicit choice override the OS, and persists it", () => {
    const stored = stubStorage();
    const os = stubColorScheme(true);

    const { result } = renderHook(() => useTheme());
    act(() => result.current.setTheme("light"));

    expect(result.current.resolved).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(stored.get("linkmesh.theme")).toBe("light");

    // The OS moving must not walk over a choice the operator made by hand.
    os.set(false);
    expect(result.current.preference).toBe("light");
    expect(result.current.resolved).toBe("light");
  });

  it("restores a stored preference on the next mount", () => {
    stubStorage().set("linkmesh.theme", "dark");
    stubColorScheme(false);

    const { result } = renderHook(() => useTheme());

    expect(result.current.preference).toBe("dark");
    expect(result.current.resolved).toBe("dark");
  });

  it("ignores a stored value that is not a theme", () => {
    stubStorage().set("linkmesh.theme", "solarized");
    stubColorScheme(false);

    const { result } = renderHook(() => useTheme());

    expect(result.current.preference).toBe("system");
    expect(result.current.resolved).toBe("light");
  });

  it("still themes the session when storage throws", () => {
    // A restrictive privacy setting makes these raise rather than no-op, which
    // unguarded would take the whole shell down on mount.
    stubStorage({ throws: true });
    stubColorScheme(false);

    const { result } = renderHook(() => useTheme());
    expect(result.current.preference).toBe("system");

    act(() => result.current.setTheme("dark"));

    expect(result.current.resolved).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("applies the theme directly when an origin is given but the browser has no View Transitions API", () => {
    // jsdom implements neither `startViewTransition` nor the reduced-motion
    // stub below has anything to say about it — this is the "unsupported
    // browser" branch, not the "user asked for less motion" one.
    stubStorage();
    stubColorScheme(false);

    const { result } = renderHook(() => useTheme());
    act(() => result.current.setTheme("dark", { x: 10, y: 10 }));

    expect(result.current.resolved).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("themes the session when there is no storage object at all", () => {
    // This jsdom build is itself an example: `window.localStorage` is absent,
    // so the optional chaining in the hook is load-bearing, not defensive.
    vi.stubGlobal("localStorage", undefined);
    stubColorScheme(true);

    const { result } = renderHook(() => useTheme());

    expect(result.current.resolved).toBe("dark");
    expect(() => act(() => result.current.setTheme("light"))).not.toThrow();
    expect(document.documentElement.dataset.theme).toBe("light");
  });
});

import { act, render, renderHook, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState, type ReactNode } from "react";
import { describe, expect, it } from "vitest";

import { PageStateProvider, usePageState } from "./usePageState";

const wrapper = ({ children }: { children: ReactNode }) => (
  <PageStateProvider>{children}</PageStateProvider>
);

/** A page holding one piece of work, mounted and unmounted by the shell below. */
function Draft() {
  const [draft, setDraft] = usePageState("page.draft", "");
  return (
    <input
      aria-label="Draft"
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
    />
  );
}

/**
 * The shell swaps its page the way `<Routes>` does: the old one is unmounted,
 * the provider above it is not.
 */
function Shell() {
  const [onDraft, setOnDraft] = useState(true);
  return (
    <PageStateProvider>
      <button type="button" onClick={() => setOnDraft((current) => !current)}>
        Switch page
      </button>
      {onDraft ? <Draft /> : <p>Another page</p>}
    </PageStateProvider>
  );
}

describe("usePageState", () => {
  it("behaves as useState while the page is mounted", () => {
    const { result } = renderHook(() => usePageState("page.value", "first"), { wrapper });

    expect(result.current[0]).toBe("first");
    act(() => result.current[1]("second"));
    expect(result.current[0]).toBe("second");
  });

  it("supports functional updates", () => {
    const { result } = renderHook(() => usePageState("page.count", 1), { wrapper });

    act(() => result.current[1]((current) => current + 1));
    act(() => result.current[1]((current) => current + 1));

    expect(result.current[0]).toBe(3);
  });

  it("hands a page's work back when the shell mounts it again", async () => {
    const user = userEvent.setup();
    render(<Shell />);

    await user.type(screen.getByLabelText("Draft"), "half-typed filter");
    await user.click(screen.getByRole("button", { name: "Switch page" }));
    expect(screen.queryByLabelText("Draft")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Switch page" }));
    expect(screen.getByLabelText<HTMLInputElement>("Draft").value).toBe(
      "half-typed filter",
    );
  });

  it("keeps separate keys apart", () => {
    const { result } = renderHook(
      () => ({
        left: usePageState("page.left", "a"),
        right: usePageState("page.right", "b"),
      }),
      { wrapper },
    );

    act(() => result.current.left[1]("changed"));

    expect(result.current.left[0]).toBe("changed");
    expect(result.current.right[0]).toBe("b");
  });

  it("re-reads when the key changes", () => {
    const { result, rerender } = renderHook(
      ({ stateKey }: { stateKey: string }) => usePageState(stateKey, "default"),
      { wrapper, initialProps: { stateKey: "page.one" } },
    );

    act(() => result.current[1]("one's value"));
    rerender({ stateKey: "page.two" });
    expect(result.current[0]).toBe("default");

    rerender({ stateKey: "page.one" });
    expect(result.current[0]).toBe("one's value");
  });

  it("stores Sets and Maps as they are, which JSON storage could not", () => {
    const { result } = renderHook(
      () => usePageState<Set<number>>("page.selection", () => new Set()),
      { wrapper },
    );

    act(() => result.current[1](new Set([1, 2])));
    expect(result.current[0]).toEqual(new Set([1, 2]));
  });

  it("is plain useState with no provider, so a page test starts clean", () => {
    const first = renderHook(() => usePageState("page.value", "clean"));
    act(() => first.result.current[1]("dirty"));
    first.unmount();

    const second = renderHook(() => usePageState("page.value", "clean"));
    expect(second.result.current[0]).toBe("clean");
  });
});

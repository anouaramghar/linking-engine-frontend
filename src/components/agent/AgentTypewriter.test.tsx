import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import AgentTypewriter from "./AgentTypewriter";
import { REDUCED_MOTION_QUERY } from "../../hooks/useTheme";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("AgentTypewriter", () => {
  it("reveals a live reply in small chunks and settles immediately", () => {
    vi.useFakeTimers();
    const onReveal = vi.fn();
    const reply = "The queue has 3 pending suggestions.";
    const { container, rerender } = render(
      <AgentTypewriter content={reply} streaming onReveal={onReveal} />,
    );

    expect(container.textContent).toBe("");

    act(() => vi.advanceTimersByTime(96));
    expect(container.textContent).not.toBe("");
    expect(container.textContent).not.toBe(reply);
    expect(onReveal).toHaveBeenCalled();

    rerender(<AgentTypewriter content={reply} streaming={false} onReveal={onReveal} />);
    expect(container.textContent).toBe(reply);
  });

  it("shows the full reply immediately when reduced motion is preferred", () => {
    vi.spyOn(window, "matchMedia").mockImplementation((query) =>
      ({
        matches: query === REDUCED_MOTION_QUERY,
        media: query,
        onchange: null,
        addListener: () => undefined,
        removeListener: () => undefined,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
    );

    const reply = "The queue is ready.";
    const { container } = render(<AgentTypewriter content={reply} streaming />);

    expect(container.textContent).toBe(reply);
  });
});

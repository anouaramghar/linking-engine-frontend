import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import Notice from "./Notice";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Notice", () => {
  it("keeps an undo action available until the operator dismisses it", () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();

    render(
      <Notice
        notice={{ message: "2 suggestions queued.", tone: "info", undoIds: [1, 2] }}
        onDismiss={onDismiss}
        onUndo={vi.fn()}
      />,
    );

    vi.advanceTimersByTime(9_000);

    expect(onDismiss).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Undo" })).not.toBeNull();
  });
});

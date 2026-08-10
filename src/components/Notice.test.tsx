import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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

  it("pauses an informational notice while the pointer is over it", () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();

    render(
      <Notice
        notice={{ message: "Site crawl queued.", tone: "info" }}
        onDismiss={onDismiss}
      />,
    );

    const notice = screen.getByRole("status");
    vi.advanceTimersByTime(5_000);
    fireEvent.mouseEnter(notice);
    vi.advanceTimersByTime(5_000);
    expect(onDismiss).not.toHaveBeenCalled();

    fireEvent.mouseLeave(notice);
    vi.advanceTimersByTime(2_999);
    expect(onDismiss).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("pauses while a notice control has focus", () => {
    vi.useFakeTimers();
    const onDismiss = vi.fn();

    render(
      <Notice
        notice={{ message: "Site crawl queued.", tone: "info" }}
        onDismiss={onDismiss}
      />,
    );

    const dismiss = screen.getByRole("button", { name: "Dismiss message" });
    vi.advanceTimersByTime(7_500);
    fireEvent.focus(dismiss);
    vi.advanceTimersByTime(10_000);
    expect(onDismiss).not.toHaveBeenCalled();

    fireEvent.blur(dismiss, { relatedTarget: null });
    vi.advanceTimersByTime(499);
    expect(onDismiss).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

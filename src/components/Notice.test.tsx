import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import Notice from "./Notice";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Notice toast", () => {
  it("shows a successful operation as a small top-right green toast", () => {
    render(
      <Notice notice={{ message: "Saved.", tone: "info" }} onDismiss={vi.fn()} />,
    );

    const toast = screen.getByRole("status");
    expect(toast.className).toContain("fixed");
    expect(toast.className).toContain("right-4");
    expect(toast.className).toContain("top-4");
    expect(toast.className).toContain("bg-success");
  });

  it.each(["info", "error"] as const)(
    "dismisses a %s toast after two seconds",
    (tone) => {
      vi.useFakeTimers();
      const onDismiss = vi.fn();
      render(
        <Notice notice={{ message: "Operation result", tone }} onDismiss={onDismiss} />,
      );

      act(() => vi.advanceTimersByTime(1999));
      expect(onDismiss).not.toHaveBeenCalled();
      act(() => vi.advanceTimersByTime(1));
      expect(onDismiss).toHaveBeenCalledTimes(1);
    },
  );

  it("shows a failed operation in red", () => {
    vi.useFakeTimers();
    render(
      <Notice
        notice={{ message: "Could not save.", tone: "error" }}
        onDismiss={vi.fn()}
      />,
    );

    expect(screen.getByRole("alert").className).toContain("bg-error");
  });
});

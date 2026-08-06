import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import ThemeToggle from "./ThemeToggle";

afterEach(cleanup);

describe("ThemeToggle", () => {
  it("exposes the three choices as a named radio group", () => {
    render(<ThemeToggle preference="system" onChange={vi.fn()} />);

    const group = screen.getByRole("group", { name: "Colour theme" });
    expect(group).toBeTruthy();
    expect(screen.getAllByRole("radio")).toHaveLength(3);
  });

  it("shows the stored preference rather than the resolved appearance", () => {
    // "Match system" is the state a two-way switch cannot show: the page may be
    // painted dark while the *preference* is system, and the control has to say
    // so, otherwise the operator cannot tell a pinned theme from a followed one.
    render(<ThemeToggle preference="system" onChange={vi.fn()} />);

    expect(screen.getByRole("radio", { name: "Match system" })).toHaveProperty("checked", true);
    expect(screen.getByRole("radio", { name: "Dark" })).toHaveProperty("checked", false);
  });

  it("reports the chosen theme", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();

    render(<ThemeToggle preference="system" onChange={onChange} />);
    await user.click(screen.getByRole("radio", { name: "Dark" }));

    // jsdom's `getBoundingClientRect` is all zeros, so the origin the reveal
    // animation would grow from is a real point, not the "no origin" case —
    // it just happens to be the default that jsdom offers.
    expect(onChange).toHaveBeenCalledWith("dark", { x: 0, y: 0 });
  });

  it("gives each instance its own group so two toggles do not fight", async () => {
    // The shell renders one in the rail and one in the mobile header. Sharing a
    // `name` would make the browser treat them as a single group and uncheck
    // the other, which reads as the control silently clearing itself.
    const { container } = render(
      <>
        <ThemeToggle preference="dark" onChange={vi.fn()} />
        <ThemeToggle preference="dark" onChange={vi.fn()} />
      </>,
    );

    const names = new Set(
      [...container.querySelectorAll("input[type=radio]")].map((input) =>
        input.getAttribute("name"),
      ),
    );
    expect(names.size).toBe(2);
    expect(screen.getAllByRole("radio", { name: "Dark" }).every((r) => (r as HTMLInputElement).checked)).toBe(true);
  });
});

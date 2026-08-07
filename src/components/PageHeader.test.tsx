import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import PageHeader from "./PageHeader";

afterEach(cleanup);

describe("PageHeader", () => {
  it("names the page and its context", () => {
    render(<PageHeader title="Sites" sub="3 connected" />);

    expect(screen.getByRole("heading", { level: 1, name: "Sites" })).toBeTruthy();
    expect(screen.getByText("3 connected")).toBeTruthy();
  });

  it("shows the badge only when a page asks for one", () => {
    const { rerender } = render(<PageHeader title="Sites" sub="3 connected" />);
    expect(screen.queryByText("Experimental")).toBeNull();

    rerender(<PageHeader title="Sites" sub="3 connected" badge="Experimental" />);
    expect(screen.getByText("Experimental")).toBeTruthy();
  });

  it("carries no theme control", () => {
    // It used to. Rendered without props, it fell back to a `ThemeContext` that
    // no provider ever mounted, so it reported "Match system" on every page
    // regardless of the real preference and its `onChange` went nowhere — while
    // the rail's live control sat a few hundred pixels away showing the truth.
    // The shell owns the theme hook; a page header has no business owning a
    // second opinion about it.
    render(<PageHeader title="Sites" sub="3 connected" />);

    expect(screen.queryByRole("group", { name: "Colour theme" })).toBeNull();
    expect(screen.queryByRole("radio")).toBeNull();
  });
});

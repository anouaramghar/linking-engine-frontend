import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import RouteErrorBoundary from "./RouteErrorBoundary";

describe("RouteErrorBoundary", () => {
  it("turns a route render failure into a recoverable panel", () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const BrokenRoute = () => {
      throw new Error("chunk failed");
    };

    render(
      <RouteErrorBoundary>
        <BrokenRoute />
      </RouteErrorBoundary>,
    );

    expect(screen.getByRole("alert").textContent).toContain("This dashboard page could not load");
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
    consoleError.mockRestore();
  });
});

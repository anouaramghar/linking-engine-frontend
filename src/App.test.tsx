import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import App from "./App";

vi.mock("./hooks/useSites", () => ({
  useSites: () => ({ data: [{ id: 1 }] }),
}));

vi.mock("./hooks/useSuggestions", () => ({
  useSuggestionCounts: () => ({ data: { pending: 3 } }),
}));

vi.mock("./hooks/useHealth", () => ({
  useHealth: () => ({ isError: false, isPending: false }),
}));

vi.mock("./pages/ValidationPage", () => ({
  default: () => <div>Queue page</div>,
}));

vi.mock("./pages/SitesPage", () => ({
  default: () => <div>Sites page</div>,
}));

vi.mock("./pages/EvaluationPage", () => ({
  default: () => <div>Evaluation page</div>,
}));

vi.mock("./pages/ContentPoolPage", () => ({
  default: () => <div>Content pool page</div>,
}));

afterEach(cleanup);

describe("App shell", () => {
  it("offers complete mobile and desktop navigation without hiding a route", () => {
    render(
      <MemoryRouter initialEntries={["/queue"]}>
        <App />
      </MemoryRouter>,
    );

    const mobile = screen.getByRole("navigation", { name: "Mobile navigation" });
    const desktop = screen.getByRole("navigation", { name: "Primary navigation" });

    for (const nav of [mobile, desktop]) {
      expect(nav.querySelector('a[href="/queue"]')).not.toBeNull();
      expect(nav.querySelector('a[href="/sites"]')).not.toBeNull();
      expect(nav.querySelector('a[href="/content-pool"]')).not.toBeNull();
      expect(nav.querySelector('a[href="/evaluation"]')).not.toBeNull();
    }
  });

  it("announces engine health in whichever shell is visible", () => {
    render(
      <MemoryRouter>
        <App />
      </MemoryRouter>,
    );

    const statuses = screen.getAllByRole("status");
    expect(statuses).toHaveLength(2);
    for (const status of statuses) {
      expect(status.getAttribute("aria-live")).toBe("polite");
      expect(status.textContent).toContain("Engine ready");
    }
  });
});

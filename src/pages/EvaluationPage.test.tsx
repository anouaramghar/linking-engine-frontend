import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import EvaluationPage from "./EvaluationPage";

afterEach(cleanup);

describe("EvaluationPage", () => {
  it("explains that evaluation data is not connected without fabricating metrics", () => {
    render(
      <MemoryRouter>
        <EvaluationPage />
      </MemoryRouter>,
    );

    expect(screen.getByText("Connect evaluation data before measuring retrieval quality.")).not.toBeNull();
    expect(screen.getAllByText("Awaiting data").length).toBe(3);
    expect(screen.getByRole("link", { name: "Open review queue" })).not.toBeNull();
    expect(document.body.textContent).not.toContain("Soon");
    expect(document.body.textContent).toContain("BM25-512");
    expect(document.body.textContent).not.toContain("GraphSAGE");
    expect(document.body.textContent).not.toContain("cosine-baseline");
    expect(document.body.textContent).not.toContain("0.42");
    expect(document.body.textContent).not.toContain("78%");
  });
});

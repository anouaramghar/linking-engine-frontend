import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import EvaluationPage from "./EvaluationPage";

afterEach(cleanup);

describe("EvaluationPage", () => {
  it("uses Soon instead of the prototype's fabricated evaluation values", () => {
    render(<EvaluationPage />);

    expect(screen.getAllByText("Recall@10").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Editor acceptance")).not.toBeNull();
    expect(screen.getAllByText("Soon").length).toBeGreaterThanOrEqual(4);
    expect(document.body.textContent).not.toContain("0.42");
    expect(document.body.textContent).not.toContain("78%");
  });
});

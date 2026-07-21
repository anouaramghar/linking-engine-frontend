import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Suggestion } from "../types/suggestion";
import ValidationPage from "./ValidationPage";

const mocks = vi.hoisted(() => ({
  suggestions: [] as Suggestion[],
  reviewMutate: vi.fn(),
  bulkMutate: vi.fn(),
}));

vi.mock("../hooks/useSuggestions", () => ({
  useSuggestions: () => ({ data: mocks.suggestions, isLoading: false }),
  useReview: () => ({ mutate: mocks.reviewMutate }),
  useBulkReview: () => ({ mutate: mocks.bulkMutate }),
}));

vi.mock("../hooks/useSites", () => ({
  useSites: () => ({
    data: [
      {
        id: 1,
        name: "Example site",
        base_url: "https://example.com",
        platform: "wordpress",
        crawl_frequency: "daily",
        created_at: "2026-07-16T10:00:00Z",
        last_ingestion_status: "completed",
      },
    ],
  }),
}));

const suggestion = (id: number, overrides: Partial<Suggestion> = {}): Suggestion => ({
  id,
  site_id: 1,
  source_article: { id: id * 10, title: `Source ${id}`, url: `/source-${id}` },
  target_article: { id: id * 10 + 1, title: `Target ${id}`, url: `/target-${id}` },
  method: "baseline_cosine",
  score: 0.8,
  status: "pending",
  anchor_text: "anchor",
  created_at: "2026-07-16T10:00:00Z",
  ...overrides,
});

beforeEach(() => {
  mocks.suggestions.splice(
    0,
    mocks.suggestions.length,
    suggestion(1, { score: 0.8 }),
    suggestion(2, { score: 0.79 }),
    suggestion(3, { score: 0.9, status: "applied" }),
  );
  mocks.reviewMutate.mockReset();
  mocks.bulkMutate.mockReset();
  mocks.reviewMutate.mockImplementation((_variables, options) => options?.onSuccess?.());
  mocks.bulkMutate.mockImplementation((_variables, options) => options?.onSuccess?.());
});

afterEach(cleanup);

describe("ValidationPage live review state", () => {
  it("saves a confirmed bulk action through the backend mutation", async () => {
    const user = userEvent.setup();
    render(<ValidationPage />);

    await user.click(screen.getByRole("button", { name: /Accept.*1/ }));
    expect(screen.getByRole("alertdialog").textContent).toContain("1 pending suggestion");
    await user.click(screen.getByRole("button", { name: "Confirm accept" }));

    expect(mocks.bulkMutate).toHaveBeenCalledWith(
      { ids: [1], status: "approved" },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    );
    expect(screen.getByRole("status").textContent).toContain("1 suggestion queued for publish");
    await user.click(screen.getByRole("button", { name: /Queued for publish.*1/ }));
    expect(screen.getByText("Source 1")).not.toBeNull();
  });

  it("saves an individual decision through the backend mutation", async () => {
    const user = userEvent.setup();
    render(<ValidationPage />);

    await user.click(screen.getAllByRole("button", { name: "Accept" })[0]);

    expect(mocks.reviewMutate).toHaveBeenCalledWith(
      { id: 1, status: "approved" },
      expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
    );
    await user.click(screen.getByRole("button", { name: /Queued for publish.*1/ }));
    expect(screen.getByText("Source 1")).not.toBeNull();
  });

  it("cancels a bulk action without sending or changing decisions", async () => {
    const user = userEvent.setup();
    render(<ValidationPage />);

    await user.click(screen.getByRole("button", { name: /Accept.*1/ }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getByText("Source 1")).not.toBeNull();
    expect(screen.getByRole("button", { name: /Queued for publish.*0/ })).not.toBeNull();
    expect(mocks.bulkMutate).not.toHaveBeenCalled();
  });

  it("does not expose future suggestion methods", () => {
    render(<ValidationPage />);

    expect(document.body.textContent).not.toContain("GNN");
    expect(document.body.textContent).not.toContain("External links");
    expect(document.body.textContent).not.toContain("Generate anchors");
  });
});

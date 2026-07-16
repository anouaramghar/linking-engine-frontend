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
  useStats: () => ({
    data: [
      {
        site_id: 1,
        articles: 10,
        internal_links: 20,
        orphan_articles: 2,
        suggestions_by_status: { pending: 3, approved: 0, applied: 1, rejected: 0 },
        suggestions_by_method: { baseline_cosine: 3, gnn_graphsage: 1 },
        approval_rate: null,
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
  external_url: null,
  external_title: null,
  trust_score: null,
  context_before: "before ",
  context_after: " after",
  created_at: "2026-07-16T10:00:00Z",
  ...overrides,
});

beforeEach(() => {
  mocks.suggestions.splice(
    0,
    mocks.suggestions.length,
    suggestion(1, { score: 0.8 }),
    suggestion(2, { score: 0.79 }),
    suggestion(3, { score: 0.95, method: "gnn_graphsage" }),
    suggestion(4, { score: 0.9, status: "applied" }),
  );
  mocks.reviewMutate.mockClear();
  mocks.bulkMutate.mockClear();
});

afterEach(cleanup);

describe("ValidationPage static review state", () => {
  it("applies a confirmed bulk action locally without review mutations", async () => {
    const user = userEvent.setup();
    render(<ValidationPage />);

    await user.click(screen.getByRole("button", { name: "Baseline" }));
    await user.click(screen.getByRole("button", { name: /Accept.*1/ }));
    expect(screen.getByRole("alertdialog").textContent).toContain("1 pending suggestion");
    await user.click(screen.getByRole("button", { name: "Confirm accept" }));

    expect(screen.getByRole("status").textContent).toContain("1 suggestion queued for publish");
    await user.click(screen.getByRole("button", { name: /Queued for publish.*1/ }));
    expect(screen.getByText("Source 1")).not.toBeNull();
    expect(mocks.reviewMutate).not.toHaveBeenCalled();
    expect(mocks.bulkMutate).not.toHaveBeenCalled();
  });

  it("filters the loaded cards by suggestion method", async () => {
    const user = userEvent.setup();
    render(<ValidationPage />);

    await user.click(screen.getByRole("button", { name: "GNN" }));

    expect(screen.getByText("Source 3")).not.toBeNull();
    expect(screen.queryByText("Source 1")).toBeNull();
    expect(screen.queryByText("Source 2")).toBeNull();
  });

  it("cancels a bulk action without changing local statuses", async () => {
    const user = userEvent.setup();
    render(<ValidationPage />);

    await user.click(screen.getByRole("button", { name: "Baseline" }));
    await user.click(screen.getByRole("button", { name: /Accept.*1/ }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(screen.getByText("Source 1")).not.toBeNull();
    expect(screen.getByRole("button", { name: /Queued for publish.*0/ })).not.toBeNull();
  });

  it("keeps an individual decision local", async () => {
    const user = userEvent.setup();
    render(<ValidationPage />);

    await user.click(screen.getAllByRole("button", { name: "Accept" })[0]);
    await user.click(screen.getByRole("button", { name: /Queued for publish.*1/ }));

    expect(screen.getByText("Source 1")).not.toBeNull();
    expect(mocks.reviewMutate).not.toHaveBeenCalled();
    expect(mocks.bulkMutate).not.toHaveBeenCalled();
  });
});

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ArticleAnalysisModal from "./ArticleAnalysisModal";

const mocks = vi.hoisted(() => ({
  mutate: vi.fn(),
}));

vi.mock("../../hooks/useSites", () => ({
  useSiteArticles: () => ({
    articles: [
      {
        id: 42,
        external_id: null,
        title: "Install LinkMesh",
        url: "https://docs.example.com/install",
      },
      {
        id: 43,
        external_id: null,
        title: "Configure crawling",
        url: "https://docs.example.com/crawling",
      },
    ],
    isPending: false,
    isError: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: vi.fn(),
  }),
}));

vi.mock("../../hooks/useSuggestions", () => ({
  useTriggerArticleAnalysis: () => ({
    mutate: mocks.mutate,
    isPending: false,
    variables: undefined,
  }),
}));

const site = {
  id: 8,
  name: "Docs",
  base_url: "https://docs.example.com",
  platform: "wordpress" as const,
  crawl_frequency: "manual",
  suggestion_slots_available: 10,
  created_at: "2026-08-23T10:00:00Z",
  last_ingestion_status: "succeeded",
};

beforeEach(() => {
  mocks.mutate.mockReset();
});

afterEach(cleanup);

describe("ArticleAnalysisModal", () => {
  it("queues analysis for the exact article selected by the editor", async () => {
    const onClose = vi.fn();
    const onQueued = vi.fn();
    mocks.mutate.mockImplementation((_articleId, options) =>
      options?.onSuccess?.({ job_id: "article-analysis", job_run_id: 52 }),
    );
    const user = userEvent.setup();
    render(<ArticleAnalysisModal site={site} onClose={onClose} onQueued={onQueued} />);

    await user.click(
      screen.getByRole("button", { name: "Generate suggestions for Install LinkMesh" }),
    );

    expect(mocks.mutate).toHaveBeenCalledWith(42, expect.any(Object));
    expect(onQueued).toHaveBeenCalledWith(
      "Suggestion generation queued for “Install LinkMesh” as job #52.",
    );
    expect(onClose).toHaveBeenCalled();
  });

  it("filters the active article inventory by title or URL", async () => {
    const user = userEvent.setup();
    render(<ArticleAnalysisModal site={site} onClose={vi.fn()} onQueued={vi.fn()} />);

    await user.type(screen.getByRole("searchbox", { name: "Search articles" }), "crawling");

    expect(screen.queryByText("Install LinkMesh")).toBeNull();
    expect(screen.getByText("Configure crawling")).not.toBeNull();
  });
});

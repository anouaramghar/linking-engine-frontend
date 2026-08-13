import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Suggestion } from "../types/suggestion";
import SelectedPage from "./SelectedPage";

const SITE = {
  id: 1,
  name: "Example site",
  base_url: "https://example.com",
  platform: "wordpress",
  crawl_frequency: "daily",
  created_at: "2026-07-16T10:00:00Z",
  last_ingestion_status: "completed",
};

const SECOND_SITE = { ...SITE, id: 2, name: "Second site" };

const mocks = vi.hoisted(() => ({
  suggestions: [] as Suggestion[],
  reviewMutate: vi.fn(),
  lastFilters: {} as Record<string, unknown>,
}));

vi.mock("../hooks/useSites", () => ({
  useSites: () => ({ data: [SITE, SECOND_SITE], isPending: false, isError: false, refetch: vi.fn() }),
}));

vi.mock("../hooks/useSuggestions", () => ({
  useSuggestions: (filters: { status?: string; siteId?: number }) => {
    mocks.lastFilters = filters;
    return {
      items: mocks.suggestions.filter(
        (item) =>
          item.status === filters.status &&
          (filters.siteId === undefined || item.site_id === filters.siteId),
      ),
      isPending: false,
      isError: false,
      isFetching: false,
      isPlaceholderData: false,
      hasNextPage: false,
      fetchNextPage: vi.fn(),
      isFetchingNextPage: false,
    };
  },
  useSuggestionCounts: (filters: { status?: string; siteId?: number }) => {
    const scoped = mocks.suggestions.filter(
      (item) => filters.siteId === undefined || item.site_id === filters.siteId,
    );
    const approved = scoped.filter((item) => item.status === filters.status).length;
    return {
      data: { approved, total: scoped.length + 7 },
      isPending: false,
      isError: false,
      isFetching: false,
      refetch: vi.fn(),
    };
  },
  useReview: () => ({ mutate: mocks.reviewMutate, isPending: false }),
  usePlacement: () => ({
    data: undefined,
    isPending: false,
    isFetching: false,
    error: null,
    refetch: vi.fn(),
  }),
  useSuggestionEvents: () => ({
    data: [],
    isPending: false,
    isFetching: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

const suggestion = (
  id: number,
  siteId: number,
  status: Suggestion["status"] = "approved",
): Suggestion => ({
  id,
  site_id: siteId,
  source_article: { id: id * 10, title: `Source ${id}`, url: `/source-${id}` },
  target_article: { id: id * 10 + 1, title: `Target ${id}`, url: `/target-${id}` },
  target_origin: "internal",
  target_site_name: siteId === 1 ? SITE.name : SECOND_SITE.name,
  method: "baseline_cosine",
  score: 0.8,
  status,
  anchor_text: "anchor",
  created_at: "2026-08-13T10:00:00Z",
});

const renderSelected = (entry = "/selected") =>
  render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route path="/selected" element={<SelectedPage />} />
        <Route path="/publish" element={<div>All exact-edit reviews</div>} />
        <Route path="/publish/:siteId" element={<div>Site exact-edit review</div>} />
        <Route path="/queue" element={<div>Review queue</div>} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  mocks.suggestions.splice(
    0,
    mocks.suggestions.length,
    suggestion(1, 1),
    suggestion(2, 1, "pending"),
    suggestion(3, 2),
  );
  mocks.reviewMutate.mockReset();
  mocks.reviewMutate.mockImplementation((_variables, options) => options?.onSuccess?.());
});

afterEach(cleanup);

describe("SelectedPage", () => {
  it("shows only selected links and offers a batch exact-review path", () => {
    renderSelected();

    expect(screen.getByText("Selected links")).not.toBeNull();
    expect(screen.getAllByText("Source 1").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Source 3").length).toBeGreaterThan(0);
    expect(screen.queryByText("Source 2")).toBeNull();
    expect(screen.getByText("2 selected links")).not.toBeNull();
    expect(screen.getAllByText("Links to").length).toBeGreaterThan(0);
    expect(screen.queryByText("Selected for review")).toBeNull();
    expect(screen.getByRole("link", { name: "Review selected exact edits" })).not.toBeNull();
    expect(mocks.lastFilters).toMatchObject({ status: "approved" });
  });

  it("reviews one selected link in its site's protected workspace", async () => {
    const user = userEvent.setup();
    renderSelected();

    await user.click(
      screen.getAllByRole("button", { name: /Review exact edit for suggestion/ })[0],
    );

    expect(screen.getByText("Site exact-edit review")).not.toBeNull();
  });

  it("routes a site-filtered batch to that site's exact-review workspace", async () => {
    const user = userEvent.setup();
    renderSelected();

    await user.selectOptions(screen.getByRole("combobox", { name: "Site filter" }), "2");

    expect(
      screen.getByRole("link", { name: "Review Second site exact edits" }).getAttribute("href"),
    ).toBe("/publish/2");
  });

  it("returns one selected link to the queue without approving or publishing it", async () => {
    const user = userEvent.setup();
    renderSelected();

    await user.click(screen.getAllByRole("button", { name: /^Undo decision/ })[0]);

    expect(mocks.reviewMutate).toHaveBeenCalledWith(
      { id: 1, status: "pending" },
      expect.anything(),
    );
    expect(screen.getByText("The link is back in the review queue. It is not live.")).not.toBeNull();
  });
});

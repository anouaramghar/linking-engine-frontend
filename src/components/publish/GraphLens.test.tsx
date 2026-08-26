import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { GraphNetwork } from "../../types/graph";
import GraphLens from "./GraphLens";

const DATA: GraphNetwork = {
  site_id: 7,
  snapshot_id: 12,
  graph_version: "a".repeat(64),
  computed_at: "2026-08-17T10:00:00Z",
  article_count: 5,
  edge_count: 5,
  orphan_count: 1,
  underlinked_count: 2,
  hub_count: 1,
  saturated_count: 1,
  nodes: [
    {
      article_id: 1,
      article_url: "https://example.com/home",
      article_title: "Home page",
      in_degree: 2,
      out_degree: 2,
      orphan: false,
      underlinked: false,
      hub: false,
      saturated: false,
      hub_score: 0.5,
      saturation_score: 0.5,
    },
    {
      article_id: 2,
      article_url: "https://example.com/lost",
      article_title: "Lost article",
      in_degree: 0,
      out_degree: 0,
      orphan: true,
      underlinked: true,
      hub: false,
      saturated: false,
      hub_score: 0,
      saturation_score: 0,
    },
    {
      article_id: 3,
      article_url: "https://example.com/thin",
      article_title: "Thin article",
      in_degree: 1,
      out_degree: 1,
      orphan: false,
      underlinked: true,
      hub: false,
      saturated: false,
      hub_score: 0.25,
      saturation_score: 0.25,
    },
    {
      article_id: 4,
      article_url: "https://example.com/hub",
      article_title: "Hub article",
      in_degree: 1,
      out_degree: 3,
      orphan: false,
      underlinked: false,
      hub: true,
      saturated: false,
      hub_score: 0.75,
      saturation_score: 0.25,
    },
    {
      article_id: 5,
      article_url: "https://example.com/popular",
      article_title: "Popular article",
      in_degree: 4,
      out_degree: 1,
      orphan: false,
      underlinked: false,
      hub: false,
      saturated: true,
      hub_score: 0.25,
      saturation_score: 1,
    },
  ],
  edges: [
    { source_article_id: 1, target_article_id: 3 },
    { source_article_id: 1, target_article_id: 4 },
    { source_article_id: 3, target_article_id: 5 },
    { source_article_id: 4, target_article_id: 5 },
    { source_article_id: 5, target_article_id: 1 },
  ],
};

describe("GraphLens", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("finishes an active camera move when the document becomes hidden", () => {
    const originalHidden = Object.getOwnPropertyDescriptor(document, "hidden");
    const cancelAnimationFrame = vi.fn();
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 41));
    vi.stubGlobal("cancelAnimationFrame", cancelAnimationFrame);
    Object.defineProperty(document, "hidden", { configurable: true, value: false });

    try {
      const { container } = render(<GraphLens data={DATA} />);
      const frame = container.querySelector(".graph-map");
      expect(frame?.classList.contains("is-moving")).toBe(true);

      Object.defineProperty(document, "hidden", { configurable: true, value: true });
      document.dispatchEvent(new Event("visibilitychange"));

      expect(cancelAnimationFrame).toHaveBeenCalledWith(41);
      expect(frame?.classList.contains("is-moving")).toBe(false);
    } finally {
      if (originalHidden) Object.defineProperty(document, "hidden", originalHidden);
    }
  });

  it("does not start a camera animation while initially hidden", () => {
    const originalHidden = Object.getOwnPropertyDescriptor(document, "hidden");
    const requestAnimationFrame = vi.fn(() => 41);
    vi.stubGlobal("requestAnimationFrame", requestAnimationFrame);
    Object.defineProperty(document, "hidden", { configurable: true, value: true });

    try {
      render(<GraphLens data={DATA} />);

      expect(requestAnimationFrame).not.toHaveBeenCalled();
    } finally {
      if (originalHidden) Object.defineProperty(document, "hidden", originalHidden);
    }
  });

  it("shows the whole site and its structural signals", () => {
    render(<GraphLens data={DATA} />);

    expect(screen.getByRole("region", { name: "Site network" })).not.toBeNull();
    expect(screen.getByRole("button", { name: /All pages: 5/ })).not.toBeNull();
    expect(screen.getByRole("button", { name: /Orphans: 1/ })).not.toBeNull();
    expect(screen.getByRole("button", { name: /Underlinked: 2/ })).not.toBeNull();
    expect(screen.getByRole("button", { name: /Hubs: 1/ })).not.toBeNull();
    expect(screen.getByRole("button", { name: /Saturated: 1/ })).not.toBeNull();
    expect(screen.getByRole("button", { name: /Lost article.*orphan/i })).not.toBeNull();
    expect(screen.getAllByText(/5 pages and 5 internal links/)).not.toHaveLength(0);
  });

  it("shows prepared internal links alongside the active graph", () => {
    render(
      <GraphLens
        data={{
          ...DATA,
          proposed_edges: [
            {
              suggestion_id: 99,
              source_article_id: 2,
              target_article_id: 5,
              status: "new",
            },
          ],
        }}
      />,
    );

    expect(document.body.textContent).toContain("1 prepared internal link");
    const preparedLinks = screen.getByRole("group", { name: "Prepared internal links" });
    expect(preparedLinks.querySelectorAll("line.graph-edge-visible")).toHaveLength(1);
    expect(preparedLinks.querySelector("line.graph-edge-hit-target")).not.toBeNull();
  });

  it("focuses prepared links and opens their relationship in the inspector", async () => {
    const user = userEvent.setup();
    render(
      <GraphLens
        data={{
          ...DATA,
          proposed_edges: [
            {
              suggestion_id: 99,
              source_article_id: 2,
              target_article_id: 5,
              status: "new",
            },
          ],
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Prepared: 1/ }));
    expect(screen.getByRole("button", { name: /Prepared: 1/ }).getAttribute("aria-pressed")).toBe(
      "true",
    );

    await user.click(screen.getByRole("button", { name: /Prepared link: Lost article to Popular article/ }));
    expect(screen.getByText("Prepared link selected")).not.toBeNull();
    expect(screen.getByText("Lost article → Popular article")).not.toBeNull();
    expect(screen.getByText("Active links from")).not.toBeNull();
    expect(screen.getByText("Prepared links from")).not.toBeNull();
  });

  it("returns to the full graph when prepared links disappear", async () => {
    const user = userEvent.setup();
    const { rerender } = render(
      <GraphLens
        data={{
          ...DATA,
          proposed_edges: [
            {
              suggestion_id: 99,
              source_article_id: 2,
              target_article_id: 5,
              status: "new",
            },
          ],
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: /Prepared: 1/ }));
    rerender(<GraphLens data={{ ...DATA, proposed_edges: [] }} />);

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /All pages: 5/ }).getAttribute("aria-pressed")).toBe(
        "true",
      ),
    );
    expect(screen.queryByRole("button", { name: /Prepared: 1/ })).toBeNull();
  });

  it("highlights a category, lets the editor inspect a page, and zooms the map", async () => {
    const user = userEvent.setup();
    render(<GraphLens data={DATA} />);

    const orphanFilter = screen.getByRole("button", { name: /Orphans: 1/ });
    await user.click(orphanFilter);
    expect(orphanFilter.getAttribute("aria-pressed")).toBe("true");

    await user.click(screen.getByRole("button", { name: /Lost article.*orphan/i }));
    expect(screen.getByText("https://example.com/lost")).not.toBeNull();

    const lostNode = screen.getByRole("button", { name: /Lost article.*orphan/i });
    lostNode.focus();
    expect(document.activeElement).toBe(lostNode);
    await user.keyboard("{Enter}");
    expect(lostNode.querySelector(".graph-node-focus")?.getAttribute("opacity")).toBe("1");

    // Filtering for orphans flies the camera out to the isolated rim, so the
    // readout is only back at the core frame once the reset is pressed.
    await user.click(screen.getByRole("button", { name: "Reset zoom" }));
    expect(screen.getByText("100%")).not.toBeNull();

    await user.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(screen.getByText("125%")).not.toBeNull();

    await user.click(screen.getByRole("button", { name: "Zoom out" }));
    expect(screen.getByText("100%")).not.toBeNull();
  });

  it("searches the full site and exposes the selected page inspector", async () => {
    const user = userEvent.setup();
    render(<GraphLens data={DATA} />);

    const search = screen.getByRole("searchbox", { name: "Find a page" });
    await user.type(search, "lost");
    expect(screen.getByText("1 page match")).not.toBeNull();

    await user.click(screen.getByRole("button", { name: "Lost article" }));
    expect(screen.getByText("https://example.com/lost")).not.toBeNull();
    expect(screen.getByText("No active outgoing links recorded.")).not.toBeNull();
  });

  it("keeps a larger network on one frame instead of a growing canvas", () => {
    const nodes = Array.from({ length: 120 }, (_, index) => ({
      ...DATA.nodes[index % DATA.nodes.length],
      article_id: index + 1,
      article_title: "Article " + (index + 1),
      article_url: "https://example.com/article-" + (index + 1),
    }));
    const edges = nodes.slice(1).map((node, index) => ({
      source_article_id: index + 1,
      target_article_id: node.article_id,
    }));
    render(<GraphLens data={{ ...DATA, nodes, edges, article_count: 120, edge_count: 119 }} />);

    expect(screen.getAllByRole("button", { name: /Article \d+\. / })).toHaveLength(120);

    // The map is a camera over a fixed frame: a bigger site changes what the
    // frame contains, never how tall the page is.
    const map = screen.getByRole("group", { name: "Full site network map" });
    expect(map.getAttribute("height")).toBeNull();
    const viewBox = (map.getAttribute("viewBox") ?? "").split(" ").map(Number);
    expect(viewBox).toHaveLength(4);
    expect(viewBox.every((value) => Number.isFinite(value))).toBe(true);
    expect(viewBox[2]).toBeGreaterThan(0);
  });

  it("scatters unlinked pages around the linked core instead of stacking a band", () => {
    const nodes = Array.from({ length: 51 }, (_, index) => ({
      ...DATA.nodes[1],
      article_id: index + 1,
      article_title: "Article " + (index + 1),
      article_url: "https://example.com/article-" + (index + 1),
    }));
    const edges = [{ source_article_id: 1, target_article_id: 2 }];
    const { container } = render(
      <GraphLens data={{ ...DATA, nodes, edges, article_count: 51, edge_count: 1 }} />,
    );

    expect(screen.getByRole("button", { name: /49 isolated pages/ })).not.toBeNull();
    expect(screen.getByText("49")).not.toBeNull();

    // Two pages link to each other; the other 49 ring them.
    const halo = container.querySelector("g.graph-halo");
    expect(halo?.querySelectorAll("g.graph-node")).toHaveLength(49);
    expect(
      container.querySelectorAll("g[aria-label='Pages'] g.graph-node"),
    ).toHaveLength(2);
  });

  it("summarizes a large isolated group and opens a short page list", async () => {
    const user = userEvent.setup();
    const nodes = Array.from({ length: 13 }, (_, index) => ({
      ...DATA.nodes[1],
      article_id: index + 1,
      article_title: "Isolated article " + (index + 1),
      article_url: "https://example.com/isolated-" + (index + 1),
    }));

    render(<GraphLens data={{ ...DATA, nodes, edges: [], article_count: 13, edge_count: 0 }} />);

    const group = screen.getByRole("button", { name: /13 isolated pages/ });
    await user.click(group);
    expect(screen.getByRole("heading", { name: "Isolated pages" })).not.toBeNull();
    expect(screen.getByText("13 pages have no active or prepared internal link.")).not.toBeNull();
    expect(
      screen.getByRole("button", { name: /Isolated article 1\. 0 incoming/ }),
    ).not.toBeNull();
  });

  it("renders a dense network without pairwise relaxation freezing the review", () => {
    const nodes = Array.from({ length: 401 }, (_, index) => ({
      ...DATA.nodes[index % DATA.nodes.length],
      article_id: index + 1,
      article_title: "Dense article " + (index + 1),
      article_url: "https://example.com/dense-article-" + (index + 1),
    }));
    const edges = nodes.slice(1).map((node, index) => ({
      source_article_id: index + 1,
      target_article_id: node.article_id,
    }));

    render(<GraphLens data={{ ...DATA, nodes, edges, article_count: 401, edge_count: 400 }} />);

    expect(screen.getAllByRole("button", { name: /Dense article \d+\. / })).toHaveLength(401);
    expect(screen.getByRole("group", { name: "Full site network map" })).not.toBeNull();
  });
});

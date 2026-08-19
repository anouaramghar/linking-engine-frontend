import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

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
  afterEach(() => cleanup());

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

    await user.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(screen.getByText("125%")).not.toBeNull();
  });

  it("searches the full site and exposes the selected page inspector", async () => {
    const user = userEvent.setup();
    render(<GraphLens data={DATA} />);

    const search = screen.getByRole("searchbox", { name: "Find a page" });
    await user.type(search, "lost");
    expect(screen.getByText("1 page match")).not.toBeNull();

    await user.click(screen.getByRole("button", { name: "Lost article" }));
    expect(screen.getByText("https://example.com/lost")).not.toBeNull();
    expect(screen.getByText("No outgoing links recorded.")).not.toBeNull();
  });

  it("keeps a larger network bounded and deterministic", () => {
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
    expect(screen.getByRole("group", { name: "Full site network map" }).getAttribute("height")).toBe(
      "869",
    );
  });

  it("groups unlinked pages into a band instead of one flat lattice", () => {
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

    expect(screen.getByText("49 pages with no internal link")).not.toBeNull();

    // The band packs the unlinked pages; the map never grows to fill dead space.
    const map = screen.getByRole("group", { name: "Full site network map" });
    expect(Number(map.getAttribute("height"))).toBeLessThan(420);

    const rows = new Set(
      [
        ...container.querySelectorAll(
          "g[aria-label='Pages'] > g > rect:not(.graph-node-focus)",
        ),
      ].map((rect) =>
        rect.getAttribute("y"),
      ),
    );
    expect(rows.size).toBeLessThanOrEqual(6);
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
    expect(screen.getByText("Dense map mode: use search, filters, and zoom to focus.")).not.toBeNull();
  });
});

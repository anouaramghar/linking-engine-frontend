import { describe, expect, it } from "vitest";

import { layoutSiteMap } from "./siteMapLayout";
import type { GraphFeature, GraphNetworkEdge } from "../types/graph";

const page = (articleId: number): GraphFeature => ({
  article_id: articleId,
  article_url: "https://example.com/page-" + articleId,
  article_title: "Page " + articleId,
  in_degree: 0,
  out_degree: 0,
  orphan: true,
  underlinked: true,
  hub: false,
  saturated: false,
  hub_score: 0,
  saturation_score: 0,
});

const pages = (count: number) => Array.from({ length: count }, (_, index) => page(index + 1));

const chain = (count: number): GraphNetworkEdge[] =>
  Array.from({ length: count - 1 }, (_, index) => ({
    source_article_id: index + 1,
    target_article_id: index + 2,
  }));

const radiusOf = (point: { x: number; y: number }) => Math.hypot(point.x, point.y);

describe("layoutSiteMap", () => {
  it("puts linked pages in the middle and unlinked pages outside them", () => {
    const nodes = pages(30);
    const layout = layoutSiteMap(nodes, chain(6));

    expect(layout.coreIds.size).toBe(6);
    expect(layout.haloIds.size).toBe(24);

    const coreReach = Math.max(
      ...[...layout.coreIds].map((id) => radiusOf(layout.positions.get(id)!)),
    );
    const haloNearest = Math.min(
      ...[...layout.haloIds].map((id) => radiusOf(layout.positions.get(id)!)),
    );

    expect(coreReach).toBeLessThan(layout.coreRadius);
    // The gap is the reveal: nothing isolated sits inside the core's edge.
    expect(haloNearest).toBeGreaterThan(layout.coreRadius);
    expect(layout.worldRadius).toBeGreaterThan(layout.focusRadius);
  });

  it("counts a prepared link as membership of the core", () => {
    const nodes = pages(4);
    const layout = layoutSiteMap(nodes, [
      { source_article_id: 1, target_article_id: 2, proposed: true },
    ]);

    expect([...layout.coreIds].sort()).toEqual([1, 2]);
    expect([...layout.haloIds].sort()).toEqual([3, 4]);
  });

  it("spreads the halo instead of piling it up as the site grows", () => {
    const small = layoutSiteMap(pages(40), chain(4));
    const large = layoutSiteMap(pages(400), chain(4));

    expect(large.worldRadius).toBeGreaterThan(small.worldRadius);
    // Equal-area placement: ten times the pages, about three times the radius.
    expect(large.worldRadius).toBeLessThan(small.worldRadius * 6);
  });

  it("frames the whole site when no page links to another", () => {
    const layout = layoutSiteMap(pages(12), []);

    expect(layout.coreIds.size).toBe(0);
    expect(layout.focusRadius).toBe(Math.max(layout.worldRadius - 96, 150));
    expect([...layout.haloIds]).toHaveLength(12);
  });

  it("places the same snapshot the same way twice", () => {
    const nodes = pages(60);
    const edges = chain(12);
    const first = layoutSiteMap(nodes, edges);
    const second = layoutSiteMap(nodes, edges);

    nodes.forEach((node) => {
      expect(second.positions.get(node.article_id)).toEqual(
        first.positions.get(node.article_id),
      );
    });
  });

  it("survives an empty site", () => {
    const layout = layoutSiteMap([], []);

    expect(layout.positions.size).toBe(0);
    expect(layout.focusRadius).toBeGreaterThan(0);
    expect(layout.worldRadius).toBeGreaterThan(0);
  });
});

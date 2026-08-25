import { describe, expect, it } from "vitest";

import { placeMapLabels, truncateTitle, type LabelAnchor } from "./siteMapLabels";

const anchorsFrom = (points: [number, number, number][]) =>
  new Map<number, LabelAnchor>(
    points.map(([articleId, x, y]) => [articleId, { radius: 6, x, y }]),
  );

const FRAME = { height: 600, width: 900 };

describe("placeMapLabels", () => {
  it("names pages up to the caller's budget and no further", () => {
    const anchors = anchorsFrom([
      [1, 300, 120],
      [2, 300, 260],
      [3, 300, 400],
    ]);
    const candidates = [1, 2, 3].map((articleId) => ({ articleId, text: "Page " + articleId }));

    expect(placeMapLabels({ anchors, candidates, limit: 2, ...FRAME })).toHaveLength(2);
    expect(placeMapLabels({ anchors, candidates, limit: 0, ...FRAME })).toHaveLength(0);
  });

  it("keeps a forced title even where the budget is spent", () => {
    const anchors = anchorsFrom([
      [1, 300, 120],
      [2, 300, 300],
    ]);
    const placed = placeMapLabels({
      anchors,
      candidates: [
        { articleId: 1, text: "Ordinary page" },
        { articleId: 2, forced: true, text: "Selected page" },
      ],
      limit: 0,
      ...FRAME,
    });

    expect(placed.map((label) => label.articleId)).toEqual([2]);
  });

  it("drops a title rather than letting two plates overlap", () => {
    // Two pages a few pixels apart: only one title can sit beside them without
    // covering the other, and the ranking decides which.
    const anchors = anchorsFrom([
      [1, 450, 300],
      [2, 452, 302],
    ]);
    const placed = placeMapLabels({
      anchors,
      candidates: [
        { articleId: 1, text: "A very long article title indeed" },
        { articleId: 2, text: "Another very long article title" },
      ],
      limit: 8,
      ...FRAME,
    });

    expect(placed[0].articleId).toBe(1);
    placed.slice(1).forEach((label) => {
      const first = placed[0].plate;
      const overlapping =
        label.plate.x < first.x + first.width &&
        label.plate.x + label.plate.width > first.x &&
        label.plate.y < first.y + first.height &&
        label.plate.y + label.plate.height > first.y;
      expect(overlapping).toBe(false);
    });
  });

  it("never places a plate outside the frame", () => {
    const anchors = anchorsFrom([
      [1, 8, 8],
      [2, 892, 592],
    ]);
    const placed = placeMapLabels({
      anchors,
      candidates: [
        { articleId: 1, text: "Top left corner page" },
        { articleId: 2, text: "Bottom right corner page" },
      ],
      limit: 8,
      ...FRAME,
    });

    placed.forEach((label) => {
      expect(label.plate.x).toBeGreaterThanOrEqual(0);
      expect(label.plate.y).toBeGreaterThanOrEqual(0);
      expect(label.plate.x + label.plate.width).toBeLessThanOrEqual(FRAME.width);
      expect(label.plate.y + label.plate.height).toBeLessThanOrEqual(FRAME.height);
    });
  });

  it("skips a page that is not on screen at all", () => {
    const placed = placeMapLabels({
      anchors: anchorsFrom([[1, 300, 300]]),
      candidates: [
        { articleId: 1, text: "On screen" },
        { articleId: 99, text: "Off screen" },
      ],
      limit: 8,
      ...FRAME,
    });

    expect(placed.map((label) => label.articleId)).toEqual([1]);
  });

  it("shortens a long title instead of widening its plate", () => {
    expect(truncateTitle("How to Hide Your Internet Browsing From Anyone")).toBe(
      "How to Hide Your Internet Bro…",
    );
    expect(truncateTitle("Short enough")).toBe("Short enough");
  });
});

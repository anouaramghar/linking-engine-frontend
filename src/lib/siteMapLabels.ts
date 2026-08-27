/**
 * Where the page titles go on the site map, and which titles are drawn at all.
 *
 * Titles are the reason a network map stops being readable: a title is ten to
 * twenty times wider than the marker it names, so a map that names every page
 * is a map made of text with a few squares behind it. The rules here are what
 * keep the topology in front:
 *
 *  1. Placement happens in screen pixels, not in map units, because collision
 *     is a screen fact. A pair that clears at one zoom overlaps at another.
 *  2. A title is only drawn where it fits beside its own marker without
 *     covering another marker or another title. There is no "best effort"
 *     placement — an unplaceable title is dropped, and the caller's ranking
 *     decides who keeps the space.
 *  3. Every title carries a plate, so the words never sit directly on a link
 *     line. The plate is part of the collision box.
 */

export interface LabelCandidate {
  articleId: number;
  text: string;
  /** Drawn even where the zoom level has switched ordinary titles off. */
  forced?: boolean;
}

export interface LabelAnchor {
  x: number;
  y: number;
  /** Screen radius of the marker, so a plate never lands on top of one. */
  radius: number;
}

export interface PlacedLabel {
  articleId: number;
  text: string;
  textX: number;
  textY: number;
  plate: { height: number; width: number; x: number; y: number };
  /** Marker edge to plate edge, so an offset title still names its own page. */
  connector: { x1: number; x2: number; y1: number; y2: number };
}

interface Box {
  bottom: number;
  left: number;
  right: number;
  top: number;
}

const PLATE_HEIGHT = 22;
const PLATE_PADDING = 8;
const CONNECTOR_LENGTH = 10;
const EDGE_MARGIN = 6;
const BOX_GAP = 5;
/** Inter at 12px/500, averaged over mixed-case titles. */
const CHARACTER_WIDTH = 6.45;
/** Tried in order: beside the marker first, then stepped away from it. */
const VERTICAL_OFFSETS = [0, -20, 20, -40, 40, -62, 62];

const overlaps = (left: Box, right: Box) =>
  left.left < right.right + BOX_GAP &&
  left.right > right.left - BOX_GAP &&
  left.top < right.bottom + BOX_GAP &&
  left.bottom > right.top - BOX_GAP;

export const truncateTitle = (title: string, limit = 30) =>
  title.length > limit ? title.slice(0, limit - 1).trimEnd() + "…" : title;

export const placeMapLabels = ({
  anchors,
  candidates,
  height,
  limit,
  width,
}: {
  anchors: Map<number, LabelAnchor>;
  /** Already ranked: the first candidate that fits wins the space. */
  candidates: LabelCandidate[];
  height: number;
  limit: number;
  width: number;
}): PlacedLabel[] => {
  const placed: PlacedLabel[] = [];
  if (width <= 0 || height <= 0) return placed;

  const markerBoxes = [...anchors.entries()].map(([articleId, anchor]) => ({
    articleId,
    box: {
      bottom: anchor.y + anchor.radius,
      left: anchor.x - anchor.radius,
      right: anchor.x + anchor.radius,
      top: anchor.y - anchor.radius,
    },
  }));
  const plateBoxes: Box[] = [];

  candidates.forEach((candidate) => {
    if (placed.length >= limit && !candidate.forced) return;
    const anchor = anchors.get(candidate.articleId);
    if (anchor === undefined) return;

    const plateWidth = candidate.text.length * CHARACTER_WIDTH + PLATE_PADDING * 2;
    // Outward from the middle of the frame. The map's subject sits in the
    // centre, so titles that read away from it cover markers instead of the
    // topology — and the fallback side keeps a title that would leave the frame.
    const outward: "left" | "right" = anchor.x < width / 2 ? "left" : "right";
    const sides: ("left" | "right")[] = [outward, outward === "right" ? "left" : "right"];

    for (const side of sides) {
      for (const offset of VERTICAL_OFFSETS) {
        const gap = anchor.radius + CONNECTOR_LENGTH;
        const plateX = side === "right" ? anchor.x + gap : anchor.x - gap - plateWidth;
        const plateY = anchor.y + offset - PLATE_HEIGHT / 2;
        const box: Box = {
          bottom: plateY + PLATE_HEIGHT,
          left: plateX,
          right: plateX + plateWidth,
          top: plateY,
        };
        if (
          box.left < EDGE_MARGIN ||
          box.right > width - EDGE_MARGIN ||
          box.top < EDGE_MARGIN ||
          box.bottom > height - EDGE_MARGIN
        ) {
          continue;
        }
        if (plateBoxes.some((other) => overlaps(box, other))) continue;
        if (
          markerBoxes.some(
            (marker) => marker.articleId !== candidate.articleId && overlaps(box, marker.box),
          )
        ) {
          continue;
        }

        plateBoxes.push(box);
        placed.push({
          articleId: candidate.articleId,
          text: candidate.text,
          textX: plateX + PLATE_PADDING,
          textY: plateY + PLATE_HEIGHT / 2 + 4,
          plate: { height: PLATE_HEIGHT, width: plateWidth, x: plateX, y: plateY },
          connector: {
            x1: side === "right" ? anchor.x + anchor.radius : anchor.x - anchor.radius,
            x2: side === "right" ? plateX : plateX + plateWidth,
            y1: anchor.y,
            y2: plateY + PLATE_HEIGHT / 2,
          },
        });
        return;
      }
    }
  });

  return placed;
};

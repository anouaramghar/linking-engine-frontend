import type { GraphFeature, GraphNetworkEdge } from "../types/graph";

/**
 * Where every page of a site sits on the overview map.
 *
 * The map is one composition rather than two stacked panels: the pages that
 * carry an internal link — active or prepared — settle into the middle as the
 * site's linked core, and the pages that carry none are scattered around them
 * as a halo. That is the shape of the editorial problem the screen exists to
 * show: a centre that holds together, and a rim that is not attached to it yet.
 *
 * The coordinate system has its origin at the centre of the map and no fixed
 * extent, because the frame is chosen by the viewer (see `GraphLens`), not by
 * the layout. Positions are deterministic for a given snapshot: the same site
 * must not rearrange itself between two renders of the same data, or an editor
 * would lose the page they were looking at every time they filtered.
 */

export interface MapPoint {
  x: number;
  y: number;
}

export interface SiteMapLayout {
  positions: Map<number, MapPoint>;
  /** Pages holding at least one active or prepared internal link. */
  coreIds: Set<number>;
  /** Pages holding none, drawn around the core. */
  haloIds: Set<number>;
  /** Radius of the linked core, including its margin. */
  coreRadius: number;
  /** Where the halo begins — the gap that makes the core read as a centre. */
  haloInnerRadius: number;
  /** What the default frame shows: the core, or the whole site when nothing links. */
  focusRadius: number;
  /** Everything, including the outermost isolated page. */
  worldRadius: number;
}

const GOLDEN_ANGLE = 2.399963;
const CLUSTER_NODE_SPACE = 30;
const CLUSTER_GAP = 56;
const MIN_CLUSTER_RADIUS = 54;
const MAX_CLUSTER_RADIUS = 460;
const CORE_MARGIN = 56;
const MIN_CORE_RADIUS = 150;
/** The empty ring between the core and the halo. It is the reveal. */
const HALO_GAP = 132;
/** Nominal spacing between two isolated pages; sets how wide the halo grows. */
const HALO_PITCH = 40;
const WORLD_MARGIN = 96;
/**
 * Pairwise repulsion is O(n²). A deterministic seed is preferable to freezing
 * the publication review on a large site, and the seed alone already separates
 * clusters — relaxation only sharpens the topology inside them.
 */
const MAX_FORCE_LAYOUT_NODES = 400;
const RELAX_ITERATIONS = 26;

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

/** Deterministic pseudo-random in [0, 1) — the same page always jitters alike. */
const seeded = (value: number) => {
  const result = Math.sin(value * 12.9898 + 78.233) * 43758.5453;
  return result - Math.floor(result);
};

/** Union-find over the edge list: which pages hang together at all. */
const connectedComponents = (nodes: GraphFeature[], edges: GraphNetworkEdge[]): number[][] => {
  const indexById = new Map(nodes.map((node, index) => [node.article_id, index]));
  const parent = nodes.map((_, index) => index);
  const find = (index: number) => {
    let root = index;
    while (parent[root] !== root) root = parent[root];
    let cursor = index;
    while (parent[cursor] !== root) {
      const next = parent[cursor];
      parent[cursor] = root;
      cursor = next;
    }
    return root;
  };

  edges.forEach((edge) => {
    const source = indexById.get(edge.source_article_id);
    const target = indexById.get(edge.target_article_id);
    if (source === undefined || target === undefined) return;
    const sourceRoot = find(source);
    const targetRoot = find(target);
    if (sourceRoot !== targetRoot) parent[sourceRoot] = targetRoot;
  });

  const components = new Map<number, number[]>();
  nodes.forEach((_, index) => {
    const root = find(index);
    const found = components.get(root);
    if (found) found.push(index);
    else components.set(root, [index]);
  });
  return [...components.values()].sort((left, right) => right.length - left.length);
};

/**
 * Clusters are laid out around the origin, biggest first.
 *
 * A sunflower spiral gives each cluster a starting radius that already keeps
 * most of them apart; the loop after it only pushes out the few that still
 * overlap. Placing the largest cluster at the origin is what makes the middle
 * of the map the site's main body rather than whichever cluster was first in
 * the response.
 */
const placeClusters = (radii: number[]): MapPoint[] => {
  const centers: MapPoint[] = [];
  if (radii.length === 0) return centers;

  const averageRadius = radii.reduce((total, radius) => total + radius, 0) / radii.length;
  const pitch = (averageRadius * 2 + CLUSTER_GAP) * 0.72;

  radii.forEach((radius, index) => {
    if (index === 0) {
      centers.push({ x: 0, y: 0 });
      return;
    }
    const angle = index * GOLDEN_ANGLE;
    let distance = Math.max(radii[0] + radius + CLUSTER_GAP, Math.sqrt(index) * pitch);
    let candidate = { x: Math.cos(angle) * distance, y: Math.sin(angle) * distance };
    for (let attempt = 0; attempt < 240; attempt += 1) {
      const collides = centers.some(
        (other, otherIndex) =>
          Math.hypot(other.x - candidate.x, other.y - candidate.y) <
          radii[otherIndex] + radius + CLUSTER_GAP,
      );
      if (!collides) break;
      distance += CLUSTER_GAP * 0.6;
      candidate = { x: Math.cos(angle) * distance, y: Math.sin(angle) * distance };
    }
    centers.push(candidate);
  });

  return centers;
};

export const layoutSiteMap = (
  nodes: GraphFeature[],
  edges: GraphNetworkEdge[],
): SiteMapLayout => {
  const positions = new Map<number, MapPoint>();
  const coreIds = new Set<number>();
  const haloIds = new Set<number>();

  if (nodes.length === 0) {
    return {
      positions,
      coreIds,
      haloIds,
      coreRadius: MIN_CORE_RADIUS,
      haloInnerRadius: MIN_CORE_RADIUS,
      focusRadius: MIN_CORE_RADIUS,
      worldRadius: MIN_CORE_RADIUS,
    };
  }

  const components = connectedComponents(nodes, edges);
  const clusters = components.filter((component) => component.length > 1);
  const isolated = components
    .filter((component) => component.length === 1)
    .map((component) => component[0]);

  const clusterRadii = clusters.map((cluster) =>
    clamp(Math.sqrt(cluster.length) * CLUSTER_NODE_SPACE, MIN_CLUSTER_RADIUS, MAX_CLUSTER_RADIUS),
  );
  const clusterCenters = placeClusters(clusterRadii);

  // Seed: a phyllotaxis disc per cluster, jittered so two clusters of the same
  // size are not visually identical stamps.
  const members: { bound: number; center: MapPoint; index: number; point: MapPoint }[] = [];
  clusters.forEach((cluster, clusterIndex) => {
    const center = clusterCenters[clusterIndex];
    const radius = clusterRadii[clusterIndex];
    cluster.forEach((nodeIndex, memberIndex) => {
      const articleId = nodes[nodeIndex].article_id;
      const angle = memberIndex * GOLDEN_ANGLE + seeded(articleId) * 0.7;
      const spread = Math.sqrt((memberIndex + 0.55) / cluster.length) * radius;
      members.push({
        bound: radius * 1.28,
        center,
        index: nodeIndex,
        point: {
          x: center.x + Math.cos(angle) * spread,
          y: center.y + Math.sin(angle) * spread,
        },
      });
    });
  });

  const orderByIndex = new Map(members.map(({ index }, order) => [index, order]));
  const indexById = new Map(nodes.map((node, index) => [node.article_id, index]));
  const springs = edges.flatMap((edge) => {
    const source = orderByIndex.get(indexById.get(edge.source_article_id) ?? -1);
    const target = orderByIndex.get(indexById.get(edge.target_article_id) ?? -1);
    return source === undefined || target === undefined ? [] : [[source, target] as const];
  });

  const memberCount = members.length;
  const iterations = memberCount > MAX_FORCE_LAYOUT_NODES ? 0 : RELAX_ITERATIONS;

  for (let iteration = 0; iteration < iterations && memberCount > 1; iteration += 1) {
    const forceX = new Float64Array(memberCount);
    const forceY = new Float64Array(memberCount);

    for (let sourceIndex = 0; sourceIndex < memberCount; sourceIndex += 1) {
      for (let targetIndex = sourceIndex + 1; targetIndex < memberCount; targetIndex += 1) {
        const source = members[sourceIndex].point;
        const target = members[targetIndex].point;
        const differenceX = source.x - target.x;
        const differenceY = source.y - target.y;
        const distance = Math.max(Math.hypot(differenceX, differenceY), 0.001);
        const repulsion = Math.min(4.2, 5400 / (distance * distance));
        const pushX = (differenceX / distance) * repulsion;
        const pushY = (differenceY / distance) * repulsion;
        forceX[sourceIndex] += pushX;
        forceY[sourceIndex] += pushY;
        forceX[targetIndex] -= pushX;
        forceY[targetIndex] -= pushY;
      }
    }

    springs.forEach(([sourceIndex, targetIndex]) => {
      const source = members[sourceIndex].point;
      const target = members[targetIndex].point;
      const differenceX = target.x - source.x;
      const differenceY = target.y - source.y;
      const distance = Math.max(Math.hypot(differenceX, differenceY), 0.001);
      const attraction = clamp((distance - 74) * 0.008, -1.8, 2.2);
      const pullX = (differenceX / distance) * attraction;
      const pullY = (differenceY / distance) * attraction;
      forceX[sourceIndex] += pullX;
      forceY[sourceIndex] += pullY;
      forceX[targetIndex] -= pullX;
      forceY[targetIndex] -= pullY;
    });

    members.forEach(({ bound, center, point }, index) => {
      const gravity = 0.006 + iteration * 0.0004;
      const nextX = point.x + (forceX[index] + (center.x - point.x) * gravity) * 0.72;
      const nextY = point.y + (forceY[index] + (center.y - point.y) * gravity) * 0.72;
      // Held inside its own disc: a node that drifts into a neighbouring
      // cluster reads as a link that is not there.
      const offsetX = nextX - center.x;
      const offsetY = nextY - center.y;
      const distance = Math.hypot(offsetX, offsetY);
      const ratio = distance > bound ? bound / distance : 1;
      point.x = center.x + offsetX * ratio;
      point.y = center.y + offsetY * ratio;
    });
  }

  let reach = 0;
  members.forEach(({ index, point }) => {
    const articleId = nodes[index].article_id;
    positions.set(articleId, point);
    coreIds.add(articleId);
    reach = Math.max(reach, Math.hypot(point.x, point.y));
  });

  const coreRadius = coreIds.size > 0 ? Math.max(reach + CORE_MARGIN, MIN_CORE_RADIUS) : 0;
  const haloInnerRadius = coreRadius + (coreIds.size > 0 ? HALO_GAP : 0);

  // The halo is scattered, not tiled: equal-area radii keep its density even as
  // it grows, and the golden angle plus a per-page jitter keeps it from reading
  // as a pattern. Isolated pages have no structure to express, so the only
  // honest thing the arrangement can say is "many, and none of them attached".
  const outerRadius =
    isolated.length > 0
      ? Math.sqrt(
          haloInnerRadius * haloInnerRadius + (isolated.length * HALO_PITCH * HALO_PITCH) / Math.PI,
        )
      : haloInnerRadius;

  isolated.forEach((nodeIndex, order) => {
    const articleId = nodes[nodeIndex].article_id;
    const angle = order * GOLDEN_ANGLE + (seeded(articleId) - 0.5) * 0.6;
    const share = (order + 0.3 + seeded(articleId + 7919) * 0.55) / isolated.length;
    const radius = Math.sqrt(
      haloInnerRadius * haloInnerRadius +
        clamp(share, 0, 1) * (outerRadius * outerRadius - haloInnerRadius * haloInnerRadius),
    );
    positions.set(articleId, { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
    haloIds.add(articleId);
  });

  const focusRadius = coreIds.size > 0 ? coreRadius : Math.max(outerRadius, MIN_CORE_RADIUS);

  return {
    positions,
    coreIds,
    haloIds,
    coreRadius,
    haloInnerRadius,
    focusRadius,
    worldRadius: Math.max(outerRadius + WORLD_MARGIN, focusRadius + WORLD_MARGIN),
  };
};

import { useMemo, useState } from "react";

import type { GraphFeature, GraphNetwork, GraphNetworkEdge } from "../../types/graph";

type NetworkFilter = "all" | "orphan" | "underlinked" | "hub" | "saturated";
type NodeStatus = Exclude<NetworkFilter, "all"> | "connected";

interface Props {
  data: GraphNetwork;
}

interface Position {
  x: number;
  y: number;
}

interface LayoutBand {
  count: number;
  rows: number;
  top: number;
}

interface LayoutResult {
  band: LayoutBand | null;
  height: number;
  linked: Set<number>;
  positions: Map<number, Position>;
}

const NETWORK_WIDTH = 1280;
const MAX_NETWORK_HEIGHT = 1200;
const MAP_PADDING = 48;
const MAX_MAP_LABELS = 18;
const CLUSTER_NODE_SPACE = 34;
const CLUSTER_GAP = 56;
const BAND_PITCH = 26;
const BAND_GAP = 72;
const MAX_FORCE_LAYOUT_NODES = 400;

const STATUS_LABEL: Record<NodeStatus, string> = {
  orphan: "Orphan",
  underlinked: "Underlinked",
  hub: "Hub",
  saturated: "Saturated",
  connected: "Connected",
};

const STATUS_DESCRIPTION: Record<NodeStatus, string> = {
  orphan: "No incoming links",
  underlinked: "Few incoming links",
  hub: "Many outgoing links",
  saturated: "Many incoming links",
  connected: "No flagged condition",
};

const STATUS_COLOR: Record<NodeStatus, string> = {
  orphan: "rgb(var(--c-error-ink))",
  underlinked: "rgb(var(--c-selection))",
  hub: "rgb(var(--c-success))",
  saturated: "rgb(var(--c-graph-saturated))",
  connected: "rgb(var(--c-hairline-control))",
};

const STATUS_FILL: Record<NodeStatus, string> = {
  orphan: "rgb(var(--c-tint-negative))",
  underlinked: "rgb(var(--c-tint-active))",
  hub: "rgb(var(--c-tint-positive))",
  saturated: "rgb(var(--c-tint-progress))",
  connected: "rgb(var(--c-surface-card))",
};

const LEGEND_STATUSES: NodeStatus[] = ["orphan", "underlinked", "hub", "saturated", "connected"];

const snapshotLabel = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Current graph snapshot";
  return (
    "Snapshot " +
    new Intl.DateTimeFormat(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date)
  );
};

const nodeStatus = (node: GraphFeature): NodeStatus => {
  if (node.orphan) return "orphan";
  if (node.underlinked) return "underlinked";
  if (node.hub) return "hub";
  if (node.saturated) return "saturated";
  return "connected";
};

const matchesFilter = (node: GraphFeature, filter: NetworkFilter) => {
  if (filter === "all") return true;
  return node[filter];
};

const matchesQuery = (node: GraphFeature, normalizedQuery: string) =>
  normalizedQuery.length === 0 ||
  node.article_title.toLocaleLowerCase().includes(normalizedQuery) ||
  node.article_url.toLocaleLowerCase().includes(normalizedQuery);

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

const seeded = (value: number) => {
  const result = Math.sin(value * 12.9898 + 78.233) * 43758.5453;
  return result - Math.floor(result);
};

const shortTitle = (title: string) => (title.length > 34 ? title.slice(0, 31) + "…" : title);

const edgeKey = (sourceArticleId: number, targetArticleId: number) =>
  sourceArticleId + ":" + targetArticleId;

const nodeDegree = (node: GraphFeature) => node.in_degree + node.out_degree;

/**
 * Pages that link to each other become clusters; pages with no internal link
 * become a compact band below them. One shared lattice for every page made a
 * sparse site look like wallpaper instead of a network.
 */
const connectedGroups = (nodes: GraphFeature[], edges: GraphNetworkEdge[]): number[][] => {
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

  const groups = new Map<number, number[]>();
  nodes.forEach((_, index) => {
    const root = find(index);
    const group = groups.get(root);
    if (group) group.push(index);
    else groups.set(root, [index]);
  });
  return [...groups.values()].sort((left, right) => right.length - left.length);
};

/** Row packing gives each cluster its own disc, largest cluster first. */
const packClusters = (sizes: number[]) => {
  const usableWidth = NETWORK_WIDTH - MAP_PADDING * 2;
  const radii = sizes.map((size) =>
    clamp(Math.sqrt(size) * CLUSTER_NODE_SPACE, 46, usableWidth / 2),
  );
  const centers: Position[] = [];
  let rowStart = 0;
  let rowTop = MAP_PADDING;
  let rowHeight = 0;
  let cursorX = MAP_PADDING;

  // Each finished row moves to the middle of the map, so one large cluster
  // does not sit against the left edge with the rest of the width empty.
  const centerRow = (endIndex: number, width: number) => {
    const shift = (usableWidth - width) / 2;
    for (let index = rowStart; index < endIndex; index += 1) centers[index].x += shift;
  };

  radii.forEach((radius) => {
    const span = radius * 2 + CLUSTER_GAP;
    if (cursorX > MAP_PADDING && cursorX - MAP_PADDING + span > usableWidth) {
      centerRow(centers.length, cursorX - MAP_PADDING - CLUSTER_GAP);
      rowStart = centers.length;
      rowTop += rowHeight;
      rowHeight = 0;
      cursorX = MAP_PADDING;
    }
    centers.push({ x: cursorX + radius, y: rowTop + radius });
    cursorX += span;
    rowHeight = Math.max(rowHeight, span);
  });
  centerRow(centers.length, cursorX - MAP_PADDING - CLUSTER_GAP);

  return { centers, height: rowTop + rowHeight - CLUSTER_GAP / 2 + MAP_PADDING, radii };
};

const layoutFullNodes = (nodes: GraphFeature[], edges: GraphNetworkEdge[]): LayoutResult => {
  const positions = new Map<number, Position>();
  const linked = new Set<number>();
  if (nodes.length === 0) return { band: null, height: 320, linked, positions };

  const groups = connectedGroups(nodes, edges);
  const clusters = groups.filter((group) => group.length > 1);
  const isolated = groups.filter((group) => group.length === 1).map((group) => group[0]);

  // Clusters get a golden-angle seed, then a short relaxation pass for topology.
  const pack = packClusters(clusters.map((cluster) => cluster.length));
  const clusterHeight = clusters.length > 0 ? Math.min(pack.height, MAX_NETWORK_HEIGHT) : 0;
  const clusterNodes: { center: Position; index: number; point: Position }[] = [];

  clusters.forEach((cluster, clusterIndex) => {
    const center = pack.centers[clusterIndex];
    const radius = pack.radii[clusterIndex];
    cluster.forEach((nodeIndex, memberIndex) => {
      const angle = memberIndex * 2.399963 + seeded(nodes[nodeIndex].article_id) * 0.6;
      const spread = Math.sqrt((memberIndex + 0.55) / cluster.length) * radius;
      clusterNodes.push({
        center,
        index: nodeIndex,
        point: {
          x: clamp(center.x + Math.cos(angle) * spread, MAP_PADDING, NETWORK_WIDTH - MAP_PADDING),
          y: clamp(center.y + Math.sin(angle) * spread, MAP_PADDING, clusterHeight - MAP_PADDING),
        },
      });
    });
  });

  const clusterCount = clusterNodes.length;
  const orderByIndex = new Map(clusterNodes.map(({ index }, order) => [index, order]));
  const indexById = new Map(nodes.map((node, index) => [node.article_id, index]));
  const springs = edges.flatMap((edge) => {
    const source = orderByIndex.get(indexById.get(edge.source_article_id) ?? -1);
    const target = orderByIndex.get(indexById.get(edge.target_article_id) ?? -1);
    return source === undefined || target === undefined ? [] : [[source, target] as const];
  });
  // Pairwise repulsion is O(n²). A deterministic cluster seed is preferable
  // to freezing the publication review on a large site, and still keeps every
  // page and link visible for search/filter inspection.
  const iterations = clusterCount > MAX_FORCE_LAYOUT_NODES ? 0 : 22;

  for (let iteration = 0; iteration < iterations && clusterCount > 1; iteration += 1) {
    const forceX = new Float64Array(clusterCount);
    const forceY = new Float64Array(clusterCount);

    for (let sourceIndex = 0; sourceIndex < clusterCount; sourceIndex += 1) {
      for (let targetIndex = sourceIndex + 1; targetIndex < clusterCount; targetIndex += 1) {
        const source = clusterNodes[sourceIndex].point;
        const target = clusterNodes[targetIndex].point;
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
      const source = clusterNodes[sourceIndex].point;
      const target = clusterNodes[targetIndex].point;
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

    clusterNodes.forEach(({ center, point }, index) => {
      const gravity = 0.006 + iteration * 0.0004;
      forceX[index] += (center.x - point.x) * gravity;
      forceY[index] += (center.y - point.y) * gravity;
      point.x = clamp(point.x + forceX[index] * 0.72, MAP_PADDING, NETWORK_WIDTH - MAP_PADDING);
      point.y = clamp(point.y + forceY[index] * 0.72, MAP_PADDING, clusterHeight - MAP_PADDING);
    });
  }

  clusterNodes.forEach(({ index, point }) => {
    positions.set(nodes[index].article_id, point);
    linked.add(nodes[index].article_id);
  });

  // Unlinked pages sit in one tidy block, so the map never invents a topology.
  let band: LayoutBand | null = null;
  if (isolated.length > 0) {
    const maxColumns = Math.floor((NETWORK_WIDTH - MAP_PADDING * 2) / BAND_PITCH);
    const columns = clamp(Math.round(Math.sqrt(isolated.length * 4)), 1, maxColumns);
    const rows = Math.ceil(isolated.length / columns);
    const top = clusterHeight > 0 ? clusterHeight + BAND_GAP : MAP_PADDING + 24;
    isolated.forEach((nodeIndex, order) => {
      positions.set(nodes[nodeIndex].article_id, {
        x: MAP_PADDING + (order % columns) * BAND_PITCH,
        y: top + Math.floor(order / columns) * BAND_PITCH,
      });
    });
    band = { count: isolated.length, rows, top };
  }

  const bandBottom = band === null ? 0 : band.top + (band.rows - 1) * BAND_PITCH + MAP_PADDING;
  const height = clamp(Math.round(Math.max(clusterHeight, bandBottom)), 260, MAX_NETWORK_HEIGHT);

  return { band, height, linked, positions };
};


function SignalButton({
  active,
  color,
  count,
  description,
  label,
  onClick,
}: {
  active: boolean;
  color: string;
  count: number;
  description: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={label + ": " + count + ". " + description}
      onClick={onClick}
      className={
        "inline-flex min-h-10 items-center gap-2 rounded-pill border px-3 py-2 text-left transition-[background-color,border-color,box-shadow] duration-state ease-settle " +
        (active
          ? "border-ink bg-surface-card shadow-soft"
          : "border-hairline bg-canvas-soft hover:border-hairline-strong hover:bg-surface-card")
      }
    >
      <span
        aria-hidden="true"
        className="h-2 w-2 flex-none rounded-full"
        style={{ backgroundColor: color }}
      />
      <span className="text-caption font-medium text-ink">{label}</span>
      <span className="text-body-sm tabular-nums text-muted">{count.toLocaleString()}</span>
    </button>
  );
}

function ZoomIcon({ mode }: { mode: "in" | "out" }) {
  return (
    <svg aria-hidden="true" className="h-4 w-4" viewBox="0 0 24 24" fill="none">
      <path d="M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      {mode === "in" && (
        <path d="M12 5v14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      )}
    </svg>
  );
}

function ResetZoomIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-4 w-4"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 5v6h6" />
      <path d="M4.7 11A8 8 0 1 1 7 16.7" />
    </svg>
  );
}

function SignalLegend() {
  return (
    <details className="mt-3 rounded-lg border border-hairline bg-canvas-soft px-3 py-2">
      <summary className="cursor-pointer text-caption font-medium text-ink">Map key</summary>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {LEGEND_STATUSES.map((status) => (
          <div key={status} className="flex items-start gap-2">
            <span
              aria-hidden="true"
              className="mt-1.5 h-2.5 w-2.5 flex-none rounded-sm border"
              style={{ backgroundColor: STATUS_FILL[status], borderColor: STATUS_COLOR[status] }}
            />
            <div className="min-w-0">
              <div className="text-caption font-medium text-ink">{STATUS_LABEL[status]}</div>
              <div className="text-caption-sm text-muted">{STATUS_DESCRIPTION[status]}</div>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-caption-sm text-muted">
        Every square is a page. Lines show internal links; arrowheads show their direction. Linked
        pages group into clusters. Pages with no internal link stay in the block below the clusters.
      </p>
    </details>
  );
}

export default function GraphLens({ data }: Props) {
  const [filter, setFilter] = useState<NetworkFilter>("all");
  const [query, setQuery] = useState("");
  const [selectedArticleId, setSelectedArticleId] = useState<number | null>(null);
  const [showDirection, setShowDirection] = useState(true);
  const [zoom, setZoom] = useState(1);

  const nodeById = useMemo(
    () => new Map(data.nodes.map((node) => [node.article_id, node])),
    [data.nodes],
  );
  const layout = useMemo(() => layoutFullNodes(data.nodes, data.edges), [data.nodes, data.edges]);
  const selectedNode = selectedArticleId === null ? undefined : nodeById.get(selectedArticleId);
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const matchingNodes = useMemo(
    () =>
      data.nodes
        .filter((node) => matchesQuery(node, normalizedQuery))
        .sort((left, right) => nodeDegree(right) - nodeDegree(left)),
    [data.nodes, normalizedQuery],
  );
  const matchingNodeIds = useMemo(
    () => new Set(matchingNodes.map((node) => node.article_id)),
    [matchingNodes],
  );
  const highlightNodeIds = useMemo(
    () =>
      new Set(
        matchingNodes.filter((node) => matchesFilter(node, filter)).map((node) => node.article_id),
      ),
    [filter, matchingNodes],
  );
  const labelIds = useMemo(() => {
    const ids = new Set<number>();
    const add = (articleId: number) => {
      if (ids.size < MAX_MAP_LABELS) ids.add(articleId);
    };

    if (selectedArticleId !== null) add(selectedArticleId);
    if (normalizedQuery.length > 0 || filter !== "all") {
      matchingNodes
        .filter((node) => matchesFilter(node, filter))
        .forEach((node) => add(node.article_id));
    } else {
      // A small cluster stays legible on a large site, so name those pages even
      // when the band below holds hundreds of unlinked ones.
      const pool =
        layout.linked.size > 0 && layout.linked.size <= 32
          ? data.nodes.filter((node) => layout.linked.has(node.article_id))
          : data.nodes.length <= 32
            ? data.nodes.slice()
            : [];
      pool
        .sort((left, right) => nodeDegree(right) - nodeDegree(left))
        .forEach((node) => add(node.article_id));
    }
    return ids;
  }, [data.nodes, filter, layout.linked, matchingNodes, normalizedQuery, selectedArticleId]);
  const selectedConnections = useMemo(() => {
    if (selectedArticleId === null) return { incoming: [], outgoing: [] };
    const incoming = data.edges
      .filter((edge) => edge.target_article_id === selectedArticleId)
      .map((edge) => nodeById.get(edge.source_article_id))
      .filter((node): node is GraphFeature => node !== undefined);
    const outgoing = data.edges
      .filter((edge) => edge.source_article_id === selectedArticleId)
      .map((edge) => nodeById.get(edge.target_article_id))
      .filter((node): node is GraphFeature => node !== undefined);
    return { incoming, outgoing };
  }, [data.edges, nodeById, selectedArticleId]);
  const activeNode = (node: GraphFeature) =>
    matchesFilter(node, filter) && matchesQuery(node, normalizedQuery);
  const focusEdge = (edge: GraphNetworkEdge) =>
    selectedArticleId !== null &&
    (edge.source_article_id === selectedArticleId || edge.target_article_id === selectedArticleId);
  const highlightedEdge = (edge: GraphNetworkEdge) =>
    focusEdge(edge) ||
    (filter !== "all" &&
      (highlightNodeIds.has(edge.source_article_id) || highlightNodeIds.has(edge.target_article_id))) ||
    (normalizedQuery.length > 0 &&
      (matchingNodeIds.has(edge.source_article_id) || matchingNodeIds.has(edge.target_article_id)));

  const mapSummary =
    data.article_count.toLocaleString() +
    " pages and " +
    data.edge_count.toLocaleString() +
    " internal links. " +
    data.orphan_count.toLocaleString() +
    " orphans, " +
    data.underlinked_count.toLocaleString() +
    " underlinked pages, " +
    data.hub_count.toLocaleString() +
    " hubs, and " +
    data.saturated_count.toLocaleString() +
    " saturated pages.";

  return (
    <section
      aria-label="Site network"
      aria-describedby="site-network-description"
      className="mt-4 border-t border-hairline pt-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-title-md font-medium text-ink">Full site graph</h3>
          <p className="mt-1 max-w-3xl text-caption-sm leading-normal text-muted">
            See the whole active site as a connected system. Search or filter to bring important
            pages forward, then select a page to inspect its place in the network.
          </p>
        </div>
        <span className="flex-none text-caption-sm text-muted">{snapshotLabel(data.computed_at)}</span>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-y border-hairline py-3 text-caption-sm text-muted">
        <span>
          <strong className="font-medium text-ink">{data.article_count.toLocaleString()}</strong> pages
        </span>
        <span>
          <strong className="font-medium text-ink">{data.edge_count.toLocaleString()}</strong> internal links
        </span>
        <span>
          <strong className="font-medium text-error-ink">{data.orphan_count.toLocaleString()}</strong> orphans
        </span>
        <span>
          <strong className="font-medium text-success">{data.hub_count.toLocaleString()}</strong> hubs
        </span>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Network health filters">
          <SignalButton
            active={filter === "all"}
            color="rgb(var(--c-primary))"
            count={data.article_count}
            description="The full site"
            label="All pages"
            onClick={() => setFilter("all")}
          />
          <SignalButton
            active={filter === "orphan"}
            color={STATUS_COLOR.orphan}
            count={data.orphan_count}
            description={STATUS_DESCRIPTION.orphan}
            label="Orphans"
            onClick={() => setFilter("orphan")}
          />
          <SignalButton
            active={filter === "underlinked"}
            color={STATUS_COLOR.underlinked}
            count={data.underlinked_count}
            description={STATUS_DESCRIPTION.underlinked}
            label="Underlinked"
            onClick={() => setFilter("underlinked")}
          />
          <SignalButton
            active={filter === "hub"}
            color={STATUS_COLOR.hub}
            count={data.hub_count}
            description={STATUS_DESCRIPTION.hub}
            label="Hubs"
            onClick={() => setFilter("hub")}
          />
          <SignalButton
            active={filter === "saturated"}
            color={STATUS_COLOR.saturated}
            count={data.saturated_count}
            description={STATUS_DESCRIPTION.saturated}
            label="Saturated"
            onClick={() => setFilter("saturated")}
          />
        </div>

        <label className="w-full sm:w-filter">
          <span className="sr-only">Find a page</span>
          <input
            type="search"
            className="field"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Find a page…"
            aria-label="Find a page"
          />
        </label>
      </div>

      {normalizedQuery.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-2" aria-live="polite">
          <span className="text-caption-sm text-muted">
            {matchingNodes.length.toLocaleString()} {matchingNodes.length === 1 ? "page" : "pages"} match
          </span>
          {matchingNodes.slice(0, 6).map((node) => (
            <button
              key={node.article_id}
              type="button"
              className="btn btn-outline btn-sm max-w-full truncate"
              title={node.article_title}
              onClick={() => setSelectedArticleId(node.article_id)}
            >
              {shortTitle(node.article_title)}
            </button>
          ))}
        </div>
      )}

      <SignalLegend />

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-caption-sm text-muted">
        <span>
          {filter === "all" && normalizedQuery.length === 0
            ? "The map keeps every page visible; select a square to inspect it."
            : "Matching pages stay bright while the rest of the site recedes. Select a square to inspect it."}
        </span>
        <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Network view controls">
          <button
            type="button"
            className="btn btn-outline btn-sm"
            aria-pressed={showDirection}
            onClick={() => setShowDirection((current) => !current)}
          >
            {showDirection ? "Direction on" : "Direction off"}
          </button>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            aria-label="Zoom out"
            onClick={() => setZoom((current) => Math.max(0.75, Number((current - 0.25).toFixed(2))))}
          >
            <ZoomIcon mode="out" />
          </button>
          <span className="min-w-12 text-center tabular-nums">{Math.round(zoom * 100)}%</span>
          <button
            type="button"
            className="btn btn-outline btn-sm"
            aria-label="Zoom in"
            onClick={() => setZoom((current) => Math.min(1.75, Number((current + 0.25).toFixed(2))))}
          >
            <ZoomIcon mode="in" />
          </button>
          <button
            type="button"
            className="btn btn-outline btn-sm h-11 w-11 p-0 sm:h-8 sm:w-8"
            aria-label="Reset zoom"
            title="Reset zoom"
            onClick={() => setZoom(1)}
          >
            <ResetZoomIcon />
          </button>
        </div>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0 overflow-auto rounded-xl border border-hairline bg-canvas-soft p-3">
          {data.nodes.length > 0 ? (
            <svg
              role="group"
              aria-label="Full site network map"
              className="block"
              width={NETWORK_WIDTH * zoom}
              height={layout.height * zoom}
              viewBox={"0 0 " + NETWORK_WIDTH + " " + layout.height}
            >
              <title>Full site network map</title>
              <desc>{mapSummary}</desc>
              <defs>
                <marker
                  id="graph-lens-arrow-muted"
                  viewBox="0 0 10 10"
                  refX="8"
                  refY="5"
                  markerWidth="5"
                  markerHeight="5"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="rgb(var(--c-hairline-control))" />
                </marker>
                <marker
                  id="graph-lens-arrow-active"
                  viewBox="0 0 10 10"
                  refX="8"
                  refY="5"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="rgb(var(--c-primary))" />
                </marker>
              </defs>
              {layout.band && layout.band.top > MAP_PADDING + 24 && (
                <g aria-hidden="true">
                  <line
                    x1={MAP_PADDING}
                    y1={layout.band.top - 40}
                    x2={NETWORK_WIDTH - MAP_PADDING}
                    y2={layout.band.top - 40}
                    stroke="rgb(var(--c-hairline))"
                    strokeWidth="1"
                    vectorEffect="non-scaling-stroke"
                  />
                  <text
                    x={MAP_PADDING}
                    y={layout.band.top - 22}
                    fill="rgb(var(--c-muted))"
                    fontSize="12"
                    fontWeight="500"
                  >
                    {layout.band.count.toLocaleString() +
                      (layout.band.count === 1 ? " page with no" : " pages with no") +
                      " internal link"}
                  </text>
                </g>
              )}

              <g aria-label="Internal links">
                {data.edges.map((edge, index) => {
                  const source = layout.positions.get(edge.source_article_id);
                  const target = layout.positions.get(edge.target_article_id);
                  if (!source || !target) return null;
                  const active = highlightedEdge(edge);
                  const focused = focusEdge(edge);
                  const sourceNode = nodeById.get(edge.source_article_id);
                  const targetNode = nodeById.get(edge.target_article_id);
                  const dimmed =
                    (sourceNode ? !activeNode(sourceNode) : true) &&
                    (targetNode ? !activeNode(targetNode) : true);
                  return (
                    <line
                      key={edgeKey(edge.source_article_id, edge.target_article_id) + ":" + index}
                      x1={source.x}
                      y1={source.y}
                      x2={target.x}
                      y2={target.y}
                      stroke={focused ? "rgb(var(--c-primary))" : "rgb(var(--c-hairline-control))"}
                      strokeWidth={focused ? 2.2 : active ? 1.5 : 1}
                      strokeOpacity={focused ? 0.95 : dimmed ? 0.08 : active ? 0.7 : 0.45}
                      vectorEffect="non-scaling-stroke"
                      markerEnd={
                        showDirection
                          ? focused || active
                            ? "url(#graph-lens-arrow-active)"
                            : "url(#graph-lens-arrow-muted)"
                          : undefined
                      }
                    />
                  );
                })}
              </g>

              <g aria-label="Pages">
                {data.nodes.map((node) => {
                  const position = layout.positions.get(node.article_id);
                  if (!position) return null;
                  const status = nodeStatus(node);
                  const matching = activeNode(node);
                  const selected = node.article_id === selectedArticleId;
                  const size = clamp(7 + Math.log2(nodeDegree(node) + 1) * 1.8, 7, 15);
                  const showLabel = labelIds.has(node.article_id);
                  const labelOnRight = position.x < NETWORK_WIDTH - 250;
                  const detail =
                    STATUS_LABEL[status] +
                    ". " +
                    node.in_degree +
                    " incoming and " +
                    node.out_degree +
                    " outgoing links.";

                  return (
                    <g
                      key={node.article_id}
                      role="button"
                      tabIndex={0}
                      aria-pressed={selected}
                      aria-label={node.article_title + ". " + detail}
                      className="graph-node cursor-pointer"
                      opacity={matching ? 1 : 0.14}
                      onClick={() => setSelectedArticleId(node.article_id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setSelectedArticleId(node.article_id);
                        }
                      }}
                    >
                      <title>{node.article_title + " · " + detail}</title>
                      <rect
                        className="graph-node-focus"
                        x={position.x - size - 7}
                        y={position.y - size - 7}
                        width={(size + 7) * 2}
                        height={(size + 7) * 2}
                        rx="4"
                        fill="none"
                        stroke="rgb(var(--c-primary))"
                        strokeWidth="2"
                        opacity={selected ? 1 : 0}
                        pointerEvents="none"
                        vectorEffect="non-scaling-stroke"
                      />
                      <rect
                        x={position.x - size / 2}
                        y={position.y - size / 2}
                        width={size}
                        height={size}
                        rx="2"
                        fill={STATUS_FILL[status]}
                        stroke={STATUS_COLOR[status]}
                        strokeWidth={selected ? 2 : 1.5}
                        vectorEffect="non-scaling-stroke"
                      />
                      {showLabel && (
                        <text
                          x={labelOnRight ? position.x + 13 : position.x - 13}
                          y={position.y + 4}
                          textAnchor={labelOnRight ? "start" : "end"}
                          fill="rgb(var(--c-ink))"
                          fontSize="12"
                          fontWeight="500"
                          pointerEvents="none"
                          paintOrder="stroke"
                          stroke="rgb(var(--c-canvas-soft))"
                          strokeWidth="4"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          {shortTitle(node.article_title)}
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>
            </svg>
          ) : (
            <div className="flex min-h-80 items-center justify-center text-caption-sm text-muted">
              No active pages are available for this site.
            </div>
          )}
        </div>

        <aside
          aria-label="Selected page details"
          className="rounded-xl border border-hairline bg-surface-card px-4 py-4"
        >
          {selectedNode ? (
            <>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h4 className="text-body-sm font-medium text-ink">Page details</h4>
                  <p className="mt-2 break-words text-body-sm font-medium text-ink">
                    {selectedNode.article_title}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => setSelectedArticleId(null)}
                >
                  Clear
                </button>
              </div>
              <div className="mt-3 inline-flex rounded-pill bg-surface-strong px-2.5 py-1 text-caption-sm font-medium text-ink">
                {STATUS_LABEL[nodeStatus(selectedNode)]}
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 border-y border-hairline py-3 text-caption-sm">
                <div>
                  <dt className="text-muted">Incoming</dt>
                  <dd className="mt-1 text-body-sm font-medium tabular-nums text-ink">
                    {selectedNode.in_degree.toLocaleString()}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">Outgoing</dt>
                  <dd className="mt-1 text-body-sm font-medium tabular-nums text-ink">
                    {selectedNode.out_degree.toLocaleString()}
                  </dd>
                </div>
              </dl>
              <p className="mt-3 break-all text-caption-sm leading-normal text-muted">
                {selectedNode.article_url}
              </p>
              <div className="mt-4 space-y-3 text-caption-sm">
                <div>
                  <div className="font-medium text-ink">Links to</div>
                  {selectedConnections.outgoing.length > 0 ? (
                    <ul className="mt-1 space-y-1 text-muted">
                      {selectedConnections.outgoing.slice(0, 4).map((node) => (
                        <li key={node.article_id} className="truncate" title={node.article_title}>
                          {node.article_title}
                        </li>
                      ))}
                      {selectedConnections.outgoing.length > 4 && (
                        <li>+{selectedConnections.outgoing.length - 4} more</li>
                      )}
                    </ul>
                  ) : (
                    <p className="mt-1 text-muted">No outgoing links recorded.</p>
                  )}
                </div>
                <div>
                  <div className="font-medium text-ink">Linked from</div>
                  {selectedConnections.incoming.length > 0 ? (
                    <ul className="mt-1 space-y-1 text-muted">
                      {selectedConnections.incoming.slice(0, 4).map((node) => (
                        <li key={node.article_id} className="truncate" title={node.article_title}>
                          {node.article_title}
                        </li>
                      ))}
                      {selectedConnections.incoming.length > 4 && (
                        <li>+{selectedConnections.incoming.length - 4} more</li>
                      )}
                    </ul>
                  ) : (
                    <p className="mt-1 text-muted">No incoming links recorded.</p>
                  )}
                </div>
              </div>
            </>
          ) : (
            <>
              <h4 className="text-body-sm font-medium text-ink">Page details</h4>
              <p className="mt-2 text-caption-sm leading-normal text-muted">
                Select a square to inspect its structural signal, URL, and neighboring links.
              </p>
            </>
          )}
        </aside>
      </div>

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-caption-sm text-muted">
        <span>
          {normalizedQuery.length > 0
            ? "Showing search results across " + data.article_count.toLocaleString() + " pages."
            : "Labels stay limited on large sites so topology remains readable."}
        </span>
        {data.nodes.length > 250 && <span>Dense map mode: use search, filters, and zoom to focus.</span>}
      </div>

      {data.nodes.length > 0 && data.edges.length === 0 && (
        <p className="mt-3 text-caption-sm text-muted">
          No internal links are recorded yet. The isolated pages above are the site&apos;s current
          orphan and underlinked candidates.
        </p>
      )}

      <p className="sr-only" id="site-network-description">
        {mapSummary} Select a page in the map to inspect its title, structural status, and incoming
        and outgoing links.
      </p>
    </section>
  );
}

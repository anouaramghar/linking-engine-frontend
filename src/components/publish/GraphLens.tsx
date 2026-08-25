import { useMemo, useState } from "react";

import type { GraphFeature, GraphNetwork, GraphNetworkEdge } from "../../types/graph";

type NetworkFilter = "all" | "prepared" | "orphan" | "underlinked" | "hub" | "saturated";
type NodeStatus = Exclude<NetworkFilter, "all" | "prepared"> | "connected";

interface Props {
  data: GraphNetwork;
}

interface Position {
  x: number;
  y: number;
}

interface LabelPlacement extends Position {
  textAnchor: "start" | "end";
}

interface LabelBox {
  bottom: number;
  left: number;
  right: number;
  top: number;
}

interface LayoutBand {
  count: number;
  rows: number;
  top: number;
  center: Position;
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
const ISOLATED_GROUP_THRESHOLD = 12;
const LABEL_VERTICAL_OFFSETS = [0, -18, 18, -36, 36, -54, 54];
const LABEL_GAP = 8;

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

const matchesFilter = (
  node: GraphFeature,
  filter: NetworkFilter,
  preparedNodeIds: Set<number>,
) => {
  if (filter === "all") return true;
  if (filter === "prepared") return preparedNodeIds.has(node.article_id);
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
    band = {
      count: isolated.length,
      rows,
      top,
      center: {
        x: NETWORK_WIDTH / 2,
        y: top + ((rows - 1) * BAND_PITCH) / 2,
      },
    };
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
    <div className="mt-3 overflow-hidden rounded-lg border border-hairline bg-canvas-soft">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2">
        <span className="text-caption font-medium text-ink">Map key</span>
        {LEGEND_STATUSES.map((status) => (
          <span key={status} className="inline-flex items-center gap-2 text-caption-sm text-muted">
            <span
              aria-hidden="true"
              className="h-2.5 w-2.5 flex-none rounded-sm border"
              style={{ backgroundColor: STATUS_FILL[status], borderColor: STATUS_COLOR[status] }}
            />
            {STATUS_LABEL[status]}
          </span>
        ))}
        <span className="inline-flex items-center text-caption-sm text-muted">
          <span className="mr-1 inline-block w-6 border-t border-hairline-control align-middle" />
          Active line
        </span>
        <span className="inline-flex items-center text-caption-sm text-muted">
          <span className="mr-1 inline-block w-6 border-t-2 border-dashed border-primary align-middle" />
          Prepared line
        </span>
      </div>
      <details className="border-t border-hairline px-3 py-2">
        <summary className="cursor-pointer text-caption-sm font-medium text-ink">
          How to read the map
        </summary>
        <p className="mt-2 text-caption-sm leading-normal text-muted">
          Every small marker is a page. Lines show internal links; arrowheads show their direction.
          Linked pages group into clusters. Large groups of pages with no internal link are
          summarized as one selectable marker below the clusters.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {LEGEND_STATUSES.map((status) => (
            <div key={status} className="text-caption-sm text-muted">
              <span className="font-medium text-ink">{STATUS_LABEL[status]}:</span>{" "}
              {STATUS_DESCRIPTION[status]}
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}

function ConnectionList({
  emptyLabel,
  label,
  nodes,
  onSelect,
}: {
  emptyLabel: string;
  label: string;
  nodes: GraphFeature[];
  onSelect: (articleId: number) => void;
}) {
  return (
    <div>
      <div className="font-medium text-ink">{label}</div>
      {nodes.length > 0 ? (
        <ul className="mt-1 space-y-1 text-muted">
          {nodes.slice(0, 4).map((node) => (
            <li key={node.article_id}>
              <button
                type="button"
                className="block max-w-full truncate text-left hover:text-ink"
                title={node.article_title}
                onClick={() => onSelect(node.article_id)}
              >
                {node.article_title}
              </button>
            </li>
          ))}
          {nodes.length > 4 && <li>+{nodes.length - 4} more</li>}
        </ul>
      ) : (
        <p className="mt-1 text-muted">{emptyLabel}</p>
      )}
    </div>
  );
}

export default function GraphLens({ data }: Props) {
  const [filter, setFilter] = useState<NetworkFilter>("all");
  const [query, setQuery] = useState("");
  const [selectedArticleId, setSelectedArticleId] = useState<number | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<"isolated" | null>(null);
  const [selectedEdgeKey, setSelectedEdgeKey] = useState<string | null>(null);
  const [showDirection, setShowDirection] = useState(true);
  const [zoom, setZoom] = useState(1);

  const nodeById = useMemo(
    () => new Map(data.nodes.map((node) => [node.article_id, node])),
    [data.nodes],
  );
  const proposedEdges = useMemo(
    () => (data.proposed_edges ?? []).filter((edge) => edge.status === "new"),
    [data.proposed_edges],
  );
  const visibleEdges = useMemo(() => {
    const activeEdgeKeys = new Set(data.edges.map((edge) => edgeKey(edge.source_article_id, edge.target_article_id)));
    const uniqueProposed = proposedEdges.filter(
      (edge) => !activeEdgeKeys.has(edgeKey(edge.source_article_id, edge.target_article_id)),
    );
    return [
      ...data.edges,
      ...uniqueProposed.map((edge) => ({
        source_article_id: edge.source_article_id,
        target_article_id: edge.target_article_id,
        proposed: true,
      })),
    ];
  }, [data.edges, proposedEdges]);
  const visibleProposedEdges = visibleEdges.filter((edge) => edge.proposed);
  const effectiveFilter: NetworkFilter =
    filter === "prepared" && visibleProposedEdges.length === 0 ? "all" : filter;
  const preparedNodeIds = useMemo(
    () =>
      new Set(
        visibleProposedEdges.flatMap((edge) => [edge.source_article_id, edge.target_article_id]),
      ),
    [visibleProposedEdges],
  );
  const layout = useMemo(() => layoutFullNodes(data.nodes, visibleEdges), [data.nodes, visibleEdges]);
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
        matchingNodes
          .filter((node) => matchesFilter(node, effectiveFilter, preparedNodeIds))
          .map((node) => node.article_id),
      ),
    [effectiveFilter, matchingNodes, preparedNodeIds],
  );
  const selectedConnections = useMemo(() => {
    if (selectedArticleId === null) {
      return {
        activeIncoming: [],
        activeOutgoing: [],
        preparedIncoming: [],
        preparedOutgoing: [],
      };
    }
    const activeIncoming = data.edges
      .filter((edge) => edge.target_article_id === selectedArticleId)
      .map((edge) => nodeById.get(edge.source_article_id))
      .filter((node): node is GraphFeature => node !== undefined);
    const activeOutgoing = data.edges
      .filter((edge) => edge.source_article_id === selectedArticleId)
      .map((edge) => nodeById.get(edge.target_article_id))
      .filter((node): node is GraphFeature => node !== undefined);
    const preparedIncoming = visibleProposedEdges
      .filter((edge) => edge.target_article_id === selectedArticleId)
      .map((edge) => nodeById.get(edge.source_article_id))
      .filter((node): node is GraphFeature => node !== undefined);
    const preparedOutgoing = visibleProposedEdges
      .filter((edge) => edge.source_article_id === selectedArticleId)
      .map((edge) => nodeById.get(edge.target_article_id))
      .filter((node): node is GraphFeature => node !== undefined);
    return { activeIncoming, activeOutgoing, preparedIncoming, preparedOutgoing };
  }, [data.edges, nodeById, selectedArticleId, visibleProposedEdges]);
  const selectedNeighborIds = useMemo(
    () =>
      new Set(
        [
          ...selectedConnections.activeIncoming,
          ...selectedConnections.activeOutgoing,
          ...selectedConnections.preparedIncoming,
          ...selectedConnections.preparedOutgoing,
        ].map((node) => node.article_id),
      ),
    [selectedConnections],
  );
  const isolatedNodes = useMemo(
    () => data.nodes.filter((node) => !layout.linked.has(node.article_id)),
    [data.nodes, layout.linked],
  );
  const isolatedPreviewNodes = useMemo(
    () =>
      isolatedNodes
        .slice()
        .sort((left, right) => nodeDegree(right) - nodeDegree(left))
        .slice(0, 8),
    [isolatedNodes],
  );
  const groupIsolated =
    layout.band !== null &&
    layout.band.count >= ISOLATED_GROUP_THRESHOLD &&
    normalizedQuery.length === 0;
  const selectedProposedEdge = useMemo(
    () =>
      selectedEdgeKey === null
        ? undefined
        : proposedEdges.find(
            (edge) => edgeKey(edge.source_article_id, edge.target_article_id) === selectedEdgeKey,
          ),
    [proposedEdges, selectedEdgeKey],
  );
  const selectedProposedSource = selectedProposedEdge
    ? nodeById.get(selectedProposedEdge.source_article_id)
    : undefined;
  const selectedProposedTarget = selectedProposedEdge
    ? nodeById.get(selectedProposedEdge.target_article_id)
    : undefined;
  const labelPlacements = useMemo(() => {
    const placements = new Map<number, LabelPlacement>();
    const candidates: GraphFeature[] = [];
    const candidateIds = new Set<number>();
    const addCandidate = (node: GraphFeature | undefined) => {
      if (
        node === undefined ||
        candidateIds.has(node.article_id) ||
        candidates.length >= MAX_MAP_LABELS * 3
      ) {
        return;
      }
      candidateIds.add(node.article_id);
      candidates.push(node);
    };

    if (selectedArticleId !== null) addCandidate(nodeById.get(selectedArticleId));
    selectedNeighborIds.forEach((articleId) => addCandidate(nodeById.get(articleId)));
    if (normalizedQuery.length > 0 || effectiveFilter !== "all") {
      matchingNodes
        .filter((node) => matchesFilter(node, effectiveFilter, preparedNodeIds))
        .forEach(addCandidate);
    } else {
      // A small cluster stays legible on a large site, so name those pages even
      // when the band below holds hundreds of unlinked ones.
      const pool =
        layout.linked.size > 0 && layout.linked.size <= 32
          ? data.nodes.filter((node) => layout.linked.has(node.article_id))
          : data.nodes.length <= 32
            ? data.nodes.slice()
            : [];
      pool.sort((left, right) => nodeDegree(right) - nodeDegree(left)).forEach(addCandidate);
    }

    const occupiedLabels: LabelBox[] = [];
    const nodeBoxes = data.nodes.flatMap((node) => {
      const position = layout.positions.get(node.article_id);
      return position === undefined
        ? []
        : [
            {
              articleId: node.article_id,
              box: {
                bottom: position.y + 9,
                left: position.x - 9,
                right: position.x + 9,
                top: position.y - 9,
              },
            },
          ];
    });
    const overlaps = (left: LabelBox, right: LabelBox) =>
      left.left < right.right + LABEL_GAP &&
      left.right > right.left - LABEL_GAP &&
      left.top < right.bottom + LABEL_GAP &&
      left.bottom > right.top - LABEL_GAP;

    candidates.forEach((node) => {
      if (placements.size >= MAX_MAP_LABELS) return;
      const position = layout.positions.get(node.article_id);
      if (position === undefined) return;

      const text = shortTitle(node.article_title);
      const width = clamp(text.length * 6.5, 64, 230);
      const preferredSide: LabelPlacement["textAnchor"] =
        position.x < NETWORK_WIDTH / 2 ? "start" : "end";
      const sides: LabelPlacement["textAnchor"][] = [
        preferredSide,
        preferredSide === "start" ? "end" : "start",
      ];

      for (const textAnchor of sides) {
        for (const offset of LABEL_VERTICAL_OFFSETS) {
          const x = textAnchor === "start" ? position.x + 13 : position.x - 13;
          const y = position.y + 4 + offset;
          const box: LabelBox = {
            bottom: y + 4,
            left: textAnchor === "start" ? x : x - width,
            right: textAnchor === "start" ? x + width : x,
            top: y - 13,
          };
          const collidesWithLabel = occupiedLabels.some((other) => overlaps(box, other));
          const collidesWithNode = nodeBoxes.some(
            (other) => other.articleId !== node.article_id && overlaps(box, other.box),
          );
          if (
            box.left < 8 ||
            box.right > NETWORK_WIDTH - 8 ||
            box.top < 8 ||
            box.bottom > layout.height - 8 ||
            collidesWithLabel ||
            collidesWithNode
          ) {
            continue;
          }
          placements.set(node.article_id, { x, y, textAnchor });
          occupiedLabels.push(box);
          return;
        }
      }

      // The selected page must remain named even when a dense local topology
      // leaves no collision-free label slot.
      if (selectedArticleId === node.article_id) {
        const textAnchor: LabelPlacement["textAnchor"] = preferredSide;
        const x = textAnchor === "start" ? position.x + 13 : position.x - 13;
        placements.set(node.article_id, { x, y: position.y + 4, textAnchor });
      }
    });
    return placements;
  }, [
    data.nodes,
    effectiveFilter,
    layout.height,
    layout.linked,
    layout.positions,
    matchingNodes,
    normalizedQuery,
    nodeById,
    preparedNodeIds,
    selectedArticleId,
    selectedNeighborIds,
  ]);
  const activeNode = (node: GraphFeature) =>
    matchesFilter(node, effectiveFilter, preparedNodeIds) && matchesQuery(node, normalizedQuery);
  const focusEdge = (edge: GraphNetworkEdge) =>
    selectedArticleId !== null &&
    (edge.source_article_id === selectedArticleId || edge.target_article_id === selectedArticleId);
  const highlightedEdge = (edge: GraphNetworkEdge) =>
    focusEdge(edge) ||
    (effectiveFilter !== "all" &&
      (highlightNodeIds.has(edge.source_article_id) || highlightNodeIds.has(edge.target_article_id))) ||
    (normalizedQuery.length > 0 &&
      (matchingNodeIds.has(edge.source_article_id) || matchingNodeIds.has(edge.target_article_id)));

  const renderEdge = (edge: GraphNetworkEdge, index: number, proposed = false) => {
    const source = layout.positions.get(edge.source_article_id);
    const target = layout.positions.get(edge.target_article_id);
    if (!source || !target) return null;
    const edgeId = edgeKey(edge.source_article_id, edge.target_article_id);
    const active = highlightedEdge(edge);
    const focused = focusEdge(edge);
    const selected = selectedEdgeKey === edgeId;
    const sourceNode = nodeById.get(edge.source_article_id);
    const targetNode = nodeById.get(edge.target_article_id);
    const dimmed =
      (sourceNode ? !activeNode(sourceNode) : true) &&
      (targetNode ? !activeNode(targetNode) : true);
    const edgeLabel =
      (proposed ? "Prepared link: " : "Active link: ") +
      (sourceNode?.article_title ?? "Unknown page") +
      " to " +
      (targetNode?.article_title ?? "Unknown page");
    const selectEdge = () => {
      if (!proposed) return;
      setSelectedEdgeKey(edgeId);
      setSelectedGroup(null);
      setSelectedArticleId(edge.target_article_id);
    };
    const markerEnd =
      showDirection
        ? selected || focused || active
          ? "url(#graph-lens-arrow-active)"
          : "url(#graph-lens-arrow-muted)"
        : undefined;
    const visibleLine = (
      <line
        key={edgeId + ":" + index}
        className={proposed ? "graph-edge-visible" : undefined}
        x1={source.x}
        y1={source.y}
        x2={target.x}
        y2={target.y}
        stroke={focused || proposed ? "rgb(var(--c-primary))" : "rgb(var(--c-hairline-control))"}
        strokeWidth={selected ? 3.2 : focused ? 2.4 : proposed ? 2.2 : active ? 1.5 : 1}
        strokeOpacity={
          selected ? 1 : focused ? 0.98 : proposed ? 0.95 : dimmed ? 0.08 : active ? 0.7 : 0.45
        }
        strokeDasharray={proposed ? "6 4" : undefined}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
        pointerEvents={proposed ? "none" : undefined}
        markerEnd={markerEnd}
      />
    );
    if (!proposed) return visibleLine;
    return (
      <g
        key={edgeId + ":" + index}
        role="button"
        tabIndex={0}
        aria-label={edgeLabel}
        className="graph-edge-hit cursor-pointer"
        onClick={selectEdge}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            selectEdge();
          }
        }}
      >
        <line
          className="graph-edge-hit-target"
          x1={source.x}
          y1={source.y}
          x2={target.x}
          y2={target.y}
          stroke="transparent"
          strokeWidth="16"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          pointerEvents="stroke"
        />
        <line
          className="graph-edge-focus"
          x1={source.x}
          y1={source.y}
          x2={target.x}
          y2={target.y}
          stroke="rgb(var(--c-primary))"
          strokeWidth="10"
          strokeOpacity={selected ? 0.2 : 0}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
        />
        {visibleLine}
      </g>
    );
  };

  const selectNode = (articleId: number) => {
    setSelectedArticleId(articleId);
    setSelectedGroup(null);
    setSelectedEdgeKey(null);
  };
  const selectIsolatedGroup = () => {
    setSelectedArticleId(null);
    setSelectedGroup("isolated");
    setSelectedEdgeKey(null);
  };
  const setNetworkFilter = (nextFilter: NetworkFilter) => {
    setFilter(nextFilter);
    setSelectedArticleId(null);
    setSelectedGroup(null);
    setSelectedEdgeKey(null);
  };
  const clearSelection = () => {
    setSelectedArticleId(null);
    setSelectedGroup(null);
    setSelectedEdgeKey(null);
  };

  const mapSummary =
    data.article_count.toLocaleString() +
    " pages and " +
    data.edge_count.toLocaleString() +
    " internal links. " +
    (visibleProposedEdges.length > 0
      ? `${visibleProposedEdges.length.toLocaleString()} prepared internal ${
          visibleProposedEdges.length === 1 ? "link" : "links"
        } are overlaid. `
      : "") +
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
            See the whole active site as a connected system, with prepared internal links shown as
            dashed lines. Search or filter to bring important pages forward, then select a page to
            inspect its place in the network.
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
        {visibleProposedEdges.length > 0 && (
          <span>
            <strong className="font-medium text-primary">
              {visibleProposedEdges.length.toLocaleString()}
            </strong>{" "}
            prepared internal {visibleProposedEdges.length === 1 ? "link" : "links"}
          </span>
        )}
        <span>
          <strong className="font-medium text-error-ink">{data.orphan_count.toLocaleString()}</strong> orphans
        </span>
        <span>
          <strong className="font-medium text-success">{data.hub_count.toLocaleString()}</strong> hubs
        </span>
      </div>
      {visibleProposedEdges.length > 0 && (
        <p className="mt-2 text-caption-sm text-muted">
          Structural signals describe the active site; dashed links are prepared edits and are not
          published yet.
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Network graph filters">
          <SignalButton
            active={effectiveFilter === "all"}
            color="rgb(var(--c-primary))"
            count={data.article_count}
            description="The full site"
            label="All pages"
            onClick={() => setNetworkFilter("all")}
          />
          {visibleProposedEdges.length > 0 && (
            <SignalButton
              active={effectiveFilter === "prepared"}
              color="rgb(var(--c-primary))"
              count={visibleProposedEdges.length}
              description="Prepared links and their neighboring pages"
              label="Prepared"
              onClick={() => setNetworkFilter("prepared")}
            />
          )}
          <SignalButton
            active={effectiveFilter === "orphan"}
            color={STATUS_COLOR.orphan}
            count={data.orphan_count}
            description={STATUS_DESCRIPTION.orphan}
            label="Orphans"
            onClick={() => setNetworkFilter("orphan")}
          />
          <SignalButton
            active={effectiveFilter === "underlinked"}
            color={STATUS_COLOR.underlinked}
            count={data.underlinked_count}
            description={STATUS_DESCRIPTION.underlinked}
            label="Underlinked"
            onClick={() => setNetworkFilter("underlinked")}
          />
          <SignalButton
            active={effectiveFilter === "hub"}
            color={STATUS_COLOR.hub}
            count={data.hub_count}
            description={STATUS_DESCRIPTION.hub}
            label="Hubs"
            onClick={() => setNetworkFilter("hub")}
          />
          <SignalButton
            active={effectiveFilter === "saturated"}
            color={STATUS_COLOR.saturated}
            count={data.saturated_count}
            description={STATUS_DESCRIPTION.saturated}
            label="Saturated"
            onClick={() => setNetworkFilter("saturated")}
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
              onClick={() => selectNode(node.article_id)}
            >
              {shortTitle(node.article_title)}
            </button>
          ))}
        </div>
      )}

      <SignalLegend />

              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-caption-sm text-muted">
        <span>
          {effectiveFilter === "all" && normalizedQuery.length === 0
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
              className={zoom === 1 ? "block h-auto w-full" : "block"}
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
                      (visibleProposedEdges.length > 0
                        ? " active or prepared internal link"
                        : " internal link")}
                  </text>
                </g>
              )}

              <g role="group" aria-label="Internal links">
                {data.edges.map((edge, index) => renderEdge(edge, index))}
              </g>
              <g role="group" aria-label="Prepared internal links">
                {visibleProposedEdges.map((edge, index) => renderEdge(edge, index, true))}
              </g>

              {groupIsolated && effectiveFilter !== "prepared" && layout.band && (
                <g
                  role="button"
                  tabIndex={0}
                  aria-pressed={selectedGroup === "isolated"}
                  aria-label={
                    layout.band.count.toLocaleString() +
                    " isolated pages. Open the page list to inspect them."
                  }
                  className="graph-group cursor-pointer"
                  onClick={selectIsolatedGroup}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      selectIsolatedGroup();
                    }
                  }}
                >
                  <title>
                    {layout.band.count.toLocaleString() +
                      " isolated pages. Select to inspect their titles and structural signals."}
                  </title>
                  <rect
                    className="graph-group-focus"
                    x={layout.band.center.x - 105}
                    y={layout.band.center.y - 21}
                    width="210"
                    height="42"
                    rx="21"
                    fill="none"
                    stroke="rgb(var(--c-primary))"
                    strokeWidth="2"
                    opacity={selectedGroup === "isolated" ? 1 : 0}
                    pointerEvents="none"
                    vectorEffect="non-scaling-stroke"
                  />
                  <rect
                    x={layout.band.center.x - 98}
                    y={layout.band.center.y - 14}
                    width="196"
                    height="28"
                    rx="14"
                    fill={
                      effectiveFilter === "orphan"
                        ? STATUS_FILL.orphan
                        : "rgb(var(--c-surface-strong))"
                    }
                    stroke={
                      effectiveFilter === "orphan"
                        ? STATUS_COLOR.orphan
                        : "rgb(var(--c-hairline-strong))"
                    }
                    strokeWidth="1.5"
                    vectorEffect="non-scaling-stroke"
                  />
                  <text
                    x={layout.band.center.x}
                    y={layout.band.center.y + 4}
                    textAnchor="middle"
                    fill="rgb(var(--c-ink))"
                    fontSize="12"
                    fontWeight="600"
                    pointerEvents="none"
                  >
                    {layout.band.count.toLocaleString() + " isolated pages"}
                  </text>
                </g>
              )}

              <g aria-label="Pages">
                {data.nodes.map((node) => {
                  const position = layout.positions.get(node.article_id);
                  if (!position) return null;
                  const status = nodeStatus(node);
                  const matching = activeNode(node);
                  const selected = node.article_id === selectedArticleId;
                  const neighbor = selectedNeighborIds.has(node.article_id);
                  const hiddenByGroup =
                    groupIsolated && !layout.linked.has(node.article_id) && !selected;
                  if (hiddenByGroup) return null;
                  const size = clamp(7 + Math.log2(nodeDegree(node) + 1) * 1.8, 7, 15);
                  const labelPlacement = labelPlacements.get(node.article_id);
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
                      opacity={selected || matching ? 1 : neighbor ? 0.82 : 0.14}
                      onClick={() => selectNode(node.article_id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          selectNode(node.article_id);
                        }
                      }}
                    >
                      <title>{node.article_title + " · " + detail}</title>
                      {selected && (
                        <circle
                          cx={position.x}
                          cy={position.y}
                          r={size + 9}
                          fill="none"
                          stroke="rgb(var(--c-primary))"
                          strokeWidth="1.5"
                          opacity="0.34"
                          pointerEvents="none"
                          vectorEffect="non-scaling-stroke"
                        />
                      )}
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
                      {labelPlacement && (
                        <text
                          x={labelPlacement.x}
                          y={labelPlacement.y}
                          textAnchor={labelPlacement.textAnchor}
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
          className="self-start rounded-xl border border-hairline bg-surface-card px-4 py-4 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto"
        >
          {selectedGroup === "isolated" ? (
            <>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h4 className="text-body-sm font-medium text-ink">Isolated pages</h4>
                  <p className="mt-1 text-caption-sm text-muted">
                    {isolatedNodes.length.toLocaleString()} pages have no active or prepared internal
                    link.
                  </p>
                </div>
                <button type="button" className="btn btn-outline btn-sm" onClick={clearSelection}>
                  Clear
                </button>
              </div>
              <div className="mt-4 divide-y divide-hairline rounded-lg border border-hairline">
                {isolatedPreviewNodes.map((node) => (
                  <button
                    key={node.article_id}
                    type="button"
                    aria-label={
                      node.article_title +
                      ". " +
                      node.in_degree +
                      " incoming, " +
                      node.out_degree +
                      " outgoing, " +
                      STATUS_LABEL[nodeStatus(node)]
                    }
                    className="flex w-full items-start gap-3 px-3 py-3 text-left transition-colors duration-feedback ease-settle first:rounded-t-lg last:rounded-b-lg hover:bg-surface-strong"
                    onClick={() => selectNode(node.article_id)}
                  >
                    <span
                      aria-hidden="true"
                      className="mt-1.5 h-2.5 w-2.5 flex-none rounded-sm border"
                      style={{
                        backgroundColor: STATUS_FILL[nodeStatus(node)],
                        borderColor: STATUS_COLOR[nodeStatus(node)],
                      }}
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-caption font-medium text-ink">
                        {node.article_title}
                      </span>
                      <span className="mt-0.5 block text-caption-sm text-muted">
                        · {node.in_degree} incoming · {node.out_degree} outgoing ·{" "}
                        {STATUS_LABEL[nodeStatus(node)]}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
              {isolatedNodes.length > isolatedPreviewNodes.length && (
                <p className="mt-3 text-caption-sm text-muted">
                  Showing {isolatedPreviewNodes.length} of {isolatedNodes.length.toLocaleString()}.
                  Use search to find a specific page.
                </p>
              )}
            </>
          ) : selectedNode ? (
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
                  onClick={clearSelection}
                >
                  Clear
                </button>
              </div>
              {selectedProposedEdge && (
                <div className="mt-3 rounded-lg border border-primary bg-tint-active px-3 py-3 text-caption-sm">
                  <div className="font-medium text-ink">Prepared link selected</div>
                  <p className="mt-1 leading-normal text-body">
                    {selectedProposedSource?.article_title ?? "Unknown page"} →{" "}
                    {selectedProposedTarget?.article_title ?? "Unknown page"}
                  </p>
                  <p className="mt-1 text-muted">This dashed link is prepared but not live yet.</p>
                </div>
              )}
              <div className="mt-3 inline-flex rounded-pill bg-surface-strong px-2.5 py-1 text-caption-sm font-medium text-ink">
                {STATUS_LABEL[nodeStatus(selectedNode)]}
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 border-y border-hairline py-3 text-caption-sm">
                <div>
                  <dt className="text-muted">Active incoming</dt>
                  <dd className="mt-1 text-body-sm font-medium tabular-nums text-ink">
                    {selectedNode.in_degree.toLocaleString()}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">Active outgoing</dt>
                  <dd className="mt-1 text-body-sm font-medium tabular-nums text-ink">
                    {selectedNode.out_degree.toLocaleString()}
                  </dd>
                </div>
              </dl>
              <p className="mt-3 break-all text-caption-sm leading-normal text-muted">
                {selectedNode.article_url}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <a
                  href={selectedNode.article_url}
                  target="_blank"
                  rel="noreferrer"
                  className="btn btn-primary btn-sm"
                >
                  Open page
                </a>
              </div>
              <div className="mt-4 space-y-3 text-caption-sm">
                <ConnectionList
                  label="Active links to"
                  nodes={selectedConnections.activeOutgoing}
                  emptyLabel="No active outgoing links recorded."
                  onSelect={selectNode}
                />
                {selectedConnections.preparedOutgoing.length > 0 && (
                  <ConnectionList
                    label="Prepared links to"
                    nodes={selectedConnections.preparedOutgoing}
                    emptyLabel="No prepared outgoing links."
                    onSelect={selectNode}
                  />
                )}
                <ConnectionList
                  label="Active links from"
                  nodes={selectedConnections.activeIncoming}
                  emptyLabel="No active incoming links recorded."
                  onSelect={selectNode}
                />
                {selectedConnections.preparedIncoming.length > 0 && (
                  <ConnectionList
                    label="Prepared links from"
                    nodes={selectedConnections.preparedIncoming}
                    emptyLabel="No prepared incoming links."
                    onSelect={selectNode}
                  />
                )}
              </div>
            </>
          ) : (
            <>
              <h4 className="text-body-sm font-medium text-ink">Page details</h4>
              {visibleProposedEdges.length > 0 ? (
                <>
                  <p className="mt-2 text-caption-sm leading-normal text-muted">
                    Start with the prepared links, or select any page to inspect its structural
                    signal, URL, and neighboring links.
                  </p>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm mt-4"
                    onClick={() => setNetworkFilter("prepared")}
                  >
                    Focus prepared links
                  </button>
                </>
              ) : (
                <p className="mt-2 text-caption-sm leading-normal text-muted">
                  Select a square to inspect its structural signal, URL, and neighboring links.
                </p>
              )}
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

      {data.nodes.length > 0 && data.edges.length === 0 && visibleProposedEdges.length === 0 && (
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

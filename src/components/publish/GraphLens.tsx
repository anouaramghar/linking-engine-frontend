import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { useMediaQuery } from "../../hooks/useMediaQuery";
import { REDUCED_MOTION_QUERY } from "../../hooks/useTheme";
import { placeMapLabels, truncateTitle, type LabelAnchor, type LabelCandidate } from "../../lib/siteMapLabels";
import { layoutSiteMap, type MapPoint } from "../../lib/siteMapLayout";
import type { GraphFeature, GraphNetwork, GraphNetworkEdge } from "../../types/graph";

/**
 * The site as one map: a linked core, and the pages that never reached it.
 *
 * The screen is a camera over a single composition rather than a diagram plus a
 * summary band. Pages that carry an internal link — active or prepared — settle
 * into the middle; pages that carry none are scattered around them and are, at
 * the opening frame, just off the edge. Zooming out is what brings them in, so
 * the size of the unlinked rim is something the editor *sees* on the way to it
 * instead of a number they read in a caption.
 *
 * Two things are deliberately not React state, because both change per animation
 * frame and neither changes what the DOM contains: the camera writes `viewBox`
 * and the halo's reveal straight onto the SVG element (see `writeViewport`), and
 * the map keeps its screen-constant weight through `vectorEffect` and
 * zero-length stroked paths rather than through re-rendered geometry. React
 * re-renders once per settled camera, not sixty times per second.
 */

type NetworkFilter = "all" | "prepared" | "orphan" | "underlinked" | "hub" | "saturated";
type NodeStatus = Exclude<NetworkFilter, "all" | "prepared"> | "connected";

interface Props {
  data: GraphNetwork;
}

/** Where the camera is: a world-space centre and how tight the frame is. */
interface Viewport {
  scale: number;
  x: number;
  y: number;
}

interface FrameSize {
  height: number;
  width: number;
}

/** jsdom reports no layout, and the map still has to be describable in tests. */
const FALLBACK_FRAME: FrameSize = { height: 620, width: 980 };
const MAX_SCALE = 6;
const ZOOM_STEP = 1.25;
/** Below this the map is a shape, not a reading surface: titles switch off. */
const LABEL_MIN_SCALE = 0.8;
const MAX_LABELS = 22;
/**
 * Above this many isolated pages the rim is drawn as one path of markers.
 * Ten thousand focusable groups is not a keyboard surface anyone can use, and
 * the pages stay reachable through search and the isolated-page list.
 */
const HALO_MARKER_LIMIT = 700;
const TAB_LIMIT = 40;
const CAMERA_MS = 200;
/** The opening move: the whole site, then in to the core. */
const INTRO_MS = 280;

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

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

const snapshotLabel = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Current graph snapshot";
  return (
    "Snapshot " +
    new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date)
  );
};

const nodeStatus = (node: GraphFeature): NodeStatus => {
  if (node.orphan) return "orphan";
  if (node.underlinked) return "underlinked";
  if (node.hub) return "hub";
  if (node.saturated) return "saturated";
  return "connected";
};

const matchesFilter = (node: GraphFeature, filter: NetworkFilter, preparedNodeIds: Set<number>) => {
  if (filter === "all") return true;
  if (filter === "prepared") return preparedNodeIds.has(node.article_id);
  return node[filter];
};

const matchesQuery = (node: GraphFeature, normalizedQuery: string) =>
  normalizedQuery.length === 0 ||
  node.article_title.toLocaleLowerCase().includes(normalizedQuery) ||
  node.article_url.toLocaleLowerCase().includes(normalizedQuery);

const edgeKey = (sourceArticleId: number, targetArticleId: number) =>
  sourceArticleId + ":" + targetArticleId;

const nodeDegree = (node: GraphFeature) => node.in_degree + node.out_degree;

const connectedNodes = (
  edges: readonly GraphNetworkEdge[],
  selectedArticleId: number,
  nodeById: Map<number, GraphFeature>,
) => {
  const incoming: GraphFeature[] = [];
  const outgoing: GraphFeature[] = [];
  for (const edge of edges) {
    if (edge.target_article_id === selectedArticleId) {
      const source = nodeById.get(edge.source_article_id);
      if (source) incoming.push(source);
    }
    if (edge.source_article_id === selectedArticleId) {
      const target = nodeById.get(edge.target_article_id);
      if (target) outgoing.push(target);
    }
  }
  return { incoming, outgoing };
};

/**
 * A page marker is a zero-length stroked path, not a circle element.
 *
 * `stroke-linecap="round"` paints a dot of exactly the stroke width at the
 * point, and `vector-effect="non-scaling-stroke"` holds that width in screen
 * pixels at every zoom. So one attribute keeps every marker the same size
 * whether the camera is framing eight pages or four thousand — without
 * recomputing a single coordinate as the camera moves.
 */
const markerPath = (point: MapPoint) => "M" + point.x + " " + point.y + "l0 0";

const markerSize = (node: GraphFeature) => clamp(9 + Math.log2(nodeDegree(node) + 1) * 2.4, 9, 22);

const HALO_MARKER_SIZE = 7;

const frameSpan = (coreSpan: number, scale: number, aspect: number) => {
  // The core disc must fit whichever screen axis is shorter, so the opening
  // frame is the same promise on a phone and on a 27" display.
  const shortSide = coreSpan / scale;
  return aspect >= 1
    ? { height: shortSide, width: shortSide * aspect }
    : { height: shortSide / aspect, width: shortSide };
};

const projectPoint = (
  point: MapPoint,
  view: Viewport,
  coreSpan: number,
  aspect: number,
  frame: FrameSize,
) => {
  const span = frameSpan(coreSpan, view.scale, aspect);
  return {
    x: ((point.x - (view.x - span.width / 2)) / span.width) * frame.width,
    y: ((point.y - (view.y - span.height / 2)) / span.height) * frame.height,
  };
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
        "inline-flex min-h-9 items-center gap-2 rounded-pill border px-3 py-1.5 text-left transition-[background-color,border-color,box-shadow] duration-state ease-settle " +
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
      <span className="text-caption-sm font-medium text-ink">{label}</span>
      <span className="text-caption-sm tabular-nums text-muted">{count.toLocaleString()}</span>
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

function FitIcon() {
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
      <path d="M4 9V4h5" />
      <path d="M20 9V4h-5" />
      <path d="M4 15v5h5" />
      <path d="M20 15v5h-5" />
    </svg>
  );
}

/**
 * The link layer. Split from the page layer so a hover — which only moves a
 * title — never reconciles a few thousand line elements.
 */
const MapEdges = memo(function MapEdges({
  activeIds,
  edges,
  nodeById,
  onSelectEdge,
  positions,
  preparedEdges,
  selectedArticleId,
  selectedEdgeKey,
  showDirection,
}: {
  activeIds: Set<number>;
  edges: GraphNetworkEdge[];
  nodeById: Map<number, GraphFeature>;
  onSelectEdge: (edge: GraphNetworkEdge) => void;
  positions: Map<number, MapPoint>;
  preparedEdges: GraphNetworkEdge[];
  selectedArticleId: number | null;
  selectedEdgeKey: string | null;
  showDirection: boolean;
}) {
  const renderEdge = (edge: GraphNetworkEdge, index: number, prepared: boolean) => {
    const source = positions.get(edge.source_article_id);
    const target = positions.get(edge.target_article_id);
    if (!source || !target) return null;

    const edgeId = edgeKey(edge.source_article_id, edge.target_article_id);
    const focused =
      selectedArticleId !== null &&
      (edge.source_article_id === selectedArticleId || edge.target_article_id === selectedArticleId);
    const selected = selectedEdgeKey === edgeId;
    const live =
      activeIds.has(edge.source_article_id) || activeIds.has(edge.target_article_id);
    const sourceNode = nodeById.get(edge.source_article_id);
    const targetNode = nodeById.get(edge.target_article_id);
    // A marker paints with its own fill, so it would not dim with the line it
    // caps: a receded link would keep a solid arrowhead speckling the map.
    const markerEnd =
      showDirection && (live || focused || selected || prepared)
        ? selected || focused
          ? "url(#graph-lens-arrow-active)"
          : "url(#graph-lens-arrow-muted)"
        : undefined;

    const line = (
      <line
        key={edgeId + ":" + index}
        className={prepared ? "graph-edge-visible graph-edge-prepared" : undefined}
        x1={source.x}
        y1={source.y}
        x2={target.x}
        y2={target.y}
        stroke={focused || prepared ? "rgb(var(--c-primary))" : "rgb(var(--c-hairline-control))"}
        strokeWidth={selected ? 3 : focused ? 2.2 : prepared ? 2 : 1.1}
        strokeOpacity={selected ? 1 : focused ? 0.96 : prepared ? 0.92 : live ? 0.5 : 0.1}
        strokeDasharray={prepared ? "6 4" : undefined}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
        pointerEvents="none"
        markerEnd={markerEnd}
      />
    );

    if (!prepared) return line;

    const edgeLabel =
      "Prepared link: " +
      (sourceNode?.article_title ?? "Unknown page") +
      " to " +
      (targetNode?.article_title ?? "Unknown page");

    return (
      <g
        key={edgeId + ":" + index}
        role="button"
        tabIndex={0}
        aria-label={edgeLabel}
        className="graph-edge-hit cursor-pointer"
        onClick={() => onSelectEdge(edge)}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onSelectEdge(edge);
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
          strokeWidth="18"
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
          strokeWidth="12"
          strokeOpacity={selected ? 0.18 : 0}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
          pointerEvents="none"
        />
        {line}
      </g>
    );
  };

  return (
    <>
      <g role="group" aria-label="Internal links">
        {edges.map((edge, index) => renderEdge(edge, index, false))}
      </g>
      <g role="group" aria-label="Prepared internal links">
        {preparedEdges.map((edge, index) => renderEdge(edge, index, true))}
      </g>
    </>
  );
});

/**
 * The page layer, in two instances: the core and the halo. Both draw the same
 * marker; only the size and the default weight differ, because an isolated page
 * has no degree to express.
 */
const MapNodes = memo(function MapNodes({
  activeIds,
  ids,
  neighborIds,
  nodeById,
  onSelect,
  positions,
  selectedArticleId,
  tabbableIds,
  variant,
}: {
  activeIds: Set<number>;
  ids: number[];
  neighborIds: Set<number>;
  nodeById: Map<number, GraphFeature>;
  onSelect: (articleId: number) => void;
  positions: Map<number, MapPoint>;
  selectedArticleId: number | null;
  tabbableIds: Set<number>;
  variant: "core" | "halo";
}) {
  return (
    <>
      {ids.map((articleId) => {
        const node = nodeById.get(articleId);
        const position = positions.get(articleId);
        if (!node || !position) return null;

        const status = nodeStatus(node);
        const selected = articleId === selectedArticleId;
        const active = activeIds.has(articleId);
        const neighbor = neighborIds.has(articleId);
        const size = variant === "core" ? markerSize(node) : HALO_MARKER_SIZE;
        const path = markerPath(position);
        const detail =
          STATUS_LABEL[status] +
          ". " +
          node.in_degree +
          " incoming and " +
          node.out_degree +
          " outgoing links.";

        return (
          <g
            key={articleId}
            data-article-id={articleId}
            role="button"
            tabIndex={tabbableIds.has(articleId) || selected ? 0 : -1}
            aria-pressed={selected}
            aria-label={node.article_title + ". " + detail}
            className="graph-node cursor-pointer"
            opacity={selected || active ? 1 : neighbor ? 0.8 : 0.12}
            onClick={() => onSelect(articleId)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect(articleId);
              }
            }}
          >
            <title>{node.article_title + " · " + detail}</title>
            <path
              className="graph-node-focus"
              d={path}
              stroke="rgb(var(--c-primary))"
              strokeWidth={size + 16}
              strokeLinecap="round"
              strokeOpacity="0.14"
              opacity={selected ? 1 : 0}
              vectorEffect="non-scaling-stroke"
              pointerEvents="none"
            />
            {/* Stacked strokes, widest first: the selected page keeps its own
                status colour and gains an ink edge around it, rather than being
                buried under a coloured blob. */}
            {selected && (
              <path
                d={path}
                stroke="rgb(var(--c-primary))"
                strokeWidth={size + 6}
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
                pointerEvents="none"
              />
            )}
            <path
              d={path}
              stroke={STATUS_COLOR[status]}
              strokeWidth={size}
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              pointerEvents="none"
            />
            <path
              d={path}
              stroke={STATUS_FILL[status]}
              strokeWidth={Math.max(size - 3, 2)}
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              pointerEvents="none"
            />
            <path
              className="graph-node-hit"
              d={path}
              stroke="transparent"
              strokeWidth={Math.max(size + 12, 20)}
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              pointerEvents="stroke"
            />
            {/* A stroked point has no width or height of its own, so the group
                would measure as a zero-size box — invisible to anything that
                asks the DOM where this page is. This gives it an extent. */}
            <rect
              x={position.x - size / 2}
              y={position.y - size / 2}
              width={size}
              height={size}
              fill="transparent"
              pointerEvents="none"
            />
          </g>
        );
      })}
    </>
  );
});

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
  const [hoveredArticleId, setHoveredArticleId] = useState<number | null>(null);
  const [showDirection, setShowDirection] = useState(true);
  const [showNames, setShowNames] = useState(true);
  const [viewport, setViewport] = useState<Viewport>({ scale: 1, x: 0, y: 0 });
  const [frame, setFrame] = useState<FrameSize>(FALLBACK_FRAME);

  const frameElementRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  /** What the camera is showing right now, mid-flight included. */
  const shownRef = useRef<Viewport>({ scale: 1, x: 0, y: 0 });
  const animationRef = useRef(0);
  const animationTargetRef = useRef<Viewport | null>(null);
  const mountedRef = useRef(false);
  const dragRef = useRef<{ moved: boolean; origin: Viewport; pointerId: number; x: number; y: number } | null>(null);
  const geometryRef = useRef({ aspect: 1, coreSpan: 1 });

  const reducedMotion = useMediaQuery(REDUCED_MOTION_QUERY);

  const nodeById = useMemo(
    () => new Map(data.nodes.map((node) => [node.article_id, node])),
    [data.nodes],
  );
  const proposedEdges = useMemo(
    () => (data.proposed_edges ?? []).filter((edge) => edge.status === "new"),
    [data.proposed_edges],
  );
  const visibleProposedEdges = useMemo(() => {
    const activeEdgeKeys = new Set(
      data.edges.map((edge) => edgeKey(edge.source_article_id, edge.target_article_id)),
    );
    return proposedEdges
      .filter((edge) => !activeEdgeKeys.has(edgeKey(edge.source_article_id, edge.target_article_id)))
      .map((edge) => ({
        source_article_id: edge.source_article_id,
        target_article_id: edge.target_article_id,
        proposed: true,
      }));
  }, [data.edges, proposedEdges]);
  const layoutEdges = useMemo(
    () => [...data.edges, ...visibleProposedEdges],
    [data.edges, visibleProposedEdges],
  );
  const layout = useMemo(() => layoutSiteMap(data.nodes, layoutEdges), [data.nodes, layoutEdges]);

  const effectiveFilter: NetworkFilter =
    filter === "prepared" && visibleProposedEdges.length === 0 ? "all" : filter;
  const preparedNodeIds = useMemo(
    () =>
      new Set(
        visibleProposedEdges.flatMap((edge) => [edge.source_article_id, edge.target_article_id]),
      ),
    [visibleProposedEdges],
  );

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const matchingNodes = useMemo(
    () =>
      data.nodes
        .filter((node) => matchesQuery(node, normalizedQuery))
        .sort((left, right) => nodeDegree(right) - nodeDegree(left)),
    [data.nodes, normalizedQuery],
  );
  const activeIds = useMemo(
    () =>
      new Set(
        data.nodes
          .filter(
            (node) =>
              matchesFilter(node, effectiveFilter, preparedNodeIds) &&
              matchesQuery(node, normalizedQuery),
          )
          .map((node) => node.article_id),
      ),
    [data.nodes, effectiveFilter, normalizedQuery, preparedNodeIds],
  );
  const selectedNode = selectedArticleId === null ? undefined : nodeById.get(selectedArticleId);

  const selectedConnections = useMemo(() => {
    if (selectedArticleId === null) {
      return { activeIncoming: [], activeOutgoing: [], preparedIncoming: [], preparedOutgoing: [] };
    }
    const active = connectedNodes(data.edges, selectedArticleId, nodeById);
    const prepared = connectedNodes(visibleProposedEdges, selectedArticleId, nodeById);
    return {
      activeIncoming: active.incoming,
      activeOutgoing: active.outgoing,
      preparedIncoming: prepared.incoming,
      preparedOutgoing: prepared.outgoing,
    };
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

  const coreIdList = useMemo(
    () => data.nodes.filter((node) => layout.coreIds.has(node.article_id)).map((node) => node.article_id),
    [data.nodes, layout.coreIds],
  );
  const isolatedNodes = useMemo(
    () => data.nodes.filter((node) => layout.haloIds.has(node.article_id)),
    [data.nodes, layout.haloIds],
  );
  const haloIdList = useMemo(
    () => isolatedNodes.map((node) => node.article_id),
    [isolatedNodes],
  );
  const isolatedPreviewNodes = useMemo(
    () =>
      isolatedNodes
        .slice()
        .sort((left, right) => nodeDegree(right) - nodeDegree(left))
        .slice(0, 8),
    [isolatedNodes],
  );
  const denseHalo = haloIdList.length > HALO_MARKER_LIMIT;
  const denseHaloPath = useMemo(
    () =>
      denseHalo
        ? haloIdList
            .map((articleId) => layout.positions.get(articleId))
            .filter((point): point is MapPoint => point !== undefined)
            .map(markerPath)
            .join("")
        : "",
    [denseHalo, haloIdList, layout.positions],
  );

  const tabbableIds = useMemo(() => {
    const focused =
      normalizedQuery.length > 0 || effectiveFilter !== "all"
        ? matchingNodes.filter((node) => matchesFilter(node, effectiveFilter, preparedNodeIds))
        : data.nodes
            .filter((node) => layout.coreIds.has(node.article_id))
            .sort((left, right) => nodeDegree(right) - nodeDegree(left));
    return new Set(focused.slice(0, TAB_LIMIT).map((node) => node.article_id));
  }, [data.nodes, effectiveFilter, layout.coreIds, matchingNodes, normalizedQuery, preparedNodeIds]);

  // ---------------------------------------------------------------- camera
  const aspect = frame.height > 0 ? frame.width / frame.height : FALLBACK_FRAME.width / FALLBACK_FRAME.height;
  const coreSpan = layout.focusRadius * 2;
  const worldSpan = layout.worldRadius * 2;
  const fitScale = clamp(coreSpan / worldSpan, 0.04, 1);
  const minScale = Math.min(fitScale, 1);
  /** The zoom at which the isolated rim is fully lit. */
  const haloFullScale = clamp(fitScale * 1.3, 0.12, 0.92);

  const haloRevealAt = useCallback(
    (scale: number) => {
      if (layout.coreIds.size === 0 || layout.haloIds.size === 0) return 1;
      const span = Math.max(1 - haloFullScale, 0.08);
      // Never fully dark: a trace of the rim at the opening frame is the
      // invitation to go looking for it.
      return clamp((1 - scale) / span, 0.09, 1);
    },
    [haloFullScale, layout.coreIds.size, layout.haloIds.size],
  );

  const writeViewport = useCallback(
    (view: Viewport) => {
      const svg = svgRef.current;
      if (!svg) return;
      const span = frameSpan(geometryRef.current.coreSpan, view.scale, geometryRef.current.aspect);
      svg.setAttribute(
        "viewBox",
        view.x - span.width / 2 + " " + (view.y - span.height / 2) + " " + span.width + " " + span.height,
      );
      svg.style.setProperty("--graph-halo", haloRevealAt(view.scale).toFixed(3));
    },
    [haloRevealAt],
  );

  const finishCamera = useCallback(() => {
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    animationRef.current = 0;
    const target = animationTargetRef.current;
    animationTargetRef.current = null;
    if (target) {
      shownRef.current = target;
      writeViewport(target);
    }
    frameElementRef.current?.classList.remove("is-moving");
  }, [writeViewport]);

  const moveCamera = useCallback(
    (target: Viewport, duration: number) => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      animationRef.current = 0;
      const from = shownRef.current;
      const element = frameElementRef.current;
      animationTargetRef.current = target;
      if (
        duration <= 0 ||
        reducedMotion ||
        typeof requestAnimationFrame === "undefined" ||
        (typeof document !== "undefined" && document.hidden)
      ) {
        shownRef.current = target;
        writeViewport(target);
        animationTargetRef.current = null;
        element?.classList.remove("is-moving");
        return;
      }

      const start = performance.now();
      element?.classList.add("is-moving");
      const step = (now: number) => {
        const progress = clamp((now - start) / duration, 0, 1);
        // Exponential ease-out, the system's `ease-settle`: the camera
        // decelerates into place and never overshoots.
        const eased = progress >= 1 ? 1 : 1 - Math.pow(2, -10 * progress);
        shownRef.current = {
          x: from.x + (target.x - from.x) * eased,
          y: from.y + (target.y - from.y) * eased,
          // Zoom interpolates geometrically, so a 4× move reads as one steady
          // movement rather than a lurch followed by a crawl.
          scale: from.scale * Math.pow(target.scale / from.scale, eased),
        };
        writeViewport(shownRef.current);
        if (progress < 1) {
          animationRef.current = requestAnimationFrame(step);
          return;
        }
        shownRef.current = target;
        writeViewport(target);
        animationRef.current = 0;
        animationTargetRef.current = null;
        element?.classList.remove("is-moving");
      };
      animationRef.current = requestAnimationFrame(step);
    },
    [reducedMotion, writeViewport],
  );

  useEffect(() => {
    const finishWhenHidden = () => {
      if (document.hidden) finishCamera();
    };
    document.addEventListener("visibilitychange", finishWhenHidden);
    return () => document.removeEventListener("visibilitychange", finishWhenHidden);
  }, [finishCamera]);

  // Declared before the camera: a resize or a new snapshot changes what one map
  // unit is worth on screen, and the camera writes through this.
  useLayoutEffect(() => {
    geometryRef.current = { aspect, coreSpan };
    if (animationRef.current === 0) writeViewport(shownRef.current);
  }, [aspect, coreSpan, writeViewport]);

  useLayoutEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      // The opening move states the model: the whole site, then in to the part
      // of it that holds together.
      shownRef.current = { scale: minScale, x: 0, y: 0 };
      writeViewport(shownRef.current);
      moveCamera(viewport, INTRO_MS);
      return;
    }
    moveCamera(viewport, CAMERA_MS);
  }, [minScale, moveCamera, viewport, writeViewport]);

  useLayoutEffect(() => {
    const element = frameElementRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const box = entries[0]?.contentRect;
      if (!box || box.width === 0 || box.height === 0) return;
      setFrame((current) =>
        Math.abs(current.width - box.width) < 1 && Math.abs(current.height - box.height) < 1
          ? current
          : { height: box.height, width: box.width },
      );
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(
    () => () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      animationRef.current = 0;
      animationTargetRef.current = null;
    },
    [],
  );

  const clampViewport = useCallback(
    (view: Viewport): Viewport => ({
      scale: clamp(view.scale, minScale, MAX_SCALE),
      x: clamp(view.x, -layout.worldRadius, layout.worldRadius),
      y: clamp(view.y, -layout.worldRadius, layout.worldRadius),
    }),
    [layout.worldRadius, minScale],
  );

  const zoomBy = useCallback(
    (factor: number, anchor?: { x: number; y: number }) => {
      setViewport((current) => {
        const scale = clamp(current.scale * factor, minScale, MAX_SCALE);
        if (!anchor || scale === current.scale) return clampViewport({ ...current, scale });
        const span = frameSpan(coreSpan, current.scale, aspect);
        const world = {
          x: current.x - span.width / 2 + (anchor.x / frame.width) * span.width,
          y: current.y - span.height / 2 + (anchor.y / frame.height) * span.height,
        };
        const ratio = current.scale / scale;
        return clampViewport({
          scale,
          x: world.x + (current.x - world.x) * ratio,
          y: world.y + (current.y - world.y) * ratio,
        });
      });
    },
    [aspect, clampViewport, coreSpan, frame.height, frame.width, minScale],
  );

  /** Put a set of pages in the frame, whatever it costs in zoom. */
  const framePoints = useCallback(
    (points: MapPoint[]) => {
      if (points.length === 0) return;
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      points.forEach((point) => {
        minX = Math.min(minX, point.x);
        maxX = Math.max(maxX, point.x);
        minY = Math.min(minY, point.y);
        maxY = Math.max(maxY, point.y);
      });
      const needWidth = Math.max((maxX - minX) * 1.25, 200);
      const needHeight = Math.max((maxY - minY) * 1.25, 200);
      const shortSide =
        aspect >= 1
          ? Math.max(needHeight, needWidth / aspect)
          : Math.max(needWidth, needHeight * aspect);
      setViewport(
        clampViewport({
          scale: coreSpan / shortSide,
          x: (minX + maxX) / 2,
          y: (minY + maxY) / 2,
        }),
      );
    },
    [aspect, clampViewport, coreSpan],
  );

  const showWholeSite = useCallback(() => {
    setViewport(clampViewport({ scale: minScale, x: 0, y: 0 }));
  }, [clampViewport, minScale]);

  const showCore = useCallback(() => {
    setViewport(clampViewport({ scale: 1, x: 0, y: 0 }));
  }, [clampViewport]);

  /** Bring a page into the frame — and into the light, if it is on the rim. */
  const revealArticle = useCallback(
    (articleId: number) => {
      const point = layout.positions.get(articleId);
      if (!point) return;
      const onRim = layout.haloIds.has(articleId);
      setViewport((current) => {
        const screen = projectPoint(point, current, coreSpan, aspect, frame);
        const inside =
          screen.x > frame.width * 0.14 &&
          screen.x < frame.width * 0.86 &&
          screen.y > frame.height * 0.14 &&
          screen.y < frame.height * 0.86;
        const scale = onRim ? Math.min(current.scale, haloFullScale) : current.scale;
        if (inside && scale === current.scale) return current;
        return clampViewport({ scale, x: point.x, y: point.y });
      });
    },
    [aspect, clampViewport, coreSpan, frame, haloFullScale, layout.haloIds, layout.positions],
  );

  // ------------------------------------------------------------- selection
  const selectNode = useCallback((articleId: number) => {
    setSelectedArticleId(articleId);
    setSelectedGroup(null);
    setSelectedEdgeKey(null);
  }, []);

  const openArticle = useCallback(
    (articleId: number) => {
      selectNode(articleId);
      revealArticle(articleId);
    },
    [revealArticle, selectNode],
  );

  const selectEdge = useCallback(
    (edge: GraphNetworkEdge) => {
      setSelectedEdgeKey(edgeKey(edge.source_article_id, edge.target_article_id));
      setSelectedGroup(null);
      setSelectedArticleId(edge.target_article_id);
    },
    [],
  );

  const selectIsolatedGroup = useCallback(() => {
    setSelectedArticleId(null);
    setSelectedGroup("isolated");
    setSelectedEdgeKey(null);
    showWholeSite();
  }, [showWholeSite]);

  const clearSelection = useCallback(() => {
    setSelectedArticleId(null);
    setSelectedGroup(null);
    setSelectedEdgeKey(null);
  }, []);

  const setNetworkFilter = (nextFilter: NetworkFilter) => {
    setFilter(nextFilter);
    setSelectedArticleId(null);
    setSelectedGroup(null);
    setSelectedEdgeKey(null);
    if (nextFilter === "all") {
      showCore();
      return;
    }
    // The camera follows the question: filtering for orphans is asking to be
    // shown the rim, and the answer should not be waiting off-screen.
    const points = data.nodes
      .filter((node) => matchesFilter(node, nextFilter, preparedNodeIds))
      .map((node) => layout.positions.get(node.article_id))
      .filter((point): point is MapPoint => point !== undefined);
    framePoints(points);
  };

  // ------------------------------------------------------------ pointer map
  const onPointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return;
    dragRef.current = {
      moved: false,
      origin: shownRef.current,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
    };
    frameElementRef.current?.classList.add("is-moving");
  };

  const onPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - drag.x;
    const deltaY = event.clientY - drag.y;
    if (!drag.moved && Math.hypot(deltaX, deltaY) < 4) return;
    if (!drag.moved) {
      drag.moved = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    const span = frameSpan(coreSpan, drag.origin.scale, aspect);
    const next = clampViewport({
      scale: drag.origin.scale,
      x: drag.origin.x - (deltaX / Math.max(frame.width, 1)) * span.width,
      y: drag.origin.y - (deltaY / Math.max(frame.height, 1)) * span.height,
    });
    shownRef.current = next;
    writeViewport(next);
  };

  const onPointerUp = (event: React.PointerEvent<SVGSVGElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    frameElementRef.current?.classList.remove("is-moving");
    if (drag.moved) setViewport(shownRef.current);
  };

  // A drag that ends over a page must not also select it.
  const onClickCapture = (event: React.MouseEvent<SVGSVGElement>) => {
    if (dragRef.current?.moved) {
      event.stopPropagation();
      event.preventDefault();
    }
  };

  const onPointerOver = (event: React.PointerEvent<SVGSVGElement>) => {
    const target = (event.target as Element).closest?.("[data-article-id]");
    const articleId = target ? Number(target.getAttribute("data-article-id")) : null;
    setHoveredArticleId((current) =>
      current === articleId || Number.isNaN(articleId) ? current : articleId,
    );
  };

  const onPointerLeave = () => setHoveredArticleId(null);

  // ---------------------------------------------------------------- titles
  const labels = useMemo(() => {
    const haloLit = haloRevealAt(viewport.scale) > 0.4;
    const anchors = new Map<number, LabelAnchor>();
    const inFrame: { articleId: number; degree: number }[] = [];

    data.nodes.forEach((node) => {
      const point = layout.positions.get(node.article_id);
      if (!point) return;
      const onRim = layout.haloIds.has(node.article_id);
      if (denseHalo && onRim) return;
      const screen = projectPoint(point, viewport, coreSpan, aspect, frame);
      if (
        screen.x < -40 ||
        screen.y < -40 ||
        screen.x > frame.width + 40 ||
        screen.y > frame.height + 40
      ) {
        return;
      }
      const radius = (onRim ? HALO_MARKER_SIZE : markerSize(node)) / 2 + 2;
      anchors.set(node.article_id, { radius, x: screen.x, y: screen.y });
      const readable = onRim ? haloLit || node.article_id === selectedArticleId : true;
      if (readable) inFrame.push({ articleId: node.article_id, degree: nodeDegree(node) });
    });

    const candidates: LabelCandidate[] = [];
    const seen = new Set<number>();
    const push = (articleId: number | null, forced = false) => {
      if (articleId === null || seen.has(articleId)) return;
      const node = nodeById.get(articleId);
      if (!node || !anchors.has(articleId)) return;
      seen.add(articleId);
      candidates.push({ articleId, forced, text: truncateTitle(node.article_title) });
    };

    // A selected or pointed-at page is always named, at any zoom: that is the
    // answer to "which one is this?", and it is the only title the editor asked
    // for by hand.
    push(selectedArticleId, true);
    push(hoveredArticleId, true);
    selectedNeighborIds.forEach((articleId) => push(articleId));
    if (normalizedQuery.length > 0 || effectiveFilter !== "all") {
      matchingNodes
        .filter((node) => matchesFilter(node, effectiveFilter, preparedNodeIds))
        .forEach((node) => push(node.article_id));
    }
    inFrame
      .sort((left, right) => right.degree - left.degree)
      .forEach((entry) => push(entry.articleId));

    const limit = showNames && viewport.scale >= LABEL_MIN_SCALE ? MAX_LABELS : 0;
    return placeMapLabels({
      anchors,
      candidates,
      height: frame.height,
      limit,
      width: frame.width,
    });
  }, [
    aspect,
    coreSpan,
    data.nodes,
    denseHalo,
    effectiveFilter,
    frame,
    haloRevealAt,
    hoveredArticleId,
    layout.haloIds,
    layout.positions,
    matchingNodes,
    nodeById,
    normalizedQuery,
    preparedNodeIds,
    selectedArticleId,
    selectedNeighborIds,
    showNames,
    viewport,
  ]);

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

  const haloForced =
    selectedGroup === "isolated" ||
    (selectedArticleId !== null && layout.haloIds.has(selectedArticleId)) ||
    ((normalizedQuery.length > 0 || effectiveFilter !== "all") &&
      isolatedNodes.some((node) => activeIds.has(node.article_id)));
  const haloVisible = haloForced || haloRevealAt(viewport.scale) > 0.2;

  const mapSummary =
    data.article_count.toLocaleString() +
    " pages and " +
    data.edge_count.toLocaleString() +
    " internal links. " +
    (visibleProposedEdges.length > 0
      ? `${visibleProposedEdges.length.toLocaleString()} prepared internal ${
          visibleProposedEdges.length === 1 ? "link is" : "links are"
        } overlaid. `
      : "") +
    data.orphan_count.toLocaleString() +
    " orphans, " +
    data.underlinked_count.toLocaleString() +
    " underlinked pages, " +
    data.hub_count.toLocaleString() +
    " hubs, and " +
    data.saturated_count.toLocaleString() +
    " saturated pages.";

  const isolatedCount = isolatedNodes.length;
  const statCells: { label: string; tone?: string; value: string }[] = [
    { label: "Pages", value: data.article_count.toLocaleString() },
    { label: "Internal links", value: data.edge_count.toLocaleString() },
    ...(visibleProposedEdges.length > 0
      ? [
          {
            label: "Prepared links",
            tone: "text-primary",
            value: visibleProposedEdges.length.toLocaleString(),
          },
        ]
      : []),
    { label: "Linked core", value: layout.coreIds.size.toLocaleString() },
    { label: "Isolated pages", value: isolatedCount.toLocaleString() },
  ];

  return (
    <section
      aria-label="Site network"
      aria-describedby="site-network-description"
      className="mt-5 border-t border-hairline pt-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-caption-upper uppercase text-muted">Site overview</p>
          <h3 className="mt-1.5 text-title-md font-medium text-ink">The whole site as one map</h3>
          <p className="mt-1.5 max-w-2xl text-caption-sm leading-normal text-muted">
            Pages that carry an internal link — live or prepared — hold the centre. Pages that carry
            none are scattered around them. Zoom out to bring that rim into the frame.
          </p>
        </div>
        <span className="flex-none text-caption-sm text-muted">
          {snapshotLabel(data.computed_at)}
        </span>
      </div>

      {/* Flex rather than a grid: the strip gains a cell when a batch is
          prepared, and a fixed column count would leave a hole on the row. */}
      <dl className="mt-4 flex flex-wrap gap-px overflow-hidden rounded-lg border border-hairline bg-hairline">
        {statCells.map((cell) => (
          <div key={cell.label} className="min-w-36 flex-1 bg-surface-card px-3 py-2.5">
            <dt className="text-caption-sm text-muted">{cell.label}</dt>
            <dd className={"mt-0.5 text-title-sm tabular-nums " + (cell.tone ?? "text-ink")}>
              {cell.value}
            </dd>
          </div>
        ))}
      </dl>
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
            {matchingNodes.length.toLocaleString()} {matchingNodes.length === 1 ? "page" : "pages"}{" "}
            match
          </span>
          {matchingNodes.slice(0, 6).map((node) => (
            <button
              key={node.article_id}
              type="button"
              className="btn btn-outline btn-sm max-w-full truncate"
              title={node.article_title}
              onClick={() => openArticle(node.article_id)}
            >
              {truncateTitle(node.article_title, 34)}
            </button>
          ))}
        </div>
      )}

      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0">
          {data.nodes.length > 0 ? (
            <div
              ref={frameElementRef}
              className="graph-map relative h-[clamp(24rem,56vh,40rem)] overflow-hidden rounded-xl border border-hairline bg-canvas-soft"
            >
              <svg
                ref={svgRef}
                role="group"
                aria-label="Full site network map"
                className="graph-world absolute inset-0 h-full w-full cursor-grab touch-none active:cursor-grabbing"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                onPointerOver={onPointerOver}
                onPointerLeave={onPointerLeave}
                onClickCapture={onClickCapture}
              >
                <title>Full site network map</title>
                <desc>{mapSummary}</desc>
                <defs>
                  <radialGradient id="graph-lens-core-glow">
                    <stop offset="0%" stopColor="rgb(var(--c-orb-sky))" stopOpacity="0.34" />
                    <stop offset="65%" stopColor="rgb(var(--c-orb-lavender))" stopOpacity="0.12" />
                    <stop offset="100%" stopColor="rgb(var(--c-orb-lavender))" stopOpacity="0" />
                  </radialGradient>
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

                {layout.coreIds.size > 0 && (
                  <g aria-hidden="true" className="graph-atmosphere">
                    <circle
                      cx="0"
                      cy="0"
                      r={layout.coreRadius * 1.15}
                      fill="url(#graph-lens-core-glow)"
                    />
                    <circle
                      className="graph-core-ring"
                      cx="0"
                      cy="0"
                      r={layout.coreRadius}
                      fill="none"
                      stroke="rgb(var(--c-hairline-strong))"
                      strokeWidth="1"
                      strokeDasharray="4 8"
                      vectorEffect="non-scaling-stroke"
                    />
                  </g>
                )}

                <MapEdges
                  activeIds={activeIds}
                  edges={data.edges}
                  nodeById={nodeById}
                  onSelectEdge={selectEdge}
                  positions={layout.positions}
                  preparedEdges={visibleProposedEdges}
                  selectedArticleId={selectedArticleId}
                  selectedEdgeKey={selectedEdgeKey}
                  showDirection={showDirection}
                />

                <g
                  className="graph-halo"
                  aria-label="Isolated pages"
                  pointerEvents={haloVisible ? undefined : "none"}
                  style={{ "--graph-halo-force": haloForced ? 1 : 0 } as React.CSSProperties}
                >
                  {denseHalo ? (
                    <path
                      aria-hidden="true"
                      d={denseHaloPath}
                      stroke={STATUS_COLOR.orphan}
                      strokeWidth={HALO_MARKER_SIZE}
                      strokeLinecap="round"
                      strokeOpacity="0.75"
                      vectorEffect="non-scaling-stroke"
                      pointerEvents="none"
                    />
                  ) : (
                    <MapNodes
                      activeIds={activeIds}
                      ids={haloIdList}
                      neighborIds={selectedNeighborIds}
                      nodeById={nodeById}
                      onSelect={selectNode}
                      positions={layout.positions}
                      selectedArticleId={selectedArticleId}
                      tabbableIds={tabbableIds}
                      variant="halo"
                    />
                  )}
                </g>

                <g aria-label="Pages">
                  <MapNodes
                    activeIds={activeIds}
                    ids={coreIdList}
                    neighborIds={selectedNeighborIds}
                    nodeById={nodeById}
                    onSelect={selectNode}
                    positions={layout.positions}
                    selectedArticleId={selectedArticleId}
                    tabbableIds={tabbableIds}
                    variant="core"
                  />
                </g>
              </svg>

              {/* Titles live in their own layer, in screen pixels: they keep one
                  size at every zoom, and they are hidden while the camera moves
                  so the map is never read through drifting text. */}
              <svg
                aria-hidden="true"
                className="graph-labels pointer-events-none absolute inset-0 h-full w-full"
                viewBox={"0 0 " + frame.width + " " + frame.height}
              >
                {labels.map((label) => (
                  <g key={label.articleId}>
                    <line
                      x1={label.connector.x1}
                      y1={label.connector.y1}
                      x2={label.connector.x2}
                      y2={label.connector.y2}
                      stroke="rgb(var(--c-hairline-strong))"
                      strokeWidth="1"
                    />
                    <rect
                      x={label.plate.x}
                      y={label.plate.y}
                      width={label.plate.width}
                      height={label.plate.height}
                      rx="6"
                      fill="rgb(var(--c-surface-card))"
                      fillOpacity="0.94"
                      stroke="rgb(var(--c-hairline))"
                      strokeWidth="1"
                    />
                    <text
                      x={label.textX}
                      y={label.textY}
                      fill="rgb(var(--c-ink))"
                      fontSize="12"
                      fontWeight="500"
                    >
                      {label.text}
                    </text>
                  </g>
                ))}
              </svg>

              <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="pointer-events-auto flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-hairline bg-surface-card/90 px-2.5 py-1.5 backdrop-blur-sm">
                    {LEGEND_STATUSES.map((status) => (
                      <span
                        key={status}
                        className="inline-flex items-center gap-1.5 text-caption-sm text-muted"
                        title={STATUS_DESCRIPTION[status]}
                      >
                        <span
                          aria-hidden="true"
                          className="h-2.5 w-2.5 flex-none rounded-sm border"
                          style={{
                            backgroundColor: STATUS_FILL[status],
                            borderColor: STATUS_COLOR[status],
                          }}
                        />
                        {STATUS_LABEL[status]}
                      </span>
                    ))}
                  </div>

                  <div
                    className="pointer-events-auto flex flex-none items-center gap-1 rounded-lg border border-hairline bg-surface-card/90 p-1 backdrop-blur-sm"
                    role="group"
                    aria-label="Network view controls"
                  >
                    <button
                      type="button"
                      className="btn btn-outline btn-sm h-8 w-8 border-transparent p-0"
                      aria-label="Zoom out"
                      onClick={() => zoomBy(1 / ZOOM_STEP)}
                    >
                      <ZoomIcon mode="out" />
                    </button>
                    <span className="min-w-11 text-center text-caption-sm tabular-nums text-muted">
                      {Math.round(viewport.scale * 100)}%
                    </span>
                    <button
                      type="button"
                      className="btn btn-outline btn-sm h-8 w-8 border-transparent p-0"
                      aria-label="Zoom in"
                      onClick={() => zoomBy(ZOOM_STEP)}
                    >
                      <ZoomIcon mode="in" />
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline btn-sm h-8 w-8 border-transparent p-0"
                      aria-label="Fit whole site"
                      title="Fit whole site"
                      onClick={showWholeSite}
                    >
                      <FitIcon />
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline btn-sm h-8 w-8 border-transparent p-0"
                      aria-label="Reset zoom"
                      title="Back to the linked core"
                      onClick={showCore}
                    >
                      <ResetZoomIcon />
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-end justify-between gap-2">
                  {isolatedCount > 0 ? (
                    <button
                      type="button"
                      aria-pressed={selectedGroup === "isolated"}
                      aria-label={
                        isolatedCount.toLocaleString() +
                        " isolated pages. " +
                        (haloVisible ? "In frame." : "Zoom out to see them.")
                      }
                      onClick={selectIsolatedGroup}
                      className={
                        "pointer-events-auto inline-flex items-center gap-2 rounded-pill border px-3 py-1.5 text-caption-sm transition-[background-color,border-color] duration-state ease-settle " +
                        (selectedGroup === "isolated"
                          ? "border-ink bg-surface-card text-ink"
                          : "border-hairline bg-surface-card/90 text-muted hover:border-hairline-strong hover:text-ink")
                      }
                    >
                      <span
                        aria-hidden="true"
                        className="h-2 w-2 flex-none rounded-sm"
                        style={{ backgroundColor: STATUS_COLOR.orphan }}
                      />
                      {isolatedCount.toLocaleString()} isolated{" "}
                      {isolatedCount === 1 ? "page" : "pages"}
                      <span className="text-muted-soft">
                        {haloVisible ? "in frame" : "· zoom out"}
                      </span>
                    </button>
                  ) : (
                    <span />
                  )}

                  <div className="pointer-events-auto flex flex-none items-center gap-1 rounded-lg border border-hairline bg-surface-card/90 p-1 backdrop-blur-sm">
                    <button
                      type="button"
                      className="btn btn-outline btn-sm border-transparent"
                      aria-pressed={showNames}
                      onClick={() => setShowNames((current) => !current)}
                    >
                      {showNames ? "Names on" : "Names off"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline btn-sm border-transparent"
                      aria-pressed={showDirection}
                      onClick={() => setShowDirection((current) => !current)}
                    >
                      {showDirection ? "Direction on" : "Direction off"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex min-h-80 items-center justify-center rounded-xl border border-hairline bg-canvas-soft text-caption-sm text-muted">
              No active pages are available for this site.
            </div>
          )}

          <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-caption-sm text-muted">
            <span>
              {normalizedQuery.length > 0
                ? "Showing search results across " + data.article_count.toLocaleString() + " pages."
                : !showNames
                  ? "Titles are off. Point at a page, or select one, to name it."
                  : viewport.scale < LABEL_MIN_SCALE
                    ? "Titles are off at this distance. Zoom in, or point at a page to name it."
                    : "Drag to pan, zoom to travel. Titles appear where they fit without covering the map."}
            </span>
            {denseHalo && (
              <span>
                Isolated pages are drawn as a field at this size — use search to open one.
              </span>
            )}
          </div>

          <details className="mt-2 rounded-lg border border-hairline bg-canvas-soft px-3 py-2">
            <summary className="cursor-pointer text-caption-sm font-medium text-ink">
              How to read this map
            </summary>
            <p className="mt-2 text-caption-sm leading-normal text-muted">
              Every marker is a page, sized by how many internal links it carries. Lines are internal
              links and arrowheads show their direction; dashed lines are prepared links that are not
              published yet. The dotted circle is the edge of the linked core: everything outside it
              is a page no internal link reaches.
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

          {data.nodes.length > 0 && data.edges.length === 0 && visibleProposedEdges.length === 0 && (
            <p className="mt-2 text-caption-sm text-muted">
              No internal links are recorded yet, so the whole site is drawn as isolated pages — its
              current orphan and underlinked candidates.
            </p>
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
                    {isolatedCount.toLocaleString()} pages have no active or prepared internal link.
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
                    onClick={() => openArticle(node.article_id)}
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
              {isolatedCount > isolatedPreviewNodes.length && (
                <p className="mt-3 text-caption-sm text-muted">
                  Showing {isolatedPreviewNodes.length} of {isolatedCount.toLocaleString()}. Use
                  search to find a specific page.
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
                <button type="button" className="btn btn-outline btn-sm" onClick={clearSelection}>
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
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="inline-flex rounded-pill bg-surface-strong px-2.5 py-1 text-caption-sm font-medium text-ink">
                  {STATUS_LABEL[nodeStatus(selectedNode)]}
                </span>
                <span className="inline-flex rounded-pill border border-hairline px-2.5 py-1 text-caption-sm text-muted">
                  {layout.haloIds.has(selectedNode.article_id) ? "Isolated" : "In the linked core"}
                </span>
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
                <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => revealArticle(selectedNode.article_id)}
                >
                  Centre on map
                </button>
              </div>
              <div className="mt-4 space-y-3 text-caption-sm">
                <ConnectionList
                  label="Active links to"
                  nodes={selectedConnections.activeOutgoing}
                  emptyLabel="No active outgoing links recorded."
                  onSelect={openArticle}
                />
                {selectedConnections.preparedOutgoing.length > 0 && (
                  <ConnectionList
                    label="Prepared links to"
                    nodes={selectedConnections.preparedOutgoing}
                    emptyLabel="No prepared outgoing links."
                    onSelect={openArticle}
                  />
                )}
                <ConnectionList
                  label="Active links from"
                  nodes={selectedConnections.activeIncoming}
                  emptyLabel="No active incoming links recorded."
                  onSelect={openArticle}
                />
                {selectedConnections.preparedIncoming.length > 0 && (
                  <ConnectionList
                    label="Prepared links from"
                    nodes={selectedConnections.preparedIncoming}
                    emptyLabel="No prepared incoming links."
                    onSelect={openArticle}
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
                  Select a page to inspect its structural signal, URL, and neighboring links.
                </p>
              )}
              {isolatedCount > 0 && (
                <button
                  type="button"
                  className="btn btn-outline btn-sm mt-2"
                  onClick={selectIsolatedGroup}
                >
                  Show the isolated rim
                </button>
              )}
            </>
          )}
        </aside>
      </div>

      <p className="sr-only" id="site-network-description">
        {mapSummary} Select a page in the map to inspect its title, structural status, and incoming
        and outgoing links.
      </p>
    </section>
  );
}

import type { AgentChatContext } from "../../api/agent";

export interface AgentPromptSuggestion {
  label: string;
  prompt: string;
}

export type AgentSurface =
  | "dashboard"
  | "review_queue"
  | "selected_links"
  | "publication"
  | "sites"
  | "content_pool"
  | "evaluation"
  | "traceability"
  | "access";

export interface AgentViewContext extends AgentChatContext {
  href: string;
  suggestions: readonly AgentPromptSuggestion[];
}

const DEFAULT_SUGGESTIONS: readonly AgentPromptSuggestion[] = [
  { label: "Review queue", prompt: "How many suggestions are pending?" },
  { label: "Running jobs", prompt: "What jobs are running?" },
  { label: "Publication", prompt: "What's blocking publication?" },
];

const SUGGESTIONS: Record<AgentSurface, readonly AgentPromptSuggestion[]> = {
  dashboard: DEFAULT_SUGGESTIONS,
  review_queue: [
    { label: "Ageing queue", prompt: "Which pending suggestions are oldest?" },
    { label: "Ready to publish", prompt: "What can I publish now?" },
    { label: "Site blockers", prompt: "Which sites are blocking review?" },
  ],
  selected_links: [
    { label: "Exact edits", prompt: "How many selected links are ready for exact-edit review?" },
    { label: "Publication", prompt: "Which selected links can I publish now?" },
    { label: "Review gaps", prompt: "What still needs a decision?" },
  ],
  publication: [
    { label: "Ready now", prompt: "Which publication changes are ready now?" },
    { label: "Blocked edits", prompt: "What is blocking publication?" },
    { label: "Next change", prompt: "What should I review next?" },
  ],
  sites: [
    { label: "Site health", prompt: "Which sites need attention?" },
    { label: "Running jobs", prompt: "What jobs are running?" },
    { label: "Crawl next", prompt: "Which site should I crawl next?" },
  ],
  content_pool: [
    { label: "Source health", prompt: "Which content-pool sources need attention?" },
    { label: "Batch readiness", prompt: "Which sources are ready for a batch?" },
    { label: "Failed imports", prompt: "Are any source imports failing?" },
  ],
  evaluation: [
    { label: "Acceptance", prompt: "How is editorial acceptance trending?" },
    { label: "Best sites", prompt: "Which sites have the strongest suggestion quality?" },
    { label: "Review impact", prompt: "How is editor feedback changing the ranking?" },
  ],
  traceability: [
    { label: "Recent changes", prompt: "What changed most recently?" },
    { label: "Audit trail", prompt: "Which actions need an audit review?" },
    { label: "Queue impact", prompt: "Which changes are visible in the review queue?" },
  ],
  access: [
    { label: "Access review", prompt: "Who currently has dashboard access?" },
    { label: "Administrators", prompt: "Who has administrator access?" },
    { label: "Pending access", prompt: "Are any access requests waiting?" },
  ],
};

const STATUS_LABELS: Record<string, string> = {
  all: "All statuses",
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
  applying: "Applying",
  applied: "Applied",
  expired: "Expired",
  failed: "Failed",
};

const ORIGIN_LABELS: Record<string, string> = {
  internal: "Internal links",
  content_pool: "Content pool",
  web_search: "Web search",
};

const readableSearch = (value: string | null) =>
  value && value.trim() ? `Search “${value.trim().slice(0, 40)}”` : null;

const surfaceFromPath = (pathname: string): AgentSurface => {
  if (pathname === "/queue") return "review_queue";
  if (pathname === "/selected") return "selected_links";
  if (pathname === "/publish" || pathname.startsWith("/publish/")) return "publication";
  if (pathname === "/sites") return "sites";
  if (pathname === "/content-pool") return "content_pool";
  if (pathname === "/evaluation") return "evaluation";
  if (pathname === "/traceability") return "traceability";
  if (pathname === "/access") return "access";
  return "dashboard";
};

const titleFromSurface: Record<AgentSurface, string> = {
  dashboard: "Dashboard",
  review_queue: "Review queue",
  selected_links: "Selected links",
  publication: "Publication",
  sites: "Sites",
  content_pool: "Content pool",
  evaluation: "Evaluation",
  traceability: "Traceability",
  access: "Access",
};

const detailsFor = (surface: AgentSurface, pathname: string, params: URLSearchParams) => {
  const parts: string[] = [];

  if (surface === "review_queue") {
    parts.push(STATUS_LABELS[params.get("status") ?? "pending"] ?? "Pending");
    const site = params.get("site");
    if (site) parts.push(`Site #${site}`);
    const search = readableSearch(params.get("q"));
    if (search) parts.push(search);
    const origin = params.get("origin");
    if (origin) parts.push(ORIGIN_LABELS[origin] ?? origin);
    if (params.get("unique") === "1") parts.push("Unique targets");
    const minimum = params.get("min");
    if (minimum && Number.isFinite(Number(minimum))) parts.push(`Score ≥ ${minimum}%`);
  } else if (surface === "publication" && pathname.startsWith("/publish/")) {
    const siteId = pathname.slice("/publish/".length).split("/")[0];
    if (siteId) parts.push(`Site #${siteId}`);
  } else {
    const site = params.get("site");
    if (site) parts.push(`Site #${site}`);
    const search = readableSearch(params.get("q"));
    if (search) parts.push(search);
  }

  return parts.length > 0 ? parts.join(" · ") : "No filters applied";
};

export const getAgentViewContext = (pathname: string, search = ""): AgentViewContext => {
  const safePath = pathname || "/";
  const surface = surfaceFromPath(safePath);
  const params = new URLSearchParams(search);
  const detail = detailsFor(surface, safePath, params);
  const scope = `${titleFromSurface[surface]} · ${detail}`;

  return {
    surface,
    path: safePath,
    search,
    scope,
    filters: Object.fromEntries(params.entries()),
    href: `${safePath}${search}`,
    suggestions: SUGGESTIONS[surface],
  };
};

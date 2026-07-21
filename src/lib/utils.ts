import type { SuggestionStatus } from "../types/suggestion";

export const pct = (n: number) => `${Math.round(n * 100)}%`;

export const initials = (name: string) =>
  name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

export const timeAgo = (iso: string | null) => {
  if (!iso) return "never";
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)} d ago`;
};

export const METHOD_LABEL: Record<string, string> = {
  baseline_cosine: "cosine",
};

export const STATUS_META: Record<
  SuggestionStatus,
  { label: string; dot: string; fg: string }
> = {
  pending: { label: "Pending review", dot: "bg-stone-400", fg: "text-stone-800" },
  approved: { label: "Queued for publish", dot: "bg-amber-500", fg: "text-amber-700" },
  rejected: { label: "Rejected", dot: "bg-red-600", fg: "text-red-600" },
  applying: { label: "Publishing", dot: "bg-blue-600", fg: "text-blue-700" },
  applied: { label: "Published live", dot: "bg-green-600", fg: "text-green-700" },
};

export const PUBLICATION_STATUS_MESSAGE: Partial<Record<SuggestionStatus, string>> = {
  approved: "Queued for the next publish batch. Not live yet.",
  applying: "Publishing is in progress.",
  applied: "Published to the live article.",
};

export const RQ_SCHEDULING_COPY = "Scheduled re-crawls run through RQ.";

// The prototype's pastel orbs — used for site avatars and KPI cards
export const ORBS = [
  "rgba(167,229,211,.45)",
  "rgba(244,197,168,.45)",
  "rgba(200,184,224,.45)",
  "rgba(168,200,232,.45)",
  "rgba(232,184,196,.45)",
];

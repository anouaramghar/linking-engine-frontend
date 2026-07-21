import type { SuggestionStatus } from "../types/suggestion";

/**
 * The whole-percent score an editor sees. Threshold rules compare against this
 * same value so a card labelled 80% is never swept up by a "below 80%" rule.
 */
export const scorePercent = (score: number) => Math.round(score * 100);

export const pct = (n: number) => `${scorePercent(n)}%`;

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
  // Text sits on the tinted chip fill, so these stay in the 800 range to clear
  // the 4.5:1 contrast minimum at the small sizes the badges use.
  pending: { label: "Pending review", dot: "bg-stone-400", fg: "text-stone-800" },
  approved: { label: "Queued for publish", dot: "bg-amber-500", fg: "text-amber-800" },
  rejected: { label: "Rejected", dot: "bg-red-600", fg: "text-red-800" },
  applying: { label: "Publishing", dot: "bg-blue-600", fg: "text-blue-800" },
  applied: { label: "Published live", dot: "bg-green-600", fg: "text-green-800" },
};

/** Once publishing starts the worker owns the row, so the decision is final. */
export const isReversible = (status: SuggestionStatus) =>
  status === "approved" || status === "rejected";

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

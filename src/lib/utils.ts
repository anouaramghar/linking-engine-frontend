import type { SuggestionStatus, SuggestionTargetOrigin } from "../types/suggestion";

/**
 * The whole-percent score an editor sees. Threshold rules compare against this
 * same value so a card labelled 80% is never swept up by a "below 80%" rule.
 */
export const scorePercent = (score: number) => Math.round(score * 100);

export const pct = (n: number) => `${scorePercent(n)}%`;

export const formatCount = (count: number) => new Intl.NumberFormat("en-US").format(count);

export const sitePlatformLabel = (platform: "wordpress" | "html" | "pool") => {
  if (platform === "wordpress") return "WP REST API";
  if (platform === "pool") return "Content pool";
  return "Sitemap crawl";
};

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
  hybrid_bm25: "hybrid BM25",
};

export const TARGET_ORIGIN_LABEL: Record<SuggestionTargetOrigin, string> = {
  internal: "Internal link",
  content_pool: "External link · Content pool",
};

/**
 * Status is carried by a dot beside its own text label, never by tinting the
 * label itself. The design system has exactly two chromatic semantics
 * ({colors.semantic-success} and {colors.semantic-error}); the in-between
 * states borrow ink and muted rather than inventing a warning hue, and
 * "Publishing" pulses because it is the only status that is still moving.
 */
export const STATUS_META: Record<SuggestionStatus, { label: string; dot: string }> = {
  pending: { label: "Pending review", dot: "bg-muted-soft" },
  // The wire value stays `approved`, but the editor still has to approve the
  // exact publication edit before anything is queued or written to the site.
  approved: { label: "Selected for review", dot: "bg-primary" },
  rejected: { label: "Rejected", dot: "bg-error" },
  applying: { label: "Publishing", dot: "bg-primary animate-pulse" },
  applied: { label: "Published live", dot: "bg-success" },
  expired: { label: "Expired", dot: "bg-muted-soft" },
  failed: { label: "Publishing failed", dot: "bg-error" },
};

/**
 * Once publishing starts the worker owns the row, so the decision is final —
 * except for a quarantined one, where sending it back to pending is the only
 * way an editor has of retrying it.
 */
export const isReversible = (status: SuggestionStatus) =>
  status === "approved" || status === "rejected" || status === "failed";

export const PUBLICATION_STATUS_MESSAGE: Partial<Record<SuggestionStatus, string>> = {
  approved: "Selected for review. Not scheduled and not live until its exact edit is approved.",
  applying: "Publishing is in progress.",
  applied: "Published to the live article.",
  failed: "Publishing failed repeatedly and stopped retrying. Undo to try again.",
};

export const RQ_SCHEDULING_COPY = "Scheduled re-crawls run through RQ.";

/**
 * The system's five atmospheric gradient stops — mint, peach, lavender, sky,
 * rose — expressed through theme tokens rather than a second copy of their
 * colour values. Keeping each complete class here also makes it visible to
 * Tailwind's scanner.
 */
const ORB_PLATE_CLASSES = [
  "bg-[radial-gradient(circle_at_30%_30%,theme(colors.orb-mint/45%),theme(colors.surface-strong))]",
  "bg-[radial-gradient(circle_at_30%_30%,theme(colors.orb-peach/45%),theme(colors.surface-strong))]",
  "bg-[radial-gradient(circle_at_30%_30%,theme(colors.orb-lavender/45%),theme(colors.surface-strong))]",
  "bg-[radial-gradient(circle_at_30%_30%,theme(colors.orb-sky/45%),theme(colors.surface-strong))]",
  "bg-[radial-gradient(circle_at_30%_30%,theme(colors.orb-rose/45%),theme(colors.surface-strong))]",
] as const;

/**
 * A {component.voice-icon-circular} plate, blooming one of the five stops over
 * {colors.surface-strong}. Sites cycle the palette by index, so a fleet reads
 * as one system rather than five unrelated badges.
 */
export const orbPlateClass = (index: number) =>
  ORB_PLATE_CLASSES[index % ORB_PLATE_CLASSES.length];

import type { SuggestionStatus, SuggestionTargetOrigin } from "../types/suggestion";

/**
 * The whole-percent score an editor sees. Threshold rules compare against this
 * same value so a card labelled 80% is never swept up by a "below 80%" rule.
 */
export const scorePercent = (score: number) => Math.round(score * 100);

export const pct = (n: number) => `${scorePercent(n)}%`;

const numberFormatter = new Intl.NumberFormat();
const relativeTimeFormatter = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

export const formatCount = (count: number) => numberFormatter.format(count);

export const downloadBlob = (blob: Blob, filename: string) => {
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();

  // Let the browser start the download before releasing the object URL. Some
  // browsers cancel the download when the URL is revoked in the same tick.
  window.setTimeout(() => URL.revokeObjectURL(href), 1_000);
};

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
  const seconds = (Date.now() - new Date(iso).getTime()) / 1000;
  if (!Number.isFinite(seconds)) return "unknown";
  const absoluteSeconds = Math.abs(seconds);
  if (absoluteSeconds < 60) return relativeTimeFormatter.format(Math.round(-seconds), "second");
  if (absoluteSeconds < 3600)
    return relativeTimeFormatter.format(Math.round(-seconds / 60), "minute");
  if (absoluteSeconds < 86400)
    return relativeTimeFormatter.format(Math.round(-seconds / 3600), "hour");
  return relativeTimeFormatter.format(Math.round(-seconds / 86400), "day");
};

export const METHOD_LABEL: Record<string, string> = {
  baseline_cosine: "cosine",
  hybrid_bm25: "hybrid BM25",
  external_search: "Web search",
};

export const TARGET_ORIGIN_LABEL: Record<SuggestionTargetOrigin, string> = {
  internal: "Internal link",
  content_pool: "External link · Content pool",
  web_search: "External link · Web search",
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
  applied: { label: "Published", dot: "bg-success" },
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

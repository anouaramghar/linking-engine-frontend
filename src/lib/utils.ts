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
  baseline_cosine: "Cosine baseline",
  hybrid_bm25: "Hybrid BM25",
  external_search: "Web search",
};

export const TARGET_ORIGIN_LABEL: Record<SuggestionTargetOrigin, string> = {
  internal: "Internal link",
  content_pool: "External link · Content pool",
  web_search: "External link · Web search",
};

/**
 * Status is carried by a dot beside its own text label, and now by the ground
 * the label sits on as well.
 *
 * The tint is a second channel, never the only one: every status below still
 * ships its dot and its full word, so nothing here depends on colour being
 * seen. What the tint buys is scanning speed — a column of identical grey pills
 * made an operator read the word to learn the state, on every row.
 *
 * `pending` and `expired` take no tint on purpose. A review queue is mostly
 * pending, so tinting it would spend the signal on the majority and leave the
 * four states worth noticing competing with a wall of colour.
 */
export const STATUS_META: Record<
  SuggestionStatus,
  { label: string; dot: string; tint: string }
> = {
  pending: { label: "Pending review", dot: "bg-muted-soft", tint: "" },
  // The wire value stays `approved`, but the editor still has to approve the
  // exact publication edit before anything is queued or written to the site.
  // Lavender rather than green: this is the selection ground the app already
  // uses for "chosen, not yet done", and a green here would claim the row is
  // published when it is only picked.
  approved: {
    label: "Selected for review",
    dot: "bg-primary",
    tint: "bg-tint-active",
  },
  rejected: { label: "Rejected", dot: "bg-error", tint: "bg-tint-negative" },
  applying: {
    label: "Publishing",
    dot: "bg-primary animate-pulse",
    tint: "bg-tint-progress",
  },
  applied: { label: "Published", dot: "bg-success", tint: "bg-tint-positive" },
  expired: { label: "Expired", dot: "bg-muted-soft", tint: "" },
  failed: {
    label: "Publishing failed",
    dot: "bg-error",
    tint: "bg-tint-negative",
  },
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
 * {colors.surface-strong}. Sites cycle the palette so a fleet reads as one
 * system rather than five unrelated badges.
 *
 * Keyed to the site's id, not its position in the list. Position was wrong in a
 * way that only showed up in use: the hue is the one thing on the row an
 * operator recognises before reading anything, and deleting a site or landing
 * on a differently-ordered response re-coloured every site below it. An id is
 * the only thing about a site that never moves, so it is what the colour hangs
 * on — and it is what lets the queue and the Sites page agree without passing
 * an index between two pages that sort differently.
 */
export const orbPlateClass = (siteId: number) =>
  ORB_PLATE_CLASSES[Math.abs(siteId) % ORB_PLATE_CLASSES.length];

/**
 * The same five stops as a wash across a header band rather than a filled
 * plate: the stop fades out by 55%, so the tint colours the edge the group
 * starts at and the text further along still sits on the plain soft canvas.
 *
 * Held at 10%. The band carries {colors.muted} caption text, and the wash is
 * drawn *under* it — at this strength the ground moves by about 0.15 of a
 * contrast point in either theme, which keeps the pairing above AA that
 * `theme.contrast.test.ts` measures against the untinted canvas.
 */
const ORB_WASH_CLASSES = [
  "bg-[linear-gradient(to_right,theme(colors.orb-mint/10%),transparent_55%)]",
  "bg-[linear-gradient(to_right,theme(colors.orb-peach/10%),transparent_55%)]",
  "bg-[linear-gradient(to_right,theme(colors.orb-lavender/10%),transparent_55%)]",
  "bg-[linear-gradient(to_right,theme(colors.orb-sky/10%),transparent_55%)]",
  "bg-[linear-gradient(to_right,theme(colors.orb-rose/10%),transparent_55%)]",
] as const;

/** The wash matching a site's plate, so one site reads as one hue everywhere. */
export const orbWashClass = (siteId: number) =>
  ORB_WASH_CLASSES[Math.abs(siteId) % ORB_WASH_CLASSES.length];

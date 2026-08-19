import type { AppAlert } from "../types/alert";

const JOB_DESTINATIONS: Record<string, string> = {
  analysis: "/queue",
  ingestion: "/sites",
  publication: "/publish",
  publication_preparation: "/publish",
};

export const notificationDestination = (alert: AppAlert) => {
  const kind = alert.payload.kind;
  const destination = typeof kind === "string" ? JOB_DESTINATIONS[kind] : undefined;
  if (!destination) return alert.site_id === null ? null : "/sites";
  if (destination === "/publish" && alert.site_id !== null) {
    return `/publish/${alert.site_id}`;
  }
  return destination;
};

export const notificationStatus = (alert: AppAlert) => {
  if (alert.kind === "job_partial" || alert.payload.outcome === "partial") return "partial";
  if (
    alert.kind === "job_failed" ||
    alert.kind === "job_lost" ||
    alert.kind === "job_stopped" ||
    alert.kind === "job_abandoned" ||
    alert.kind === "job_killed" ||
    alert.kind.includes("failed")
  ) {
    return "failed";
  }
  if (alert.kind === "job_succeeded" || alert.payload.outcome === "succeeded") {
    return "succeeded";
  }
  return "info";
};

/**
 * The row's headline.
 *
 * Subjects are written for Telegram, where "LinkMesh publication job failed"
 * has to name the product. Inside a panel already titled "Notifications" that
 * prefix is noise, but stripping it alone left every row opening on a
 * lowercase letter, which reads as a typo rather than as a sentence.
 */
export const notificationTitle = (subject: string) => {
  const stripped = subject.replace(/^LinkMesh\s+/i, "").trim();
  if (!stripped) return subject;
  return stripped.charAt(0).toUpperCase() + stripped.slice(1);
};

/**
 * The exact moment, for the row's tooltip and its `datetime` attribute.
 *
 * "2h ago" is the right thing to read while scanning and the wrong thing to
 * quote in a ticket, so the row carries both: the relative form in the text and
 * the timestamp under the pointer.
 */
export const formatNotificationTimestamp = (value: string) => {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "";
  return new Date(timestamp).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
};

export const formatNotificationTime = (value: string, now = Date.now()) => {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "recently";
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useAlerts } from "../hooks/useAlerts";
import {
  formatNotificationTime,
  formatNotificationTimestamp,
  notificationDestination,
  notificationStatus,
  notificationTitle,
} from "../lib/notifications";
import type { AppAlert } from "../types/alert";
import RailTip from "./RailTip";

/* The status is a word first and a colour second, the way every other status in
   this dashboard is drawn. The dot alone was the whole visible signal here: a
   sighted operator could not tell a completed publication from a failed one
   without reading the aria-label, which is the one channel they never see.

   Only failure takes coloured ink. A feed where every line is tinted has no
   priority in it, and the one line an operator must not scroll past is the one
   that went wrong. */
const STATUS_STYLES = {
  succeeded: { dot: "bg-success", text: "text-muted", label: "Completed" },
  partial: { dot: "bg-primary", text: "text-muted", label: "Partially completed" },
  failed: { dot: "bg-error", text: "text-error-ink font-medium", label: "Failed" },
  info: { dot: "bg-muted-soft", text: "text-muted", label: "Notification" },
} as const;

const SKELETON_WIDTHS = ["w-4/5", "w-3/5", "w-3/4"];

const BellIcon = () => (
  <svg
    aria-hidden="true"
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
    <path d="M10 21h4" />
  </svg>
);

/* Drawn at the rail's stroke weight rather than the `×` character, which is a
   glyph in the body face sitting beside a set of 1.75px icons. */
const CloseIcon = () => (
  <svg
    aria-hidden="true"
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.75"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);

const siteLabel = (alert: AppAlert) =>
  alert.site_name ?? (alert.site_id === null ? "CMH" : `Site ${alert.site_id}`);

/** Rows the shape of the rows they stand in for, so the feed does not jump. */
const FeedSkeleton = () => (
  <div role="status" aria-busy="true" aria-label="Loading notifications">
    <span className="sr-only">Loading notifications</span>
    {SKELETON_WIDTHS.map((width) => (
      <div key={width} className="animate-pulse border-b border-hairline px-4 py-3 last:border-b-0">
        <div className={`h-3.5 rounded-xs bg-hairline ${width}`} />
        <div className="mt-2 flex items-center gap-2">
          <span className="dot bg-hairline-soft" />
          <div className="h-3 w-1/3 rounded-xs bg-hairline-soft" />
        </div>
      </div>
    ))}
  </div>
);

const FeedMessage = ({ title, detail }: { title: string; detail: string }) => (
  <div role="status" className="px-4 py-8 text-center">
    <p className="text-caption text-ink">{title}</p>
    <p className="mx-auto mt-1 max-w-[24ch] text-caption-sm leading-relaxed text-muted">{detail}</p>
  </div>
);

export default function NotificationBell({
  collapsed,
  iconOnly = false,
}: {
  collapsed: boolean;
  iconOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const navigate = useNavigate();
  const { alerts, unreadCount, isPending, isError, acknowledge } = useAlerts();
  // Zero is not a count worth saying. "0 unread notifications" was the bell's
  // accessible name on a quiet morning, and it also crowded out the panel's
  // "All caught up" line, which could never appear while it was truthy.
  const unreadLabel = !unreadCount
    ? ""
    : unreadCount === 1
      ? "1 unread notification"
      : `${unreadCount} unread notifications`;
  const badge =
    unreadCount === null || unreadCount === 0 ? null : unreadCount > 9 ? "9+" : String(unreadCount);
  const compact = collapsed || iconOnly;

  // Escape restores focus to the bell: the panel is the only thing that moved,
  // so the keyboard has to land back where it was and not on the document body.
  // A click elsewhere belongs to whatever was clicked and must not drag focus.
  const close = useCallback((restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) trigger.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      if (root.current && event.target instanceof Node && !root.current.contains(event.target)) {
        close();
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close(true);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, close]);

  const handleAlertClick = (alert: AppAlert) => {
    if (alert.acknowledged_at === null) acknowledge(alert.id);
    setOpen(false);
    const destination = notificationDestination(alert);
    if (destination) navigate(destination);
  };

  const triggerButton = (
    <button
      ref={trigger}
      type="button"
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-controls={panelId}
      aria-label={unreadLabel ? `Notifications, ${unreadLabel}` : "Notifications"}
      onClick={() => setOpen((current) => !current)}
      className={`touch-target relative flex items-center rounded-pill text-nav-link text-body
        transition-colors duration-150 hover:bg-surface-strong hover:text-ink focus-visible:z-10
        ${open ? "bg-surface-strong text-ink" : ""}
        ${
          compact
            ? `${collapsed ? "h-7 w-7 min-h-7" : "h-8 w-8 min-h-8"} justify-center px-0`
            : "min-h-11 w-full gap-2.5 px-3"
        }`}
    >
      <BellIcon />
      {!compact && <span className="min-w-0 flex-1 text-left">Notifications</span>}
      {badge !== null && (
        <>
          {compact ? (
            <span
              aria-hidden="true"
              className="dot absolute right-0.5 top-0.5 bg-notification-unread ring-2 ring-canvas-soft"
            />
          ) : (
            <span
              aria-hidden="true"
              className="flex h-5 min-w-5 items-center justify-center rounded-pill bg-primary px-1.5 text-caption-upper tabular-nums text-on-primary"
            >
              {badge}
            </span>
          )}
          {/* The collapsed rail draws a dot, and "9+" is not a number either.
              The count reaches assistive tech here rather than nowhere. */}
          <span className="sr-only">{unreadLabel}</span>
        </>
      )}
    </button>
  );

  return (
    <div ref={root} className={`relative z-40 ${iconOnly ? "flex-none" : "mb-5"}`}>
      {collapsed ? <RailTip label={unreadLabel || "Notifications"}>{triggerButton}</RailTip> : triggerButton}

      {open && (
        <div
          id={panelId}
          role="dialog"
          aria-label="Notifications"
          // Tabbing out of the last row closes the panel rather than leaving it
          // open behind the page the operator has moved on to.
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) close();
          }}
          className="card absolute left-full top-0 z-50 ml-3 w-[min(24rem,calc(100vw-2rem))]
            overflow-hidden shadow-lift"
        >
          {/* The header takes the soft canvas so the feed below it reads as the
              card's content rather than as a first row of it. */}
          <div className="flex items-start justify-between gap-3 border-b border-hairline bg-canvas-soft px-4 py-3">
            <div className="min-w-0">
              <h2 className="text-button text-ink">Notifications</h2>
              {/* Silent while the feed itself is reporting a failure: the header
                  said "Checking for updates" directly above "Notifications are
                  unavailable", and only one of the two could be true. */}
              {!isError && (
                <p className="mt-1 text-caption-sm text-muted">
                  {unreadCount === null ? "Checking for updates" : unreadLabel || "All caught up"}
                </p>
              )}
            </div>
            <button
              type="button"
              aria-label="Close notifications"
              onClick={() => close(true)}
              className="-mr-1 flex h-8 w-8 flex-none items-center justify-center rounded-pill text-muted
                transition-colors duration-state ease-settle hover:bg-surface-strong hover:text-ink"
            >
              <CloseIcon />
            </button>
          </div>

          {isPending ? (
            <FeedSkeleton />
          ) : isError ? (
            <FeedMessage
              title="Notifications are unavailable"
              detail="The dashboard keeps trying; this list fills in as soon as it answers."
            />
          ) : alerts.length === 0 ? (
            // "All caught up" is already the header's line; the body says the
            // other half — what would be here if there were anything.
            <FeedMessage
              title="No notifications yet"
              detail="Finished crawls, analyses, and publications report here."
            />
          ) : (
            <ul
              aria-label="Recent notifications"
              className="max-h-[min(28rem,calc(100dvh-10rem))] overflow-y-auto overscroll-contain"
            >
              {alerts.map((alert) => {
                const status = notificationStatus(alert);
                const style = STATUS_STYLES[status];
                const unread = alert.acknowledged_at === null;
                const title = notificationTitle(alert.subject);
                return (
                  <li key={alert.id} className="border-b border-hairline last:border-b-0">
                    {/* Unread is carried by the title's weight and by the mark at
                        the end of the row, not by a tinted ground: the ground the
                        row used was quieter than its own hover state, so passing
                        the cursor over a read row made it look newer than the
                        unread one above it. */}
                    <button
                      type="button"
                      onClick={() => handleAlertClick(alert)}
                      aria-label={`${unread ? "Unread. " : ""}${style.label}: ${title}. ${siteLabel(alert)}. ${formatNotificationTime(alert.last_seen_at)}`}
                      className="flex w-full flex-col gap-1 px-4 py-3 text-left transition-colors
                        duration-state ease-settle hover:bg-surface-strong"
                    >
                      <span className="flex items-start gap-2">
                        <span
                          className={`min-w-0 flex-1 text-caption leading-snug ${
                            unread ? "font-medium text-ink" : "text-body"
                          }`}
                        >
                          {title}
                        </span>
                        {unread && <span aria-hidden="true" className="dot mt-1.5 bg-primary" />}
                      </span>
                      <span
                        aria-hidden="true"
                        className="flex min-w-0 items-center gap-1.5 text-caption-sm text-muted"
                      >
                        <span className={`dot ${style.dot}`} />
                        <span className={style.text}>{style.label}</span>
                        <span className="text-muted-soft">·</span>
                        <span className="truncate">{siteLabel(alert)}</span>
                        <span className="text-muted-soft">·</span>
                        <time
                          dateTime={alert.last_seen_at}
                          title={formatNotificationTimestamp(alert.last_seen_at) || undefined}
                          className="flex-none tabular-nums"
                        >
                          {formatNotificationTime(alert.last_seen_at)}
                        </time>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

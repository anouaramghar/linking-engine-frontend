import { useId, type ReactNode } from "react";
import { Navigate, NavLink, Route, Routes } from "react-router-dom";

import AccountControls from "./components/AccountControls";
import RailTip from "./components/RailTip";
import ThemeToggle from "./components/ThemeToggle";
import { useHealth } from "./hooks/useHealth";
import { useRail } from "./hooks/useRail";
import { useSites } from "./hooks/useSites";
import { useSuggestionCounts } from "./hooks/useSuggestions";
import { useTheme } from "./hooks/useTheme";
import AccessPage from "./pages/AccessPage";
import EvaluationPage from "./pages/EvaluationPage";
import ContentPoolPage from "./pages/ContentPoolPage";
import SitesPage from "./pages/SitesPage";
import ValidationPage from "./pages/ValidationPage";

/**
 * Each nav mark is drawn from the same grammar as the Brand mark and the
 * ThemeToggle's controls: circles and 1.5px strokes, so the rail reads as one
 * drawing rather than a borrowed icon set. `short` is the label for the
 * four-column mobile row *only* — the 224px rail has room for the real name,
 * and "Pool" on its own does not say whose pool or of what.
 */
interface NavItem {
  to: string;
  label: string;
  short?: string;
  icon: ReactNode;
}

const QUEUE: NavItem = {
  to: "/queue",
  label: "Review queue",
  short: "Queue",
  icon: (
    <>
      <rect width="8" height="4" x="8" y="2" rx="1" ry="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <path d="m9 14 2 2 4-4" />
    </>
  ),
};

/**
 * The queue is the destination; these four are where you go between review
 * sessions. That is the whole hierarchy, and one label is enough to draw it —
 * an eyebrow over every group would be grammar rather than structure. It also
 * gives the collapsed rail the one thing it needs: a rule that survives when
 * the words do not.
 *
 * The order is the order the rail has always had. Grouping is allowed to add a
 * seam; it is not allowed to move an operator's muscle memory.
 */
const MANAGED: NavItem[] = [
  {
    to: "/sites",
    label: "Sites",
    icon: (
      <>
        <circle cx="12" cy="12" r="10" />
        <path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" />
        <path d="M2 12h20" />
      </>
    ),
  },
  {
    to: "/content-pool",
    label: "Content Pool",
    short: "Pool",
    icon: (
      <>
        <ellipse cx="12" cy="5" rx="9" ry="3" />
        <path d="M3 5v14c0 1.66 4.03 3 9 3s9-1.34 9-3V5" />
        <path d="M3 12c0 1.66 4.03 3 9 3s9-1.34 9-3" />
      </>
    ),
  },
  {
    to: "/evaluation",
    label: "Evaluation",
    icon: (
      <>
        <path d="M3 3v18h18" />
        <path d="M18 17V9" />
        <path d="M13 17V5" />
        <path d="M8 17v-3" />
      </>
    ),
  },
  {
    to: "/access",
    label: "Access",
    icon: (
      <>
        <path d="M2 18v3c0 .6.4 1 1 1h4v-3h3v-3h2l1.4-1.4a6.5 6.5 0 1 0-4-4Z" />
        <circle cx="16.5" cy="7.5" r=".5" fill="currentColor" />
      </>
    ),
  },
];

const NAV = [QUEUE, ...MANAGED];

const NavMark = ({ icon }: { icon: ReactNode }) => (
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
    className="flex-none"
  >
    {icon}
  </svg>
);

function Brand({ markOnly = false }: { markOnly?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <svg
        aria-hidden="true"
        width="26"
        height="26"
        viewBox="0 0 26 26"
        fill="none"
        className="flex-none text-ink"
      >
        <circle cx="6" cy="20" r="4" fill="currentColor" />
        <circle cx="20" cy="6" r="4" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8.8 17.2 L17.2 8.8" stroke="currentColor" strokeWidth="1.5" />
      </svg>
      {markOnly ? (
        <span className="sr-only">LinkMesh · CMHW Domains</span>
      ) : (
        <div className="min-w-0">
          <div className="font-serif text-display-sm leading-none text-ink">LinkMesh</div>
          {/* The eyebrow is tracked at 0.96px, which is what pushed it onto a
              second line once the collapse control claimed the end of this row.
              It is a two-word mark, not a sentence: it breaks nowhere. */}
          <div className="eyebrow mt-1.5 whitespace-nowrap">CMHW Domains</div>
        </div>
      )}
    </div>
  );
}

function RailLink({
  item,
  pending,
  collapsed,
}: {
  item: NavItem;
  pending: number | null;
  collapsed: boolean;
}) {
  const count = item.to === QUEUE.to && pending !== null && pending > 0 ? pending : null;

  const link = (
    <NavLink
      to={item.to}
      className={({ isActive }) =>
        `relative flex min-h-11 items-center rounded-pill text-nav-link transition-colors
         duration-150 ${collapsed ? "h-11 w-11 justify-center" : "w-full gap-2.5 px-2.5"} ${
           isActive
             ? "bg-primary text-on-primary"
             : "text-body hover:bg-surface-strong hover:text-ink"
         }`
      }
    >
      {({ isActive }) => (
        <>
          {/* The marks are the same mesh geometry as the Brand, so at rest they
              render in `text-body` rather than a borrowed chip colour, and the
              label carries the item's meaning. */}
          <NavMark icon={item.icon} />
          <span className={collapsed ? "sr-only" : "min-w-0 flex-1 truncate text-left"}>
            {item.label}
          </span>
          {count !== null &&
            (collapsed ? (
              // A number does not survive here. There is no room beside a 44px
              // mark, so the pill has to sit *on* it — where the count either
              // collides with the drawing or, on the active ink pill, renders as
              // pale text floating on dark. An indicator says the one thing the
              // collapsed rail owes the operator ("there is work"); the count
              // itself rides in the tooltip and the accessible name, both of
              // which are already there.
              <>
                <span
                  aria-hidden="true"
                  className={`absolute right-1.5 top-1.5 h-2 w-2 rounded-full ${
                    isActive ? "bg-on-primary" : "bg-primary ring-2 ring-canvas-soft"
                  }`}
                />
                <span className="sr-only">{count} pending</span>
              </>
            ) : (
              <span
                className={`flex h-5 min-w-5 flex-none items-center justify-center rounded-pill
                  px-1.5 text-caption-upper tabular-nums ${
                    isActive ? "bg-on-primary/20 text-on-primary" : "bg-surface-strong text-ink"
                  }`}
              >
                <span aria-hidden="true">{count}</span>
                <span className="sr-only">{count} pending</span>
              </span>
            ))}
        </>
      )}
    </NavLink>
  );

  if (!collapsed) return link;

  return (
    <RailTip label={count === null ? item.label : `${item.label} · ${count} pending`}>
      {link}
    </RailTip>
  );
}

/**
 * The desktop rail's navigation.
 *
 * One `<nav>` holding two lists rather than two landmarks: the seam is a
 * grouping inside primary navigation, not a second navigation, and announcing
 * it as one would make the rail sound like two menus.
 */
function RailNavigation({ pending, collapsed }: { pending: number | null; collapsed: boolean }) {
  const groupId = useId();

  return (
    <nav aria-label="Primary navigation" className="flex flex-col gap-1">
      <ul>
        <li>
          <RailLink item={QUEUE} pending={pending} collapsed={collapsed} />
        </li>
      </ul>

      <h2
        id={groupId}
        className={collapsed ? "sr-only" : "eyebrow mt-5 px-2.5 pb-1"}
      >
        Manage
      </h2>
      {collapsed && <hr aria-hidden="true" className="mx-3 my-3 border-t border-hairline" />}

      <ul aria-labelledby={groupId} className="flex flex-col gap-1">
        {MANAGED.map((item) => (
          <li key={item.to}>
            <RailLink item={item} pending={pending} collapsed={collapsed} />
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** The mobile row stays flat: five columns is already the grouping. */
function MobileNavigation({ pending }: { pending: number | null }) {
  return (
    <nav aria-label="Mobile navigation" className="grid grid-cols-5 gap-1 px-2 pb-2">
      {NAV.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) =>
            `flex min-h-11 items-center justify-center gap-1 rounded-pill px-3 text-center
             text-nav-link transition-colors duration-150 ${
               isActive
                 ? "bg-primary text-on-primary"
                 : "text-body hover:bg-surface-strong hover:text-ink"
             }`
          }
        >
          {({ isActive }) => (
            <>
              <span>{item.short ?? item.label}</span>
              {item.to === QUEUE.to && pending !== null && pending > 0 && (
                <span
                  className={`flex h-5 min-w-5 flex-none items-center justify-center rounded-pill
                    px-1.5 text-caption-upper tabular-nums ${
                      isActive
                        ? "bg-on-primary/20 text-on-primary"
                        : "bg-surface-strong text-ink"
                    }`}
                >
                  <span aria-hidden="true">{pending}</span>
                  <span className="sr-only">{pending} pending</span>
                </span>
              )}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

/** Pushed to the rail's left edge, mirrored to point back out when collapsed. */
function CollapseToggle({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="touch-target flex h-8 w-8 flex-none items-center justify-center rounded-pill
        text-muted transition-colors hover:bg-surface-strong hover:text-ink"
    >
      <svg
        aria-hidden="true"
        width="18"
        height="18"
        viewBox="0 0 18 18"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`transition-transform duration-200 motion-reduce:transition-none ${
          collapsed ? "rotate-180" : ""
        }`}
      >
        <path d="M11 5.5 L7.5 9 L11 12.5" />
        <path d="M14 4.5 V13.5" />
      </svg>
      <span className="sr-only">{collapsed ? "Expand sidebar" : "Collapse sidebar"}</span>
    </button>
  );
}

export default function App() {
  const { data: sites } = useSites();
  const ownedSites = sites?.filter((site) => site.platform !== "pool");
  const ownedSiteCount = ownedSites?.length ?? null;
  const { data: counts } = useSuggestionCounts({}, Boolean(ownedSites?.length));
  const { isError: healthFailed, isPending: healthPending } = useHealth();
  // Owned here, once, because the toggle appears in both the rail and the
  // mobile header and `<html data-theme>` may have only one writer.
  const { preference, setTheme } = useTheme();
  const { collapsed, toggle } = useRail();
  const pending = counts?.pending ?? null;
  const healthLabel = healthPending
    ? "Checking engine"
    : healthFailed
      ? "Engine unavailable"
      : "Engine ready";
  const siteLabel =
    ownedSiteCount === null
      ? "Site count unavailable"
      : `${ownedSiteCount} ${ownedSiteCount === 1 ? "site" : "sites"} connected`;
  const healthDot = `dot ${
    healthPending ? "bg-muted-soft" : healthFailed ? "bg-error" : "bg-success"
  }`;

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden lg:flex-row">
      {/* The rail repeats on every route, so without this a keyboard user pays
          for it on every navigation before reaching the queue. */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:inline-flex focus:h-11 focus:items-center focus:rounded-pill focus:bg-primary focus:px-5 focus:text-button focus:text-on-primary"
      >
        Skip to content
      </a>

      <header className="mobile-app-header z-40 flex-none border-b border-hairline bg-canvas-soft lg:hidden">
        {/* Brand, health and the theme control do not fit on one line at 375px.
            The trailing pair wraps together to a second, right-aligned row
            rather than the health label truncating or hiding — the dot beside it
            is aria-hidden, so that label is the only thing carrying engine
            state to a sighted reader. */}
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 pb-3">
          <Brand />
          <div className="ml-auto flex items-center gap-3">
            <div
              role="status"
              aria-live="polite"
              aria-atomic="true"
              className="flex items-center gap-2 text-caption text-muted"
            >
              <span aria-hidden="true" className={healthDot} />
              <span className={`font-medium ${healthFailed ? "text-error-ink" : "text-ink"}`}>
                {healthLabel}
              </span>
            </div>
            <ThemeToggle preference={preference} onChange={setTheme} />
          </div>
          <div className="w-full">
            <AccountControls />
          </div>
        </div>
        <MobileNavigation pending={pending} />
      </header>

      {/* The system describes a marketing top-nav, not an app rail. The rail is
          built from the same parts: canvas-soft ground, a hairline seam, the
          nav-link type, and the ink pill standing in for the active item.

          `relative z-30` so a collapsed rail's tooltips paint over <main>, which
          is a later sibling and would otherwise cover them.

          The width snaps rather than animating: labels that stay in flow would
          overflow a rail still in motion, and clipping them would take the
          tooltips with it. A rail toggled once a week does not need the frame. */}
      <aside
        className={`relative z-30 hidden h-full flex-none flex-col border-r border-hairline
          bg-canvas-soft py-6 lg:flex ${collapsed ? "w-16 px-2.5" : "w-60 px-4"}`}
      >
        {/* `px-2.5` matches the nav items' own inset, so the Brand mark and the
            four nav marks share one optical left edge instead of missing it by
            the two pixels that read as a wobble. */}
        <div
          className={`flex items-center gap-2 pb-6 ${
            collapsed ? "flex-col px-0" : "justify-between px-2.5"
          }`}
        >
          <Brand markOnly={collapsed} />
          <CollapseToggle collapsed={collapsed} onToggle={toggle} />
        </div>

        <RailNavigation pending={pending} collapsed={collapsed} />

        <footer className={`mt-auto ${collapsed ? "px-0" : "px-2"}`}>
          {/* Engine down is not a caption. Nothing in this dashboard works while
              it is true, so the block takes a tinted ground and the error ink
              rather than reporting a failure in the same voice as success. */}
          <div
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className={`border-t border-hairline pt-4 text-caption leading-relaxed text-muted ${
              collapsed ? "flex justify-center" : ""
            }`}
          >
            {collapsed ? (
              <RailTip label={`${healthLabel} · ${siteLabel}`}>
                <span className="flex h-9 w-9 items-center justify-center">
                  <span aria-hidden="true" className={healthDot} />
                </span>
                <span className="sr-only">
                  {healthLabel}. {siteLabel}.
                </span>
              </RailTip>
            ) : (
              <div
                className={`rounded-lg border px-2.5 py-2 ${
                  healthFailed ? "border-error/30 bg-error/5" : "border-transparent"
                }`}
              >
                <div className="mb-0.5 flex items-center gap-2">
                  <span aria-hidden="true" className={healthDot} />
                  <span className={`font-medium ${healthFailed ? "text-error-ink" : "text-ink"}`}>
                    {healthLabel}
                  </span>
                </div>
                <div>{siteLabel}</div>
              </div>
            )}
          </div>

          <div className={`mt-3 ${collapsed ? "flex justify-center" : "px-2.5"}`}>
            <ThemeToggle
              preference={preference}
              onChange={setTheme}
              orientation={collapsed ? "vertical" : "horizontal"}
            />
          </div>

          <div className="mt-3 border-t border-hairline pt-3">
            <AccountControls layout={collapsed ? "compact" : "stack"} />
          </div>
        </footer>
      </aside>

      <main
        id="main"
        tabIndex={-1}
        className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden focus:outline-none"
      >
        {/* Atmospheric orbs — the system's only colour moment, carrying no content. */}
        <div className="pointer-events-none absolute -right-20 -top-32 h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle,theme(colors.orb-lavender/35%),transparent_70%)]" />
        <div className="pointer-events-none absolute -bottom-36 left-56 h-[380px] w-[380px] rounded-full bg-[radial-gradient(circle,theme(colors.orb-mint/28%),transparent_70%)]" />
        <Routes>
          <Route path="/" element={<Navigate to="/queue" replace />} />
          <Route path="/queue" element={<ValidationPage />} />
          <Route path="/sites" element={<SitesPage />} />
          <Route path="/content-pool" element={<ContentPoolPage />} />
          <Route path="/evaluation" element={<EvaluationPage />} />
          <Route path="/access" element={<AccessPage />} />
          <Route path="*" element={<Navigate to="/queue" replace />} />
        </Routes>
      </main>
    </div>
  );
}

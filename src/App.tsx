import { lazy, Suspense } from "react";
import { Navigate, NavLink, Route, Routes } from "react-router-dom";

import { useHealth } from "./hooks/useHealth";
import { useSites } from "./hooks/useSites";
import { useSuggestionCounts } from "./hooks/useSuggestions";
const EvaluationPage = lazy(() => import("./pages/EvaluationPage"));
const ContentPoolPage = lazy(() => import("./pages/ContentPoolPage"));
const SitesPage = lazy(() => import("./pages/SitesPage"));
const ValidationPage = lazy(() => import("./pages/ValidationPage"));

const NAV = [
  { to: "/queue", label: "Review queue" },
  { to: "/sites", label: "Sites" },
  { to: "/content-pool", label: "Content Pool" },
  { to: "/evaluation", label: "Evaluation" },
];

function Brand() {
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
      <div>
        <div className="font-serif text-display-sm leading-none text-ink">LinkMesh</div>
        <div className="eyebrow mt-1.5">CMHW Domains</div>
      </div>
    </div>
  );
}

function PrimaryNavigation({ pending, mobile = false }: { pending: number; mobile?: boolean }) {
  return (
    <nav
      aria-label={mobile ? "Mobile navigation" : "Primary navigation"}
      className={mobile ? "grid grid-cols-4 gap-1 px-2 pb-2" : "flex flex-col gap-1"}
    >
      {NAV.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) =>
            `flex min-h-11 items-center rounded-pill text-nav-link ${
              mobile ? "justify-center gap-1 px-3 text-center" : "w-full justify-between px-4"
            } ${
              isActive
                ? "bg-primary text-on-primary"
                : "text-body hover:bg-surface-strong hover:text-ink"
            }`
          }
        >
          {({ isActive }) => (
            <>
              <span>
                {mobile && item.to === "/queue"
                  ? "Queue"
                  : mobile && item.to === "/content-pool"
                    ? "Pool"
                    : item.label}
              </span>
              {item.to === "/queue" && pending > 0 && (
                <span
                  className={`rounded-pill px-2 py-0.5 text-caption-upper ${
                    isActive
                      ? "bg-on-primary/20 text-on-primary"
                      : "bg-surface-strong text-ink"
                  }`}
                >
                  {pending}
                </span>
              )}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

export default function App() {
  const { data: sites } = useSites();
  const ownedSites = sites?.filter((site) => site.platform !== "pool");
  const ownedSiteCount = ownedSites?.length ?? 0;
  const { data: counts } = useSuggestionCounts({}, Boolean(ownedSites?.length));
  const { isError: healthFailed, isPending: healthPending } = useHealth();
  const pending = counts?.pending ?? 0;
  const healthLabel = healthPending
    ? "Checking engine"
    : healthFailed
      ? "Engine unavailable"
      : "Engine ready";

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
        <div className="flex items-center justify-between gap-4 px-4 pb-3">
          <Brand />
          <div
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className="flex items-center gap-2 text-caption text-muted"
          >
            <span
              aria-hidden="true"
              className={`dot ${
                healthPending ? "bg-muted-soft" : healthFailed ? "bg-error" : "bg-success"
              }`}
            />
            <span className="font-medium text-ink">{healthLabel}</span>
          </div>
        </div>
        <PrimaryNavigation pending={pending} mobile />
      </header>

      {/* The system describes a marketing top-nav, not an app rail. The rail is
          built from the same parts: canvas-soft ground, a hairline seam, the
          nav-link type, and the ink pill standing in for the active item. */}
      <aside className="hidden h-full w-56 flex-none flex-col border-r border-hairline bg-canvas-soft px-4 py-6 lg:flex">
        <div className="flex items-center gap-3 px-2 pb-6">
          <Brand />
        </div>

        <PrimaryNavigation pending={pending} />

        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="mt-auto border-t border-hairline px-2 pt-4 text-caption leading-relaxed text-muted"
          >
            <div className="mb-0.5 flex items-center gap-2">
            <span
              aria-hidden="true"
              className={`dot ${
                healthPending ? "bg-muted-soft" : healthFailed ? "bg-error" : "bg-success"
              }`}
            />
            <span className="font-medium text-ink">{healthLabel}</span>
            </div>
            <div>{ownedSiteCount} sites connected</div>
          </div>
      </aside>

      <main
        id="main"
        tabIndex={-1}
        className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden focus:outline-none"
      >
        {/* Atmospheric orbs — the system's only colour moment, carrying no content. */}
        <div className="pointer-events-none absolute -right-20 -top-32 h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle,theme(colors.orb-lavender/35%),transparent_70%)]" />
        <div className="pointer-events-none absolute -bottom-36 left-56 h-[380px] w-[380px] rounded-full bg-[radial-gradient(circle,theme(colors.orb-mint/28%),transparent_70%)]" />
        <Suspense
          fallback={
            <div
              role="progressbar"
              aria-label="Loading page"
              className="flex min-h-0 flex-1 items-center justify-center p-8 text-body-sm text-muted"
            >
              Loading page…
            </div>
          }
        >
          <Routes>
            <Route path="/" element={<Navigate to="/queue" replace />} />
            <Route path="/queue" element={<ValidationPage />} />
            <Route path="/sites" element={<SitesPage />} />
            <Route path="/content-pool" element={<ContentPoolPage />} />
            <Route path="/evaluation" element={<EvaluationPage />} />
            <Route path="*" element={<Navigate to="/queue" replace />} />
          </Routes>
        </Suspense>
      </main>
    </div>
  );
}

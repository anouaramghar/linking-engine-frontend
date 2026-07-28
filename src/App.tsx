import { Navigate, NavLink, Route, Routes } from "react-router-dom";

import { useHealth } from "./hooks/useHealth";
import { useSites } from "./hooks/useSites";
import { useSuggestionCounts } from "./hooks/useSuggestions";
import EvaluationPage from "./pages/EvaluationPage";
import SitesPage from "./pages/SitesPage";
import ValidationPage from "./pages/ValidationPage";

const NAV = [
  { to: "/queue", label: "Review queue" },
  { to: "/sites", label: "Sites" },
  { to: "/evaluation", label: "Evaluation" },
];

export default function App() {
  const { data: sites } = useSites();
  const { data: counts } = useSuggestionCounts({}, Boolean(sites?.length));
  const { isError: healthFailed, isPending: healthPending } = useHealth();
  const pending = counts?.pending ?? 0;
  const healthLabel = healthPending
    ? "Checking engine"
    : healthFailed
      ? "Engine unavailable"
      : "Engine ready";

  return (
    <div className="flex min-h-screen">
      {/* The system describes a marketing top-nav, not an app rail. The rail is
          built from the same parts: canvas-soft ground, a hairline seam, the
          nav-link type, and the ink pill standing in for the active item. */}
      <aside className="sticky top-0 flex h-screen w-56 flex-none flex-col border-r border-hairline bg-canvas-soft px-4 py-6">
        <div className="flex items-center gap-3 px-2 pb-6">
          <svg width="26" height="26" viewBox="0 0 26 26" fill="none" className="text-ink">
            <circle cx="6" cy="20" r="4" fill="currentColor" />
            <circle cx="20" cy="6" r="4" fill="none" stroke="currentColor" strokeWidth="1.5" />
            <path d="M8.8 17.2 L17.2 8.8" stroke="currentColor" strokeWidth="1.5" />
          </svg>
          <div>
            <div className="font-serif text-display-sm leading-none text-ink">LinkMesh</div>
            <div className="eyebrow mt-1.5">CMHW Domains</div>
          </div>
        </div>

        <nav className="flex flex-col gap-1">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex h-10 w-full items-center justify-between rounded-pill px-4 text-nav-link ${
                  isActive
                    ? "bg-primary text-on-primary"
                    : "text-body hover:bg-surface-strong hover:text-ink"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span>{item.label}</span>
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

        <div className="mt-auto border-t border-hairline px-2 pt-4 text-caption leading-relaxed text-muted">
          <div className="mb-0.5 flex items-center gap-2">
            <span
              className={`dot ${
                healthPending ? "bg-muted-soft" : healthFailed ? "bg-error" : "bg-success"
              }`}
            />
            <span className="font-medium text-ink">{healthLabel}</span>
          </div>
          <div>{sites?.length ?? 0} sites connected</div>
          <div>Last batch: <span className="font-medium text-ink">Soon</span></div>
          <div>Vectors: <span className="font-medium text-ink">Soon</span> &middot; pgvector</div>
        </div>
      </aside>

      <main className="relative flex h-screen min-w-0 flex-1 flex-col overflow-hidden">
        {/* Atmospheric orbs — the system's only colour moment, carrying no content. */}
        <div className="pointer-events-none absolute -right-20 -top-32 h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle,theme(colors.orb-lavender/35%),transparent_70%)]" />
        <div className="pointer-events-none absolute -bottom-36 left-56 h-[380px] w-[380px] rounded-full bg-[radial-gradient(circle,theme(colors.orb-mint/28%),transparent_70%)]" />
        <Routes>
          <Route path="/" element={<Navigate to="/queue" replace />} />
          <Route path="/queue" element={<ValidationPage />} />
          <Route path="/sites" element={<SitesPage />} />
          <Route path="/evaluation" element={<EvaluationPage />} />
          <Route path="*" element={<Navigate to="/queue" replace />} />
        </Routes>
      </main>
    </div>
  );
}

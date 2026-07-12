import { NavLink, Navigate, Route, Routes } from "react-router-dom";

import { useStats } from "./hooks/useSites";
import ValidationPage from "./pages/ValidationPage";
import SitesPage from "./pages/SitesPage";
import DashboardPage from "./pages/DashboardPage";

const NAV = [
  { to: "/queue", label: "Review queue" },
  { to: "/sites", label: "Sites" },
  { to: "/evaluation", label: "Evaluation" },
];

export default function App() {
  const { data: stats } = useStats();
  const pending = stats?.reduce((n, s) => n + (s.suggestions_by_status.pending ?? 0), 0) ?? 0;

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 flex h-screen w-56 flex-none flex-col border-r border-stone-200 bg-stone-50 px-3.5 py-6">
        <div className="flex items-center gap-2.5 px-2.5 pb-6">
          <svg width="26" height="26" viewBox="0 0 26 26" fill="none">
            <circle cx="6" cy="20" r="4" fill="#0c0a09" />
            <circle cx="20" cy="6" r="4" fill="none" stroke="#0c0a09" strokeWidth="1.5" />
            <path d="M8.8 17.2 L17.2 8.8" stroke="#0c0a09" strokeWidth="1.5" />
          </svg>
          <div>
            <div className="font-serif text-xl leading-none tracking-tight">LinkMesh</div>
            <div className="mt-1 text-[10px] font-semibold uppercase tracking-widest text-stone-400">
              CMHW Domains
            </div>
          </div>
        </div>

        <nav className="flex flex-col gap-0.5">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              className={({ isActive }) =>
                `flex w-full items-center justify-between rounded-full px-3 py-2.5 text-[15px] font-medium ${
                  isActive ? "bg-stone-800 text-white" : "text-stone-600 hover:bg-chip"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span>{n.label}</span>
                  {n.to === "/queue" && pending > 0 && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11.5px] font-semibold ${
                        isActive ? "bg-white/20 text-white" : "bg-chip text-stone-800"
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

        <div className="mt-auto border-t border-stone-200 px-2.5 pt-4 text-[12.5px] leading-relaxed text-stone-500">
          <div className="flex items-center gap-1.5">
            <span className="h-[7px] w-[7px] flex-none rounded-full bg-green-600" />
            <span className="font-medium text-stone-800">Engine ready</span>
          </div>
          <div>{stats?.length ?? 0} sites connected</div>
          <div>bge-m3 · pgvector</div>
        </div>
      </aside>

      <main className="relative flex h-screen min-w-0 flex-1 flex-col overflow-hidden">
        <div className="pointer-events-none absolute -right-20 -top-32 h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle,rgba(200,184,224,.35),transparent_70%)]" />
        <div className="pointer-events-none absolute -bottom-36 left-56 h-[380px] w-[380px] rounded-full bg-[radial-gradient(circle,rgba(167,229,211,.28),transparent_70%)]" />
        <Routes>
          <Route path="/" element={<Navigate to="/queue" replace />} />
          <Route path="/queue" element={<ValidationPage />} />
          <Route path="/sites" element={<SitesPage />} />
          <Route path="/evaluation" element={<DashboardPage />} />
        </Routes>
      </main>
    </div>
  );
}

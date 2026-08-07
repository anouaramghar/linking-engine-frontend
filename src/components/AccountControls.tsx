import { describeUser, type DashboardUser } from "../api/auth";
import { useLogout, useSession } from "../hooks/useSession";
import RailTip from "./RailTip";

/**
 * Who is signed in, and the sign out action.
 */
type Layout = "row" | "stack" | "compact";

/**
 * Letter initial shown in the profile avatar badge.
 */
const initialOf = (user: DashboardUser) =>
  describeUser(user).replace(/^@/, "").trim().charAt(0).toUpperCase() || "?";

const UserAvatar = ({ user, size = "md" }: { user: DashboardUser; size?: "sm" | "md" }) => {
  const initial = initialOf(user);
  const dim = size === "sm" ? "h-7 w-7 text-xs" : "h-8 w-8 text-caption";
  return (
    <div
      className={`relative flex ${dim} flex-none items-center justify-center rounded-full bg-primary/10 text-primary font-semibold ring-1 ring-primary/25 shadow-xs`}
    >
      <span>{initial}</span>
      <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-success ring-2 ring-canvas-soft" />
    </div>
  );
};

export default function AccountControls({ layout = "row" }: { layout?: Layout } = {}) {
  const { data: user } = useSession();
  const logout = useLogout();

  if (!user) return null;

  const name = describeUser(user);

  if (layout === "compact") {
    return (
      <div className="flex flex-col items-center gap-2 py-1">
        <RailTip label={`Signed in as ${name}`}>
          <div className="relative cursor-default">
            <UserAvatar user={user} size="md" />
            <span className="sr-only">Signed in as {name}</span>
          </div>
        </RailTip>

        <RailTip label={logout.isPending ? "Signing out…" : "Sign out"}>
          <button
            type="button"
            onClick={() => logout.mutate()}
            disabled={logout.isPending}
            className="flex h-9 w-9 items-center justify-center rounded-pill text-muted transition-colors hover:bg-error/10 hover:text-error-ink disabled:opacity-50"
          >
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
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" x2="9" y1="12" y2="12" />
            </svg>
            <span className="sr-only">{logout.isPending ? "Signing out…" : "Sign out"}</span>
          </button>
        </RailTip>
      </div>
    );
  }

  if (layout === "stack") {
    return (
      <div className="flex min-w-0 items-center justify-between gap-2.5 rounded-xl border border-hairline/70 bg-surface-card/70 p-2.5 transition-all duration-150 hover:border-hairline hover:bg-surface-card">
        <div className="flex min-w-0 items-center gap-2.5">
          <UserAvatar user={user} size="md" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-caption font-semibold leading-snug text-ink" title={name}>
              {name}
            </div>
            <div className="text-[11px] font-normal text-muted leading-none mt-0.5">Active Session</div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => logout.mutate()}
          disabled={logout.isPending}
          aria-label={logout.isPending ? "Signing out…" : "Sign out"}
          title={logout.isPending ? "Signing out…" : "Sign out"}
          className="flex h-8 w-8 flex-none items-center justify-center rounded-pill text-muted transition-colors hover:bg-error/10 hover:text-error-ink disabled:opacity-50"
        >
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
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" x2="9" y1="12" y2="12" />
          </svg>
          <span className="sr-only">{logout.isPending ? "Signing out…" : "Sign out"}</span>
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-hairline/70 bg-surface-card/70 p-2.5">
      <div className="flex min-w-0 items-center gap-2.5">
        <UserAvatar user={user} size="sm" />
        <div className="min-w-0">
          <div className="truncate text-caption font-semibold leading-tight text-ink" title={name}>
            {name}
          </div>
          <div className="text-[11px] text-muted">Active Session</div>
        </div>
      </div>
      <button
        type="button"
        onClick={() => logout.mutate()}
        disabled={logout.isPending}
        className="inline-flex h-8 items-center gap-1.5 rounded-pill bg-surface-strong/70 px-3 text-caption font-medium text-muted transition-colors hover:bg-error/10 hover:text-error-ink disabled:opacity-50"
      >
        <svg
          aria-hidden="true"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
          <polyline points="16 17 21 12 16 7" />
          <line x1="21" x2="9" y1="12" y2="12" />
        </svg>
        <span>{logout.isPending ? "Signing out…" : "Sign out"}</span>
      </button>
    </div>
  );
}


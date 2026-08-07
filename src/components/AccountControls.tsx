import { NavLink } from "react-router-dom";

import { describeUser } from "../api/auth";
import { useLogout, useSession } from "../hooks/useSession";

/**
 * Who is signed in, and the two things they can do about it.
 *
 * Access lives here rather than in the primary nav: admitting a teammate is an
 * occasional errand, not a destination, and a fifth rail item would crowd the
 * mobile row for something most sessions never open.
 */
export default function AccountControls() {
  const { data: user } = useSession();
  const logout = useLogout();

  if (!user) return null;

  return (
    <div className="flex items-center gap-2 text-caption">
      <span className="min-w-0 truncate font-medium text-ink" title={describeUser(user)}>
        {describeUser(user)}
      </span>
      <NavLink
        to="/access"
        className={({ isActive }) =>
          `touch-target inline-flex min-h-11 items-center rounded-pill px-3 sm:min-h-8 ${
            isActive ? "bg-primary text-on-primary" : "text-muted hover:bg-surface-strong hover:text-ink"
          }`
        }
      >
        Access
      </NavLink>
      <button
        type="button"
        onClick={() => logout.mutate()}
        disabled={logout.isPending}
        className="touch-target inline-flex min-h-11 items-center rounded-pill px-3 text-muted hover:bg-surface-strong hover:text-ink disabled:opacity-50 sm:min-h-8"
      >
        {logout.isPending ? "Signing out…" : "Sign out"}
      </button>
    </div>
  );
}

import { useState } from "react";

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

const getUserAvatarUrl = (user: DashboardUser) => {
  if (user.photo_url) return user.photo_url;
  return `/api/v1/auth/users/${user.id}/avatar`;
};

export const UserAvatar = ({ user, size = "md" }: { user: DashboardUser; size?: "sm" | "md" }) => {
  const [imgError, setImgError] = useState(false);
  const initial = initialOf(user);
  // `text-caption-sm`, not Tailwind's `text-xs`: same 12px, but the stock scale
  // is the one the config deliberately does not own, so a reader cannot check it
  // against the system.
  const dim = size === "sm" ? "h-7 w-7 text-caption-sm" : "h-8 w-8 text-caption";
  const avatarUrl = getUserAvatarUrl(user);

  if (avatarUrl && !imgError) {
    return (
      <img
        src={avatarUrl}
        alt={describeUser(user)}
        onError={() => setImgError(true)}
        className={`${dim} flex-none rounded-full object-cover ring-1 ring-primary/25`}
      />
    );
  }

  return (
    <div
      className={`flex ${dim} flex-none items-center justify-center rounded-full bg-primary/10 text-primary font-semibold ring-1 ring-primary/25`}
    >
      <span>{initial}</span>
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
            className="touch-target flex h-9 w-9 items-center justify-center rounded-pill text-muted transition-colors hover:bg-error/10 hover:text-error-ink disabled:opacity-50"
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

  // A card, so it is drawn as one. The alpha-derived pair this used
  // (`border-hairline/70 bg-surface-card/70` lifting to solid on hover) was
  // inventing a surface one step below {component.feature-card}; the system
  // already says what a hovered card does — it takes the single soft shadow tier.
  if (layout === "stack") {
    return (
      <div className="card flex min-w-0 items-center justify-between gap-2.5 p-2.5 hover:shadow-soft">
        <div className="flex min-w-0 items-center gap-2.5">
          <UserAvatar user={user} size="md" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-caption font-semibold text-ink" title={name}>
              {name}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => logout.mutate()}
          disabled={logout.isPending}
          aria-label={logout.isPending ? "Signing out…" : "Sign out"}
          title={logout.isPending ? "Signing out…" : "Sign out"}
          className="touch-target flex h-8 w-8 flex-none items-center justify-center rounded-pill text-muted transition-colors hover:bg-error/10 hover:text-error-ink disabled:opacity-50"
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
    <div className="card flex min-w-0 items-center justify-between gap-3 p-2.5">
      <div className="flex min-w-0 items-center gap-2.5">
        <UserAvatar user={user} size="sm" />
        <div className="min-w-0">
          <div className="truncate text-caption font-semibold text-ink" title={name}>
            {name}
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={() => logout.mutate()}
        disabled={logout.isPending}
        className="touch-target inline-flex h-8 items-center gap-1.5 rounded-pill bg-surface-strong px-3 text-caption font-medium text-muted transition-colors hover:bg-error/10 hover:text-error-ink disabled:opacity-50"
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

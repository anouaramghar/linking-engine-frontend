import { describeUser, type DashboardUser } from "../api/auth";
import { useLogout, useSession } from "../hooks/useSession";
import RailTip from "./RailTip";

/**
 * Who is signed in, and the sign out action.
 *
 * Access now lives in primary navigation under Manage.
 */
type Layout = "row" | "stack" | "compact";

const ICON = {
  /* Leaving: a panel the arrow exits to the right. */
  signOut: (
    <>
      <path d="M9.5 2.5H3.75a1.25 1.25 0 0 0-1.25 1.25v8.5a1.25 1.25 0 0 0 1.25 1.25H9.5" />
      <path d="M11.5 5.5 14 8l-2.5 2.5M14 8H6.5" />
    </>
  ),
} as const;

const Mark = ({ d }: { d: keyof typeof ICON }) => (
  <svg
    aria-hidden="true"
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="flex-none"
  >
    {ICON[d]}
  </svg>
);

/**
 * The letter shown when the rail is collapsed. `describeUser` already ranks the
 * identifiers, so this only has to survive the shapes it can return: a display
 * name, an `@handle`, or the "Telegram 42" fallback — the `@` is stripped so the
 * initial is the person's, not the sigil's.
 */
const initialOf = (user: DashboardUser) =>
  describeUser(user).replace(/^@/, "").trim().charAt(0).toUpperCase() || "?";

const ACTION =
  "touch-target inline-flex min-h-11 items-center justify-center gap-1.5 whitespace-nowrap " +
  "rounded-pill px-3 transition-colors sm:min-h-8";

export default function AccountControls({ layout = "row" }: { layout?: Layout } = {}) {
  const { data: user } = useSession();
  const logout = useLogout();

  if (!user) return null;

  const name = describeUser(user);

  if (layout === "compact") {
    return (
      <div className="flex flex-col items-center gap-1">
        <RailTip label={name}>
          <span
            className="flex h-8 w-8 flex-none items-center justify-center rounded-full
              bg-surface-strong text-caption font-medium text-ink"
          >
            <span aria-hidden="true">{initialOf(user)}</span>
            <span className="sr-only">Signed in as {name}</span>
          </span>
        </RailTip>

        <RailTip label={logout.isPending ? "Signing out…" : "Sign out"}>
          <button
            type="button"
            onClick={() => logout.mutate()}
            disabled={logout.isPending}
            className="touch-target flex h-11 w-11 items-center justify-center rounded-pill
              text-muted transition-colors hover:bg-surface-strong hover:text-ink
              disabled:opacity-50 sm:h-9 sm:w-9"
          >
            <Mark d="signOut" />
            <span className="sr-only">{logout.isPending ? "Signing out…" : "Sign out"}</span>
          </button>
        </RailTip>
      </div>
    );
  }

  const actions = (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => logout.mutate()}
        disabled={logout.isPending}
        className={`${ACTION} text-muted hover:bg-surface-strong hover:text-ink disabled:opacity-50`}
      >
        {logout.isPending ? "Signing out…" : "Sign out"}
      </button>
    </div>
  );

  /* The rail stacks: 224px cannot hold a name and two pills on one line without
     clipping the name to "@…", which is the one part of this that cannot be
     guessed from context. The mobile header keeps the row — it has the width,
     and a second line there costs vertical space above the queue. */
  if (layout === "stack") {
    return (
      <div className="min-w-0 text-caption">
        <div className="truncate px-3 font-medium text-ink" title={name}>
          {name}
        </div>
        <div className="mt-0.5">{actions}</div>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 items-center gap-2 text-caption">
      <span className="min-w-0 truncate font-medium text-ink" title={name}>
        {name}
      </span>
      {actions}
    </div>
  );
}

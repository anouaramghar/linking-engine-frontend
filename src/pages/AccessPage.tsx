import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  approveDashboardUser,
  describeUser,
  grantDashboardAdmin,
  listDashboardUsers,
  revokeDashboardAdmin,
  revokeDashboardUser,
  type DashboardUser,
} from "../api/auth";
import { UserAvatar } from "../components/AccountControls";
import ConfirmDialog from "../components/ConfirmDialog";
import PageHeader from "../components/PageHeader";
import { ErrorPanel, SkeletonRows } from "../components/QueryState";
import { useSession } from "../hooks/useSession";

const STATUS_TONE: Record<DashboardUser["status"], string> = {
  pending: "bg-primary",
  approved: "bg-success",
  revoked: "bg-error",
};

const STATUS_LABEL: Record<DashboardUser["status"], string> = {
  pending: "Pending",
  approved: "Approved",
  revoked: "Revoked",
};

type AccessAction = "approve" | "revoke" | "grant-admin" | "revoke-admin";

const ACTION_COPY: Record<
  AccessAction,
  { title: string; confirmLabel: string; danger: boolean; description: (name: string) => string }
> = {
  approve: {
    title: "Approve dashboard access?",
    confirmLabel: "Approve access",
    danger: false,
    description: (name) => `${name} will be able to sign in to the dashboard.`,
  },
  revoke: {
    title: "Revoke dashboard access?",
    confirmLabel: "Revoke access",
    danger: true,
    description: (name) => `${name} will no longer be able to sign in to the dashboard.`,
  },
  "grant-admin": {
    title: "Grant admin rights?",
    confirmLabel: "Make admin",
    danger: false,
    description: (name) => `${name} will be able to approve users, revoke access, and manage roles.`,
  },
  "revoke-admin": {
    title: "Remove admin rights?",
    confirmLabel: "Remove admin",
    danger: true,
    description: (name) => `${name} will keep dashboard access but will no longer manage users.`,
  },
};

const RUN: Record<AccessAction, (id: number) => Promise<DashboardUser>> = {
  approve: approveDashboardUser,
  revoke: revokeDashboardUser,
  "grant-admin": grantDashboardAdmin,
  "revoke-admin": revokeDashboardAdmin,
};

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString() : "—";
}

/**
 * The reason a control is unavailable, said in both channels at once.
 *
 * A `title` is a tooltip, and a tooltip on a disabled button is mouse-only:
 * the element takes no focus, so nothing else ever surfaces it. Repeating the
 * reason in the accessible name is what lets a screen reader read it off the
 * button — the rule `SiteStatusBadge` states for its own tooltip.
 *
 * Returns nothing when there is no reason, so an available control keeps its
 * label as its name.
 */
function disabledReason(reason: string | undefined, label: string) {
  return reason ? { title: reason, "aria-label": `${label}. ${reason}` } : {};
}

export default function AccessPage() {
  const queryClient = useQueryClient();
  const { data: me } = useSession();
  const users = useQuery({ queryKey: ["dashboard-users"], queryFn: listDashboardUsers });
  // The API is the gate; this only decides whether a control is worth showing.
  // An engine that predates the admin group reports nothing here, which reads
  // as "not an admin" — the honest answer for a UI that cannot know.
  const isAdmin = me?.is_admin === true;
  const [pendingChange, setPendingChange] = useState<{
    user: DashboardUser;
    action: AccessAction;
  } | null>(null);

  const change = useMutation({
    mutationFn: ({ id, action }: { id: number; action: AccessAction }) => RUN[action](id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["dashboard-users"] }),
  });

  const confirmChange = () => {
    if (!pendingChange) return;
    const { user, action } = pendingChange;
    change.mutate(
      { id: user.id, action },
      {
        onSuccess: () => setPendingChange(null),
        onError: () => setPendingChange(null),
      },
    );
  };

  return (
    <>
      <PageHeader
        title="Access"
        sub="Approved users can access the dashboard · admins manage access"
      />
      <div className="relative overflow-y-auto px-4 py-4 sm:px-6 sm:py-5 lg:px-8 lg:py-6">
        {users.isPending && <SkeletonRows count={3} label="Loading access requests" />}

        {!users.isPending && users.isError && (
          <ErrorPanel
            title="Access requests unavailable"
            description="The list of dashboard accounts could not be loaded."
            onRetry={() => users.refetch()}
            retrying={users.isFetching}
          />
        )}

        {change.isError && (
          <p role="alert" className="mb-3 rounded-lg bg-error px-4 py-2.5 text-caption text-on-dark">
            That change did not go through. Try again.
          </p>
        )}

        {/* Said once, above the list, rather than as a disabled button on every
            row: a non-admin is not being blocked from something they were doing,
            they are reading a roster. */}
        {users.data && !isAdmin && (
          <p className="mb-3 rounded-lg border border-hairline bg-surface-strong px-4 py-2.5 text-caption text-body">
            Ask an admin to approve, revoke, or change roles.
          </p>
        )}

        {users.data && (
          <ul className="flex flex-col gap-3">
            {users.data.map((user) => {
                const isSelf = user.id === me?.id;
                const busy = change.isPending && change.variables?.id === user.id;
                return (
                  <li
                    key={user.id}
                    className="card flex flex-wrap items-center justify-between gap-4 px-5 py-4"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <UserAvatar user={user} size="sm" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-ink">{describeUser(user)}</span>
                          {isSelf && <span className="badge">You</span>}
                        </div>
                        <div className="mt-1 text-caption text-muted">
                          Requested {formatDate(user.requested_at)}
                          {user.approved_by && ` · approved by ${user.approved_by}`}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      {user.is_admin && (
                        <span className="badge" title="May approve, revoke, and grant admin rights">
                          <span aria-hidden="true" className="dot bg-primary" />
                          Admin
                        </span>
                      )}
                      <span className="badge">
                        <span aria-hidden="true" className={`dot ${STATUS_TONE[user.status]}`} />
                        {STATUS_LABEL[user.status]}
                      </span>

                      {isAdmin && user.status === "approved" && (
                        <button
                          type="button"
                          disabled={(isSelf && user.is_admin) || busy}
                          onClick={() =>
                            setPendingChange({
                              user,
                              action: user.is_admin ? "revoke-admin" : "grant-admin",
                            })
                          }
                          // The last admin demoting themselves leaves a
                          // dashboard nobody can admit into, so the API refuses
                          // it and the button does not offer it.
                          //
                          // The reason rides in the accessible name as well as
                          // the tooltip. A disabled button takes no focus, so a
                          // `title` alone is a reason only a mouse can read —
                          // the same rule {component.SiteStatusBadge} follows.
                          {...disabledReason(
                            isSelf && user.is_admin
                              ? "You cannot remove your own admin rights"
                              : undefined,
                            user.is_admin ? "Remove admin" : "Make admin",
                          )}
                          className="btn btn-outline btn-sm disabled:opacity-50"
                        >
                          {user.is_admin ? "Remove admin" : "Make admin"}
                        </button>
                      )}

                      {isAdmin &&
                        (user.status === "approved" ? (
                          <button
                            type="button"
                            disabled={isSelf || busy}
                            onClick={() => setPendingChange({ user, action: "revoke" })}
                            // Locking yourself out is recoverable only by someone
                            // else, and possibly by nobody at all.
                            {...disabledReason(
                              isSelf ? "You cannot revoke your own access" : undefined,
                              "Revoke",
                            )}
                            className="btn btn-outline btn-sm disabled:opacity-50"
                          >
                            Revoke
                          </button>
                        ) : (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => setPendingChange({ user, action: "approve" })}
                            className="btn btn-primary btn-sm disabled:opacity-50"
                          >
                            {user.status === "revoked" ? "Restore" : "Approve"}
                          </button>
                        ))}
                    </div>
                  </li>
                );
              })}
          </ul>
        )}
      </div>
      {pendingChange && (
        <ConfirmDialog
          title={ACTION_COPY[pendingChange.action].title}
          description={ACTION_COPY[pendingChange.action].description(
            describeUser(pendingChange.user),
          )}
          confirmLabel={ACTION_COPY[pendingChange.action].confirmLabel}
          danger={ACTION_COPY[pendingChange.action].danger}
          pending={change.isPending}
          onConfirm={confirmChange}
          onCancel={() => setPendingChange(null)}
        />
      )}
    </>
  );
}

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  approveDashboardUser,
  describeUser,
  listDashboardUsers,
  revokeDashboardUser,
  type DashboardUser,
} from "../api/auth";
import { UserAvatar } from "../components/AccountControls";
import PageHeader from "../components/PageHeader";
import { ErrorPanel, SkeletonRows } from "../components/QueryState";
import { useSession } from "../hooks/useSession";

const STATUS_TONE: Record<DashboardUser["status"], string> = {
  pending: "bg-primary",
  approved: "bg-success",
  revoked: "bg-error",
};

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString() : "—";
}

export default function AccessPage() {
  const queryClient = useQueryClient();
  const { data: me } = useSession();
  const users = useQuery({ queryKey: ["dashboard-users"], queryFn: listDashboardUsers });

  const change = useMutation({
    mutationFn: ({ id, action }: { id: number; action: "approve" | "revoke" }) =>
      action === "approve" ? approveDashboardUser(id) : revokeDashboardUser(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["dashboard-users"] }),
  });

  return (
    <>
      <PageHeader
        title="Access"
        sub="Everyone approved here sees the whole dashboard · approval is the only gate"
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

                    <div className="flex items-center gap-3">
                      <span className="badge">
                        <span aria-hidden="true" className={`dot ${STATUS_TONE[user.status]}`} />
                        {user.status}
                      </span>
                      {user.status === "approved" ? (
                        <button
                          type="button"
                          disabled={isSelf || busy}
                          onClick={() => change.mutate({ id: user.id, action: "revoke" })}
                          // Locking yourself out is recoverable only by someone
                          // else, and possibly by nobody at all.
                          title={isSelf ? "You cannot revoke your own access" : undefined}
                          className="btn btn-outline btn-sm disabled:opacity-50"
                        >
                          Revoke
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => change.mutate({ id: user.id, action: "approve" })}
                          className="btn btn-primary btn-sm disabled:opacity-50"
                        >
                          {user.status === "revoked" ? "Restore" : "Approve"}
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
          </ul>
        )}
      </div>
    </>
  );
}

import Modal from "../Modal";
import { ErrorPanel, SkeletonRows } from "../QueryState";
import { usePoolAuditEvents } from "../../hooks/useSites";
import { timeAgo } from "../../lib/utils";
import type { Site } from "../../types/site";

export default function PoolAuditModal({ site, onClose }: { site: Site; onClose: () => void }) {
  const query = usePoolAuditEvents(site.id);

  return (
    <Modal title={`${site.name} history`} onClose={onClose} panelClassName="max-w-2xl">
      {query.isPending && <SkeletonRows count={3} label="Loading audit history" />}
      {query.isError && (
        <ErrorPanel
          title="Audit history could not be loaded"
          description="The engine could not return this source's operational history."
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      )}
      {!query.isPending && !query.isError && query.events.length === 0 && (
        <p className="text-body-sm text-muted">No approval or quarantine actions yet.</p>
      )}
      <div className="flex flex-col gap-2">
        {query.events.map((event) => (
          <div key={event.id} className="rounded-lg border border-hairline p-3">
            <div className="flex flex-wrap justify-between gap-2">
              <span className="text-body-sm font-medium capitalize text-ink">{event.action}</span>
              <time className="text-caption text-muted" dateTime={event.created_at}>
                {timeAgo(event.created_at)}
              </time>
            </div>
            <div className="mt-1 text-caption text-muted">
              Exact time: {new Date(event.created_at).toLocaleString()}
            </div>
            <div className="mt-1 text-caption text-muted">Operator: {event.operator_id}</div>
            {event.reason && <div className="mt-1 text-caption text-error-ink">{event.reason}</div>}
          </div>
        ))}
      </div>
      {query.hasNextPage && (
        <div className="mt-4 flex flex-col items-center gap-2">
          <button
            type="button"
            className="btn btn-outline btn-sm"
            disabled={query.isFetchingNextPage}
            onClick={() => void query.fetchNextPage()}
          >
            {query.isFetchingNextPage ? "Loading older history…" : "Load older history"}
          </button>
          <span className="text-caption text-muted" aria-live="polite">
            Showing {query.events.length} recent events
          </span>
        </div>
      )}
    </Modal>
  );
}

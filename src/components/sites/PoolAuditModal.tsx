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
      {query.data?.length === 0 && (
        <p className="text-body-sm text-muted">No approval or quarantine actions yet.</p>
      )}
      <div className="flex flex-col gap-2">
        {query.data?.map((event) => (
          <div key={event.id} className="rounded-lg border border-hairline p-3">
            <div className="flex flex-wrap justify-between gap-2">
              <span className="text-body-sm font-medium capitalize text-ink">{event.action}</span>
              <span className="text-caption text-muted" title={event.created_at}>
                {timeAgo(event.created_at)}
              </span>
            </div>
            <div className="mt-1 text-caption text-muted">Operator: {event.operator_id}</div>
            {event.reason && <div className="mt-1 text-caption text-error-ink">{event.reason}</div>}
          </div>
        ))}
      </div>
    </Modal>
  );
}

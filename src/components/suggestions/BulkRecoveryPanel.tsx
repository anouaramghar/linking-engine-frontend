import type { ReviewStatus } from "../../types/suggestion";

export interface BulkRecovery {
  status: ReviewStatus;
  failedIds: number[];
  notAttemptedIds: number[];
}

const idList = (ids: number[]) => ids.map((id) => `#${id}`).join(", ");

export default function BulkRecoveryPanel({
  recovery,
  busy,
  onRetryFailed,
  onContinue,
  onDismiss,
}: {
  recovery: BulkRecovery;
  busy: boolean;
  onRetryFailed: () => void;
  onContinue: () => void;
  onDismiss: () => void;
}) {
  return (
    <section className="card mb-4 border-error/40 p-4" aria-label="Bulk review recovery">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="eyebrow text-error-ink">Bulk review needs attention</div>
          {recovery.failedIds.length > 0 && (
            <div className="mt-2 text-caption text-body">
              <span className="font-medium text-ink">
                Failed request ({recovery.failedIds.length}):
              </span>{" "}
              <span className="break-words">{idList(recovery.failedIds)}</span>
            </div>
          )}
          {recovery.notAttemptedIds.length > 0 && (
            <div className="mt-2 text-caption text-body">
              <span className="font-medium text-ink">
                Not attempted ({recovery.notAttemptedIds.length}):
              </span>{" "}
              <span className="break-words">{idList(recovery.notAttemptedIds)}</span>
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {recovery.failedIds.length > 0 && (
            <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={onRetryFailed}>
              {busy ? "Retrying…" : "Retry failed only"}
            </button>
          )}
          {recovery.notAttemptedIds.length > 0 && (
            <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={onContinue}>
              Continue not attempted
            </button>
          )}
          <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={onDismiss}>
            Dismiss
          </button>
        </div>
      </div>
    </section>
  );
}

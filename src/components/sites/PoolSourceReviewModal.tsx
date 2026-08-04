import { useId, useRef, useState } from "react";

import Modal from "../Modal";
import { errorDetail } from "../../lib/errors";
import type { Site } from "../../types/site";

export type PoolSourceReviewAction = "approve" | "reactivate";

interface Props {
  site: Pick<Site, "name" | "base_url">;
  action: PoolSourceReviewAction;
  pending?: boolean;
  error?: unknown;
  onSubmit: (reviewer: string) => void;
  onClose: () => void;
}

const COPY: Record<
  PoolSourceReviewAction,
  {
    title: string;
    description: string;
    fieldLabel: string;
    fieldName: string;
    submitLabel: string;
    pendingLabel: string;
    emptyError: string;
    error: string;
  }
> = {
  approve: {
    title: "Approve content pool",
    description: "Approval allows LinkMesh to fetch this source manually and on its daily schedule.",
    fieldLabel: "Approved by",
    fieldName: "approved-by",
    submitLabel: "Approve source",
    pendingLabel: "Approving…",
    emptyError: "Enter the name of the person approving this source.",
    error: "The source could not be approved. Please try again.",
  },
  reactivate: {
    title: "Reactivate content pool",
    description: "Reactivation clears the quarantine counter so this source can be crawled again.",
    fieldLabel: "Reactivated by",
    fieldName: "reactivated-by",
    submitLabel: "Reactivate source",
    pendingLabel: "Reactivating…",
    emptyError: "Enter the name of the person reactivating this source.",
    error: "The source could not be reactivated. Please try again.",
  },
};

export default function PoolSourceReviewModal({
  site,
  action,
  pending = false,
  error,
  onSubmit,
  onClose,
}: Props) {
  const copy = COPY[action];
  const reviewerId = useId();
  const errorId = useId();
  const reviewerInput = useRef<HTMLInputElement>(null);
  const [reviewer, setReviewer] = useState("");
  const [clientError, setClientError] = useState<string | null>(null);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const value = reviewer.trim();
    if (!value) {
      setClientError(copy.emptyError);
      reviewerInput.current?.focus();
      return;
    }
    setClientError(null);
    onSubmit(value);
  };

  return (
    <Modal title={copy.title} onClose={onClose} panelClassName="max-w-md">
      <form onSubmit={submit}>
        <p className="-mt-2 text-body-md text-body">{copy.description}</p>
        <p className="mt-4 rounded-md bg-surface-strong px-3 py-2 text-caption text-body">
          <span className="font-medium text-ink">{site.name}</span>
          <span className="mt-0.5 block break-all text-muted">{site.base_url}</span>
        </p>
        <div className="mt-5">
          <label htmlFor={reviewerId} className="mb-1.5 block text-caption font-medium text-ink">
            {copy.fieldLabel}
          </label>
          <input
            ref={reviewerInput}
            id={reviewerId}
            name={copy.fieldName}
            className={`field ${clientError ? "border-error" : ""}`}
            placeholder="Your name or team"
            autoComplete="name"
            maxLength={255}
            value={reviewer}
            onChange={(event) => {
              setReviewer(event.target.value);
              if (clientError) setClientError(null);
            }}
            aria-invalid={clientError ? true : undefined}
            aria-describedby={clientError ? errorId : undefined}
            required
          />
        </div>
        {(clientError || error) ? (
          <div id={errorId} role="alert" className="mt-3 text-caption text-error-ink">
            {clientError ?? errorDetail(error, copy.error)}
          </div>
        ) : null}
        <div className="mt-6 flex gap-2">
          <button type="submit" disabled={pending} className="btn btn-primary flex-1">
            {pending ? copy.pendingLabel : copy.submitLabel}
          </button>
          <button type="button" onClick={onClose} className="btn btn-outline">
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}

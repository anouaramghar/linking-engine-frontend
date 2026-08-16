import { useId, useState } from "react";

import Modal from "./Modal";

interface Props {
  title: string;
  description: string;
  confirmLabel: string;
  danger?: boolean;
  pending?: boolean;
  /**
   * When set, the operator must type this exact value before confirming.
   *
   * The backend already requires the site name on delete, but a client that
   * fills it in from the row it is deleting proves only that the request came
   * from the app — it cannot stop a misclick. Asking the person to type it is
   * the half of that control the browser is actually responsible for.
   */
  confirmPhrase?: string;
  confirmPhraseLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/** The styled stand-in for window.confirm, so destructive prompts match the app. */
export default function ConfirmDialog({
  title,
  description,
  confirmLabel,
  danger,
  pending,
  confirmPhrase,
  confirmPhraseLabel,
  onConfirm,
  onCancel,
}: Props) {
  const [typed, setTyped] = useState("");
  const inputId = useId();
  const matches = confirmPhrase === undefined || typed === confirmPhrase;

  return (
    <Modal title={title} onClose={onCancel} panelClassName="max-w-md">
      <p className="-mt-2 text-body-md text-body">{description}</p>
      {confirmPhrase !== undefined && (
        <div className="mt-4">
          <label htmlFor={inputId} className="block text-body-sm text-body">
            {confirmPhraseLabel ?? "Type the name to confirm:"}{" "}
            <span className="font-medium text-ink">{confirmPhrase}</span>
          </label>
          <input
            id={inputId}
            type="text"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            autoComplete="off"
            spellCheck={false}
            className="field mt-2"
          />
        </div>
      )}
      <div className="mt-6 flex gap-2">
        <button type="button" onClick={onCancel} autoFocus className="btn btn-outline">
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={pending || !matches}
          className={`btn flex-1 ${danger ? "btn-danger" : "btn-primary"}`}
        >
          {pending ? "Working…" : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}

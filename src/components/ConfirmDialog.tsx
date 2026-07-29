import Modal from "./Modal";

interface Props {
  title: string;
  description: string;
  confirmLabel: string;
  danger?: boolean;
  pending?: boolean;
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
  onConfirm,
  onCancel,
}: Props) {
  return (
    <Modal title={title} onClose={onCancel} panelClassName="max-w-md">
      <p className="-mt-2 text-body-md text-body">{description}</p>
      <div className="mt-6 flex gap-2">
        <button
          type="button"
          onClick={onConfirm}
          disabled={pending}
          className={`btn flex-1 ${danger ? "btn-danger" : "btn-primary"}`}
        >
          {pending ? "Working…" : confirmLabel}
        </button>
        <button type="button" onClick={onCancel} className="btn btn-outline">
          Cancel
        </button>
      </div>
    </Modal>
  );
}

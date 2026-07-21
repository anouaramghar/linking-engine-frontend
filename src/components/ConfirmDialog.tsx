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
      <p className="-mt-2 text-sm text-stone-700">{description}</p>
      <div className="mt-6 flex gap-2">
        <button
          type="button"
          onClick={onConfirm}
          disabled={pending}
          className={`flex-1 rounded-full border py-2.5 text-[15px] font-medium text-white disabled:opacity-50 ${
            danger
              ? "border-red-700 bg-red-700 hover:bg-red-800"
              : "border-stone-800 bg-stone-800 hover:bg-stone-950"
          }`}
        >
          {pending ? "Working…" : confirmLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full border border-stone-300 px-5 py-2.5 text-[15px] font-medium hover:border-stone-950"
        >
          Cancel
        </button>
      </div>
    </Modal>
  );
}

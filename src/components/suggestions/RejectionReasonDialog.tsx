import Modal from "../Modal";
import type { RejectionReason } from "../../types/suggestion";

const REASONS: Array<{ value: RejectionReason; label: string }> = [
  { value: "not_relevant", label: "Not relevant" },
  { value: "wrong_target", label: "Wrong target" },
  { value: "bad_anchor", label: "Bad anchor" },
  { value: "bad_placement", label: "Bad placement" },
  { value: "already_covered", label: "Already covered" },
  { value: "duplicate", label: "Duplicate or redundant" },
  { value: "other", label: "Other" },
];

interface Props {
  targetTitle: string;
  onChoose: (reason?: RejectionReason) => void;
  onCancel: () => void;
}

export default function RejectionReasonDialog({ targetTitle, onChoose, onCancel }: Props) {
  return (
    <Modal
      title="Why reject this suggestion?"
      description={`Optional context for future ranking work. ${targetTitle}`}
      onClose={onCancel}
      panelClassName="max-w-lg"
    >
      <div className="grid gap-2 sm:grid-cols-2">
        {REASONS.map((reason, index) => (
          <button
            key={reason.value}
            type="button"
            autoFocus={index === 0}
            onClick={() => onChoose(reason.value)}
            className="btn btn-outline justify-start text-left"
          >
            {reason.label}
          </button>
        ))}
      </div>
      <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-hairline pt-4">
        <button type="button" onClick={onCancel} className="btn btn-outline">
          Cancel
        </button>
        <button type="button" onClick={() => onChoose()} className="btn btn-primary">
          Reject without a reason
        </button>
      </div>
    </Modal>
  );
}

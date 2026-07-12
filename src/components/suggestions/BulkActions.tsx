interface Chip {
  key: string;
  label: string;
  count: number;
}

interface Props {
  chips: Chip[];
  active: string;
  onSelect: (key: string) => void;
}

export default function BulkActions({ chips, active, onSelect }: Props) {
  return (
    <>
      {chips.map((c) => (
        <button
          key={c.key}
          onClick={() => onSelect(c.key)}
          className={`rounded-full border px-4 py-2 text-sm font-medium ${
            active === c.key
              ? "border-stone-800 bg-stone-800 text-white"
              : "border-stone-300 text-stone-950 hover:border-stone-950"
          }`}
        >
          {c.label} · {c.count}
        </button>
      ))}
    </>
  );
}

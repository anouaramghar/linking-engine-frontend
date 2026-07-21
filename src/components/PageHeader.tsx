export default function PageHeader({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="relative flex flex-none flex-wrap items-center justify-between gap-4 border-b border-stone-200 px-8 py-5">
      <div>
        <h1 className="font-serif text-[32px] font-normal leading-tight tracking-tight">{title}</h1>
        <div className="mt-1 text-sm text-stone-500">{sub}</div>
      </div>
      <div className="rounded-full bg-chip px-3.5 py-1.5 text-xs font-semibold uppercase tracking-widest text-stone-500">
        Baseline cosine
      </div>
    </div>
  );
}

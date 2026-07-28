import PageHeader from "../components/PageHeader";

const KPIS = ["Recall@10", "Recall@5", "MRR", "Editor acceptance"];

const KPI_ORBS = [
  "bg-[radial-gradient(circle,theme(colors.orb-mint/45%),transparent_70%)]",
  "bg-[radial-gradient(circle,theme(colors.orb-sky/45%),transparent_70%)]",
  "bg-[radial-gradient(circle,theme(colors.orb-lavender/45%),transparent_70%)]",
  "bg-[radial-gradient(circle,theme(colors.orb-peach/45%),transparent_70%)]",
];

const COMPARISON_METRICS = ["Recall@10", "Precision@10", "MRR"];

export default function EvaluationPage() {
  return (
    <>
      <PageHeader
        title="Evaluation"
        sub="GraphSAGE and cosine-baseline comparison · live evaluation data: Soon"
        badge="Soon"
      />
      <div className="relative overflow-y-auto px-8 py-6">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {KPIS.map((label, index) => (
            <div key={label} className="card relative overflow-hidden px-6 py-5">
              <div
                className={`pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full ${KPI_ORBS[index]}`}
              />
              <div className="eyebrow relative">{label}</div>
              <div className="relative mt-3 font-serif text-display-lg text-ink">Soon</div>
              <div className="badge relative mt-3">Data pending</div>
            </div>
          ))}
        </div>

        <section className="card mt-4 px-8 py-7">
          <h2 className="font-serif text-display-sm text-ink">Masked-link recovery</h2>
          <p className="mt-2 max-w-3xl text-body-sm text-muted">
            GraphSAGE and cosine-baseline results will appear here when the evaluation
            pipeline is connected to the dashboard.
          </p>

          <div className="mt-6 flex max-w-3xl flex-col gap-4">
            {COMPARISON_METRICS.map((metric) => (
              <div
                key={metric}
                className="grid grid-cols-[1fr_auto_auto] items-center gap-4 border-b border-hairline pb-4 last:border-0"
              >
                <div className="text-body-sm font-medium text-ink">{metric}</div>
                <div className="text-caption text-muted">
                  GraphSAGE <span className="font-medium text-ink">Soon</span>
                </div>
                <div className="text-caption text-muted">
                  Cosine <span className="font-medium text-ink">Soon</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

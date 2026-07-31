import PageHeader from "../components/PageHeader";

const KPIS = ["Candidate recall", "Hit@5", "NDCG@5", "Editor acceptance"];

const KPI_ORBS = [
  "bg-[radial-gradient(circle,theme(colors.orb-mint/45%),transparent_70%)]",
  "bg-[radial-gradient(circle,theme(colors.orb-sky/45%),transparent_70%)]",
  "bg-[radial-gradient(circle,theme(colors.orb-lavender/45%),transparent_70%)]",
  "bg-[radial-gradient(circle,theme(colors.orb-peach/45%),transparent_70%)]",
];

const QUALITY_CHECKS = [
  {
    label: "Candidate coverage",
    description: "Do semantic and lexical retrieval find enough eligible articles?",
  },
  {
    label: "Final ranking",
    description: "Does BM25-512 place useful links in the first three positions?",
  },
  {
    label: "Editorial usefulness",
    description: "Do editors approve rank 1, rank 2, and rank 3 suggestions?",
  },
];

export default function EvaluationPage() {
  return (
    <>
      <PageHeader
        title="Evaluation"
        sub="Hybrid retrieval quality · live evaluation data: Soon"
        badge="Soon"
      />
      <div className="relative overflow-y-auto px-4 py-4 sm:px-6 sm:py-5 lg:px-8 lg:py-6">
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

        <section className="card mt-4 px-4 py-5 sm:px-8 sm:py-7">
          <h2 className="font-serif text-display-sm text-ink">Hybrid quality checks</h2>
          <p className="mt-2 max-w-3xl text-body-sm text-muted">
            Hybrid combines semantic and lexical retrieval, then uses BM25-512 for the
            final order. Live measurements will appear here when the evaluation pipeline
            is connected to the dashboard.
          </p>

          <div className="mt-6 flex max-w-3xl flex-col gap-4">
            {QUALITY_CHECKS.map((check) => (
              <div
                key={check.label}
                className="flex flex-col gap-2 border-b border-hairline pb-4 last:border-0 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
              >
                <div className="min-w-0">
                  <div className="text-body-sm font-medium text-ink">{check.label}</div>
                  <div className="mt-1 text-caption text-muted">{check.description}</div>
                </div>
                <div className="badge flex-none">
                  Live data <span className="font-medium text-ink">Soon</span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

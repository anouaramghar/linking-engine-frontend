import { Link } from "react-router-dom";

import PageHeader from "../components/PageHeader";

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
        sub="Hybrid retrieval quality · evaluation pipeline not connected"
        badge="Setup required"
      />
      <div className="relative overflow-y-auto px-4 py-4 sm:px-6 sm:py-5 lg:px-8 lg:py-6">
        <section
          role="status"
          aria-label="Evaluation pipeline status"
          className="card relative overflow-hidden px-5 py-6 sm:px-8 sm:py-8"
        >
          <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[radial-gradient(circle,theme(colors.orb-lavender/35%),transparent_70%)]" />
          <div className="eyebrow relative">Evaluation pipeline</div>
          <h2 className="relative mt-2 max-w-2xl font-serif text-display-sm text-ink sm:text-display-md">
            Connect evaluation data before measuring retrieval quality.
          </h2>
          <p className="relative mt-3 max-w-2xl text-body-sm leading-relaxed text-muted">
            This workspace is ready for live measurements, but the evaluation pipeline has not
            been connected to the dashboard yet. Review and publish suggestions while that data
            source is being prepared.
          </p>
          <Link to="/queue" className="btn btn-primary relative mt-6">
            Open review queue
          </Link>
        </section>

        <section className="card mt-4 px-5 py-6 sm:px-8 sm:py-7">
          <h2 className="font-serif text-display-sm text-ink">Planned quality checks</h2>
          <p className="mt-2 max-w-3xl text-body-sm text-muted">
            Once connected, LinkMesh will report these measurements for hybrid retrieval and BM25-512
            ranking.
          </p>

          <dl className="mt-6 flex max-w-3xl flex-col gap-4">
            {QUALITY_CHECKS.map((check) => (
              <div
                key={check.label}
                className="flex flex-col gap-2 border-b border-hairline pb-4 last:border-0 sm:flex-row sm:items-center sm:justify-between sm:gap-6"
              >
                <div className="min-w-0">
                  <dt className="text-body-sm font-medium text-ink">{check.label}</dt>
                  <dd className="mt-1 text-caption text-muted">{check.description}</dd>
                </div>
                <span className="badge flex-none">Awaiting data</span>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </>
  );
}

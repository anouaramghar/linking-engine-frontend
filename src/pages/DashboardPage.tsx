import { useState } from "react";

import PageHeader from "../components/PageHeader";
import { useEvaluation, useSites, useStats } from "../hooks/useSites";
import { ORBS, pct } from "../lib/utils";

function Kpi({ label, value, compare, delta, deltaOk, orb }: {
  label: string;
  value: string;
  compare: string;
  delta: string;
  deltaOk: boolean | null;
  orb: number;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-stone-200 bg-white px-5 py-5">
      <div
        className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full"
        style={{ background: `radial-gradient(circle, ${ORBS[orb]}, transparent 70%)` }}
      />
      <div className="relative text-[11px] font-semibold uppercase tracking-widest text-stone-400">
        {label}
      </div>
      <div className="relative mt-2.5 flex items-baseline gap-2">
        <span className="font-serif text-4xl leading-none text-stone-950">{value}</span>
        <span className="text-[13px] text-stone-400">{compare}</span>
      </div>
      <div
        className={`relative mt-3 inline-block rounded-full bg-chip px-3 py-1 text-xs font-medium ${
          deltaOk === null ? "text-stone-500" : deltaOk ? "text-green-600" : "text-red-600"
        }`}
      >
        {delta}
      </div>
    </div>
  );
}

function Bar({ metric, gnn, cos }: { metric: string; gnn: number; cos: number }) {
  return (
    <div>
      <div className="mb-1.5 flex justify-between text-[13px] text-stone-600">
        <span className="font-medium">{metric}</span>
        <span className="text-stone-400">
          GNN {gnn.toFixed(2)} / cos {cos.toFixed(2)}
        </span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-chip">
        <div className="h-full rounded-full bg-stone-800" style={{ width: pct(gnn) }} />
      </div>
      <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-chip">
        <div className="h-full rounded-full bg-stone-300" style={{ width: pct(cos) }} />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { data: sites } = useSites();
  const { data: stats } = useStats();
  const [siteId, setSiteId] = useState<number | null>(null);
  const activeSiteId = siteId ?? sites?.[0]?.id ?? null;
  const { data: ev, isError: noEval } = useEvaluation(activeSiteId);

  const scoped = stats?.filter((s) => s.site_id === activeSiteId);
  const reviewed =
    scoped?.reduce(
      (n, s) =>
        n +
        (s.suggestions_by_status.approved ?? 0) +
        (s.suggestions_by_status.rejected ?? 0) +
        (s.suggestions_by_status.applied ?? 0),
      0,
    ) ?? 0;
  const approval = scoped?.[0]?.approval_rate ?? null;
  const deltaR = ev ? ev.gnn.recall_at_k - ev.baseline.recall_at_k : null;

  return (
    <>
      <PageHeader
        title="Evaluation"
        sub="GraphSAGE v2 vs cosine baseline — temporal-split link recovery protocol (v0)"
      />
      <div className="relative overflow-y-auto px-8 py-6">
        <div className="mb-4 flex items-center gap-2">
          <select
            value={activeSiteId ?? ""}
            onChange={(e) => setSiteId(Number(e.target.value))}
            className="cursor-pointer rounded-full border border-stone-300 bg-white px-3.5 py-2 text-sm"
          >
            {sites?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          {ev && (
            <span className="text-[13px] text-stone-400">
              last run {new Date(ev.evaluated_at).toLocaleString()} · {ev.train_links} train /{" "}
              {ev.test_links} test links
            </span>
          )}
        </div>

        {ev ? (
          <>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-3">
              <Kpi
                label={`Recall@${ev.k}`}
                value={ev.gnn.recall_at_k.toFixed(2)}
                compare={`vs ${ev.baseline.recall_at_k.toFixed(2)}`}
                delta={`${deltaR! >= 0 ? "+" : ""}${Math.round(deltaR! * 100)} pts · target +10 ${ev.gate_passed ? "✓" : "✗"}`}
                deltaOk={ev.gate_passed}
                orb={0}
              />
              <Kpi
                label="MRR"
                value={ev.gnn.mrr.toFixed(2)}
                compare={`vs ${ev.baseline.mrr.toFixed(2)}`}
                delta={`${ev.gnn.mrr - ev.baseline.mrr >= 0 ? "+" : ""}${(ev.gnn.mrr - ev.baseline.mrr).toFixed(2)}`}
                deltaOk={ev.gnn.mrr >= ev.baseline.mrr}
                orb={2}
              />
              <Kpi
                label="Editor acceptance"
                value={approval !== null ? pct(approval) : "—"}
                compare={`${reviewed} reviewed`}
                delta="all time"
                deltaOk={null}
                orb={1}
              />
            </div>

            <div className="mt-3.5 rounded-2xl border border-stone-200 bg-white px-7 py-7">
              <div className="font-serif text-2xl">Temporal link recovery</div>
              <div className="mb-6 mt-1.5 text-sm leading-relaxed text-stone-500">
                Links first seen after the cutoff are held out; each method must predict them
                from the earlier graph. GraphSAGE (link prediction) vs cosine top-k baseline.
              </div>
              <div className="flex max-w-2xl flex-col gap-4">
                <Bar metric={`Recall@${ev.k}`} gnn={ev.gnn.recall_at_k} cos={ev.baseline.recall_at_k} />
                <Bar metric="MRR" gnn={ev.gnn.mrr} cos={ev.baseline.mrr} />
              </div>
              <div className="mt-5 flex gap-4 text-[12.5px] text-stone-500">
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-[3px] bg-stone-800" /> GraphSAGE v2
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-[3px] bg-stone-300" /> cosine baseline (v1)
                </span>
              </div>
            </div>
          </>
        ) : (
          <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 px-5 py-14 text-center text-[15px] leading-relaxed text-stone-500">
            {noEval
              ? "No evaluation run for this site yet."
              : "Loading evaluation…"}
            <div className="mt-2 text-[13px] text-stone-400">
              Run <code className="rounded bg-chip px-1.5 py-0.5">uv run python scripts/run_evaluation.py &lt;site_id&gt;</code>{" "}
              on the backend to populate this page.
            </div>
          </div>
        )}
      </div>
    </>
  );
}

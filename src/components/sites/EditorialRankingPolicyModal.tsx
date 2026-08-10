import { useState } from "react";

import {
  useEditorialRankingPolicy,
  useUpdateEditorialRankingPolicy,
} from "../../hooks/useSites";
import { errorDetail } from "../../lib/errors";
import type { EditorialRankingPolicy, Site } from "../../types/site";
import Modal from "../Modal";
import { ErrorPanel, SkeletonRows } from "../QueryState";

const toForm = (policy: EditorialRankingPolicy) => ({
  enabled: policy.enabled,
  minScore: String(policy.min_score_percent),
  weight: String(Math.round(policy.feedback_weight * 100)),
  minSamples: String(policy.min_samples),
});

export default function EditorialRankingPolicyModal({
  site,
  onClose,
  onSaved,
}: {
  site: Site;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const query = useEditorialRankingPolicy(site.id);
  const update = useUpdateEditorialRankingPolicy(site.id);
  const [draft, setDraft] = useState<Partial<ReturnType<typeof toForm>>>({});
  const [error, setError] = useState<string | null>(null);
  const form = query.data ? { ...toForm(query.data), ...draft } : null;
  const set = (patch: Partial<ReturnType<typeof toForm>>) => setDraft((current) => ({ ...current, ...patch }));

  const save = async () => {
    if (!form || update.isPending) return;
    setError(null);
    try {
      await update.mutateAsync({
        enabled: form.enabled,
        min_score_percent: Number(form.minScore),
        feedback_weight: Number(form.weight) / 100,
        min_samples: Number(form.minSamples),
      });
      onSaved("Editorial ranking policy saved.");
      onClose();
    } catch (caught) {
      setError(errorDetail(caught, "The editorial ranking policy could not be saved."));
    }
  };

  return (
    <Modal title={`Editorial ranking · ${site.name}`} onClose={onClose} panelClassName="max-w-xl">
      {query.isPending && <SkeletonRows count={4} label="Loading editorial ranking policy" />}
      {query.isError && <ErrorPanel title="Policy could not be loaded" description="The engine did not return this site's editorial feedback settings." onRetry={() => void query.refetch()} retrying={query.isFetching} />}
      {form && (
        <div className="flex flex-col gap-4">
          <label className="flex items-start gap-3 rounded-lg bg-surface-strong p-3">
            <input type="checkbox" checked={form.enabled} onChange={(event) => set({ enabled: event.target.checked })} />
            <span>
              <span className="block text-body-sm font-medium text-ink">Use editorial feedback in ranking</span>
              <span className="mt-1 block text-caption text-muted">Accepted and rejected suggestions adjust candidate order after enough decisions exist.</span>
            </span>
          </label>
          <label className="text-caption text-muted">
            Minimum semantic score (%)
            <input className="field mt-1" type="number" min={0} max={100} value={form.minScore} onChange={(event) => set({ minScore: event.target.value })} />
            <span className="mt-1 block text-caption-sm">Candidates below this site-specific threshold are not created.</span>
          </label>
          <label className="text-caption text-muted">
            Feedback weight (%)
            <input className="field mt-1" type="number" min={0} max={100} value={form.weight} onChange={(event) => set({ weight: event.target.value })} />
            <span className="mt-1 block text-caption-sm">How strongly historical editor acceptance can change the original Hybrid order.</span>
          </label>
          <label className="text-caption text-muted">
            Minimum decisions before learning
            <input className="field mt-1" type="number" min={1} max={10000} value={form.minSamples} onChange={(event) => set({ minSamples: event.target.value })} />
          </label>
          {error && <p role="alert" className="text-caption text-error-ink">{error}</p>}
          <div className="flex gap-2">
            <button type="button" className="btn btn-primary flex-1" disabled={update.isPending} onClick={() => void save()}>{update.isPending ? "Saving…" : "Save policy"}</button>
            <button type="button" className="btn btn-outline" onClick={onClose}>Cancel</button>
          </div>
        </div>
      )}
    </Modal>
  );
}

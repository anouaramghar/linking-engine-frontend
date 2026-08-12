import { useId, useState } from "react";

import {
  useExternalLinkPolicy,
  useExternalSourceEvaluations,
  useUpdateExternalLinkPolicy,
} from "../../hooks/useSites";
import { errorDetail } from "../../lib/errors";
import type {
  ExternalLinkPolicy,
  ExternalLinkPolicyUpdate,
  Site,
} from "../../types/site";
import Modal from "../Modal";
import { ErrorPanel, SkeletonRows } from "../QueryState";

const listText = (values: string[]) => values.join("\n");

const parseList = (value: string) =>
  [...new Set(value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean))];

const toForm = (policy: ExternalLinkPolicy) => ({
  external_links_enabled: policy.external_links_enabled,
  require_https: policy.require_https,
  min_trust_score: String(policy.min_trust_score),
  min_domain_age_days: String(policy.min_domain_age_days),
  trusted_tlds: listText(policy.trusted_tlds),
  allowlist_domains: listText(policy.allowlist_domains),
  blocklist_domains: listText(policy.blocklist_domains),
  competitor_domains: listText(policy.competitor_domains),
});

type PolicyForm = ReturnType<typeof toForm>;

function DomainListField({
  id,
  label,
  help,
  value,
  onChange,
}: {
  id: string;
  label: string;
  help: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label htmlFor={id} className="block">
      <span className="mb-1 block text-caption font-medium text-ink">{label}</span>
      <textarea
        id={id}
        className="field min-h-24 resize-y"
        placeholder="example.com"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <span className="mt-1 block text-caption-sm leading-relaxed text-muted">{help}</span>
    </label>
  );
}

export default function ExternalLinkPolicyModal({
  site,
  onClose,
  onSaved,
}: {
  site: Site;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const policyQuery = useExternalLinkPolicy(site.id);
  const sourcesQuery = useExternalSourceEvaluations(site.id);
  const update = useUpdateExternalLinkPolicy(site.id);
  const [draft, setDraft] = useState<Partial<PolicyForm>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const prefix = useId();

  const form = policyQuery.data ? { ...toForm(policyQuery.data), ...draft } : null;

  const set = (patch: Partial<PolicyForm>) =>
    setDraft((current) => ({ ...current, ...patch }));

  const save = async () => {
    if (!form || update.isPending) return;
    setFormError(null);
    const payload: ExternalLinkPolicyUpdate = {
      external_links_enabled: form.external_links_enabled,
      require_https: form.require_https,
      min_trust_score: Number(form.min_trust_score),
      min_domain_age_days: Number(form.min_domain_age_days),
      trusted_tlds: parseList(form.trusted_tlds),
      allowlist_domains: parseList(form.allowlist_domains),
      blocklist_domains: parseList(form.blocklist_domains),
      competitor_domains: parseList(form.competitor_domains),
    };
    try {
      const saved = await update.mutateAsync(payload);
      onSaved(
        saved.expired_suggestions
          ? `External link policy saved. ${saved.expired_suggestions} blocked suggestions expired.`
          : "External link policy saved.",
      );
      onClose();
    } catch (error) {
      setFormError(errorDetail(error, "The external link policy could not be saved."));
    }
  };

  return (
    <Modal
      title={`External link policy — ${site.name}`}
      onClose={onClose}
      panelClassName="max-w-4xl"
    >
      {policyQuery.isPending && <SkeletonRows count={4} label="Loading external link policy" />}
      {policyQuery.isError && (
        <ErrorPanel
          title="External link policy could not be loaded"
          description="The engine did not return this site's safety rules."
          onRetry={() => void policyQuery.refetch()}
          retrying={policyQuery.isFetching}
        />
      )}

      {form && (
        <div className="space-y-5">
          <div className="rounded-lg border border-hairline bg-canvas-soft p-4 text-caption leading-relaxed text-muted">
            Owned-domain protection is always on: external suggestions can never point to another
            managed site. Blocked and competitor domains override every score or allowlist entry.
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex items-start gap-3 rounded-lg border border-hairline p-4">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-primary"
                checked={form.external_links_enabled}
                onChange={(event) => set({ external_links_enabled: event.target.checked })}
              />
              <span>
                <span className="block text-body-sm font-medium text-ink">
                  Enable external suggestions
                </span>
                <span className="mt-1 block text-caption text-muted">
                  Turning this off expires pending and approved external suggestions.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-3 rounded-lg border border-hairline p-4">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-primary"
                checked={form.require_https}
                onChange={(event) => set({ require_https: event.target.checked })}
              />
              <span>
                <span className="block text-body-sm font-medium text-ink">Require HTTPS</span>
                <span className="mt-1 block text-caption text-muted">
                  Reject targets that do not use encrypted HTTPS URLs.
                </span>
              </span>
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <label htmlFor={`${prefix}-score`}>
              <span className="mb-1 block text-caption font-medium text-ink">
                Minimum trust score
              </span>
              <input
                id={`${prefix}-score`}
                className="field"
                type="number"
                min="0"
                max="100"
                required
                value={form.min_trust_score}
                onChange={(event) => set({ min_trust_score: event.target.value })}
              />
              <span className="mt-1 block text-caption-sm text-muted">0–100; default 60.</span>
            </label>
            <label htmlFor={`${prefix}-age`}>
              <span className="mb-1 block text-caption font-medium text-ink">
                Minimum domain age
              </span>
              <input
                id={`${prefix}-age`}
                className="field"
                type="number"
                min="0"
                max="36500"
                required
                value={form.min_domain_age_days}
                onChange={(event) => set({ min_domain_age_days: event.target.value })}
              />
              <span className="mt-1 block text-caption-sm text-muted">
                Days; 0 accepts unknown age.
              </span>
            </label>
            <label htmlFor={`${prefix}-tlds`}>
              <span className="mb-1 block text-caption font-medium text-ink">Trusted TLDs</span>
              <input
                id={`${prefix}-tlds`}
                className="field"
                placeholder="com, org, gov"
                value={form.trusted_tlds}
                onChange={(event) => set({ trusted_tlds: event.target.value })}
              />
              <span className="mt-1 block text-caption-sm text-muted">
                Empty accepts every top-level domain.
              </span>
            </label>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <DomainListField
              id={`${prefix}-allow`}
              label="Allowed domains"
              help="Adds trust points. One domain per line or comma-separated."
              value={form.allowlist_domains}
              onChange={(value) => set({ allowlist_domains: value })}
            />
            <DomainListField
              id={`${prefix}-block`}
              label="Blocked domains"
              help="Always rejected, including subdomains."
              value={form.blocklist_domains}
              onChange={(value) => set({ blocklist_domains: value })}
            />
            <DomainListField
              id={`${prefix}-competitors`}
              label="Competitor domains"
              help="Never suggested or published for this site."
              value={form.competitor_domains}
              onChange={(value) => set({ competitor_domains: value })}
            />
          </div>

          <section aria-labelledby={`${prefix}-sources`}>
            <div className="mb-2 flex items-end justify-between gap-3">
              <div>
                <h3 id={`${prefix}-sources`} className="text-body-md font-medium text-ink">
                  Approved source preview
                </h3>
                <p className="mt-0.5 text-caption text-muted">
                  Source score is a preview; every article URL is checked again during ranking.
                </p>
              </div>
              {policyQuery.data?.updated_at && (
                <span className="text-caption-sm text-muted">
                  Last saved by {policyQuery.data.updated_by ?? "system"}
                </span>
              )}
            </div>
            {sourcesQuery.isPending && <SkeletonRows count={2} label="Loading source trust" />}
            {sourcesQuery.isError && (
              <ErrorPanel
                title="Source trust preview could not be loaded"
                description="You can still save the policy and retry this preview later."
                onRetry={() => void sourcesQuery.refetch()}
                retrying={sourcesQuery.isFetching}
              />
            )}
            {sourcesQuery.data?.length === 0 && (
              <div className="rounded-lg border border-hairline p-4 text-caption text-muted">
                No content-pool sources are connected yet.
              </div>
            )}
            {!!sourcesQuery.data?.length && (
              <div className="overflow-x-auto rounded-lg border border-hairline">
                <table className="w-full min-w-[620px] text-left text-caption">
                  <thead className="bg-canvas-soft text-muted">
                    <tr>
                      <th className="px-3 py-2 font-medium">Source</th>
                      <th className="px-3 py-2 font-medium">Trust</th>
                      <th className="px-3 py-2 font-medium">Articles</th>
                      <th className="px-3 py-2 font-medium">Decision</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-hairline">
                    {sourcesQuery.data.map((source) => (
                      <tr key={source.site_id}>
                        <td className="px-3 py-3">
                          <span className="block font-medium text-ink">{source.site_name}</span>
                          <span className="text-muted">{source.domain}</span>
                        </td>
                        <td className="px-3 py-3 text-ink">{source.trust_score}/100</td>
                        <td className="px-3 py-3 text-muted">
                          {source.eligible_articles} eligible · {source.blocked_articles} blocked
                        </td>
                        <td className="px-3 py-3">
                          <span className="badge">
                            <span className={`dot ${source.eligible ? "bg-success" : "bg-error"}`} />
                            {source.eligible ? "Eligible" : "Blocked"}
                          </span>
                          {!source.eligible && source.reasons.length > 0 && (
                            <span className="mt-1 block max-w-xs text-caption-sm text-error-ink">
                              {source.reasons.join("; ")}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {formError && (
            <div role="alert" className="rounded-lg bg-error-soft px-4 py-3 text-caption text-error-ink">
              {formError}
            </div>
          )}

          <div className="flex justify-end gap-2 border-t border-hairline pt-4">
            <button type="button" className="btn btn-outline" onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={update.isPending}
              onClick={() => void save()}
            >
              {update.isPending ? "Saving…" : "Save policy"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

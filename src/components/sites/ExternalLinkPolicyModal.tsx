import { useId, useState } from "react";

import {
  useExternalLinkPolicy,
  useExternalSourceEvaluations,
  useUpdateExternalLinkPolicy,
} from "../../hooks/useSites";
import { useSuggestionCounts } from "../../hooks/useSuggestions";
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

const added = (before: string[], after: string[]) =>
  after.filter((value) => !before.includes(value));
const removed = (before: string[], after: string[]) =>
  before.filter((value) => !after.includes(value));
const listPhrase = (values: string[]) =>
  values.length > 3 ? `${values.slice(0, 3).join(", ")} and ${values.length - 3} more` : values.join(", ");

/**
 * The edits in this draft that can expire an existing approved suggestion.
 *
 * Saving this form is not a settings change that takes effect next time: the
 * engine re-evaluates every external suggestion against the new rules
 * immediately and expires the ones that no longer pass — including ones an
 * editor has already approved for publication. Only tightening can do that, so
 * only tightening is worth stopping the operator for. Loosening a rule is
 * saved without a prompt.
 */
const tighteningChanges = (
  saved: ExternalLinkPolicy,
  next: ExternalLinkPolicyUpdate,
): string[] => {
  const changes: string[] = [];
  if (saved.external_links_enabled && !next.external_links_enabled) {
    changes.push("External suggestions are being turned off for this site.");
  }
  if (!saved.require_https && next.require_https) {
    changes.push("HTTPS becomes mandatory, so every plain-HTTP target is rejected.");
  }
  if (next.min_trust_score > saved.min_trust_score) {
    changes.push(
      `Minimum trust score rises from ${saved.min_trust_score} to ${next.min_trust_score}.`,
    );
  }
  if (next.min_domain_age_days > saved.min_domain_age_days) {
    changes.push(
      `Minimum domain age rises from ${saved.min_domain_age_days} to ${next.min_domain_age_days} days.`,
    );
  }
  if (!saved.trusted_tlds.length && next.trusted_tlds.length) {
    changes.push(
      `Only these top-level domains stay eligible: ${listPhrase(next.trusted_tlds)}.`,
    );
  } else {
    const droppedTlds = removed(saved.trusted_tlds, next.trusted_tlds);
    if (droppedTlds.length) {
      changes.push(`Top-level domains no longer trusted: ${listPhrase(droppedTlds)}.`);
    }
  }
  if (!saved.allowlist_domains.length && next.allowlist_domains.length) {
    changes.push(
      "An allowlist is being introduced, which lowers the trust score of every domain not on it.",
    );
  } else {
    const droppedAllow = removed(saved.allowlist_domains, next.allowlist_domains);
    if (droppedAllow.length) {
      changes.push(`Removed from the allowlist: ${listPhrase(droppedAllow)}.`);
    }
  }
  const newBlocks = added(saved.blocklist_domains, next.blocklist_domains);
  if (newBlocks.length) changes.push(`Newly blocked: ${listPhrase(newBlocks)}.`);
  const newCompetitors = added(saved.competitor_domains, next.competitor_domains);
  if (newCompetitors.length) {
    changes.push(`Newly marked as competitors: ${listPhrase(newCompetitors)}.`);
  }
  return changes;
};

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
  const [pendingChanges, setPendingChanges] = useState<string[] | null>(null);
  const prefix = useId();
  // What the tightening could take away, fetched only while this modal is open.
  // Two queries because the policy re-check covers both kinds of outward link
  // this site can hold — a web-search target and a content-pool target on
  // another site — and the counts endpoint takes one origin at a time. Internal
  // links are untouched by this policy and are deliberately not counted.
  const enabled = Boolean(policyQuery.data);
  const webSearchAtRisk = useSuggestionCounts(
    { siteId: site.id, targetOrigin: "web_search" },
    enabled,
  );
  const poolAtRisk = useSuggestionCounts(
    { siteId: site.id, targetOrigin: "content_pool" },
    enabled,
  );
  const atRisk =
    webSearchAtRisk.data && poolAtRisk.data
      ? {
          pending: webSearchAtRisk.data.pending + poolAtRisk.data.pending,
          approved: webSearchAtRisk.data.approved + poolAtRisk.data.approved,
        }
      : null;

  const form = policyQuery.data ? { ...toForm(policyQuery.data), ...draft } : null;

  const set = (patch: Partial<PolicyForm>) => {
    setPendingChanges(null);
    setDraft((current) => ({ ...current, ...patch }));
  };

  const payloadOf = (current: PolicyForm): ExternalLinkPolicyUpdate => ({
    external_links_enabled: current.external_links_enabled,
    require_https: current.require_https,
    min_trust_score: Number(current.min_trust_score),
    min_domain_age_days: Number(current.min_domain_age_days),
    trusted_tlds: parseList(current.trusted_tlds),
    allowlist_domains: parseList(current.allowlist_domains),
    blocklist_domains: parseList(current.blocklist_domains),
    competitor_domains: parseList(current.competitor_domains),
  });

  const save = async () => {
    if (!form || update.isPending) return;
    setFormError(null);
    const payload = payloadOf(form);
    try {
      const saved = await update.mutateAsync(payload);
      onSaved(
        saved.expired_suggestions
          ? `External link policy saved. ${saved.expired_suggestions} blocked suggestions expired.`
          : "External link policy saved.",
      );
      onClose();
    } catch (error) {
      setPendingChanges(null);
      setFormError(errorDetail(error, "The external link policy could not be saved."));
    }
  };

  /** Confirm first when the draft can expire work an editor has already approved. */
  const requestSave = () => {
    if (!form || !policyQuery.data || update.isPending) return;
    const changes = tighteningChanges(policyQuery.data, payloadOf(form));
    if (!changes.length) {
      void save();
      return;
    }
    setFormError(null);
    setPendingChanges(changes);
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
                  New managed sites start with this off. Enable it only for the separate external-linking
                  capability; turning it off expires pending and approved external suggestions.
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
            <div
              role="alert"
              className="rounded-lg border border-error/30 bg-error/5 px-4 py-3 text-caption text-error-ink"
            >
              {formError}
            </div>
          )}

          {pendingChanges && (
            <div
              role="alert"
              aria-labelledby={`${prefix}-confirm`}
              className="rounded-lg border border-error/30 bg-error/5 px-4 py-3"
            >
              <h3 id={`${prefix}-confirm`} className="text-body-sm font-medium text-error-ink">
                This tightens the policy and expires suggestions now
              </h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-caption leading-relaxed text-error-ink">
                {pendingChanges.map((change) => (
                  <li key={change}>{change}</li>
                ))}
              </ul>
              <p className="mt-2 text-caption leading-relaxed text-error-ink">
                {atRisk
                  ? `${atRisk.pending} pending and ${atRisk.approved} approved outward suggestions are re-checked against the new rules. Any that no longer pass expire immediately, approved ones included, and expiry cannot be undone.`
                  : "Every pending and approved outward suggestion for this site is re-checked against the new rules. Any that no longer pass expire immediately, approved ones included, and expiry cannot be undone."}
              </p>
            </div>
          )}

          <div className="flex justify-end gap-2 border-t border-hairline pt-4">
            <button
              type="button"
              className="btn btn-outline"
              onClick={pendingChanges ? () => setPendingChanges(null) : onClose}
            >
              {pendingChanges ? "Back to editing" : "Cancel"}
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={update.isPending}
              onClick={pendingChanges ? () => void save() : requestSave}
            >
              {update.isPending
                ? "Saving…"
                : pendingChanges
                  ? "Save and expire blocked suggestions"
                  : "Save policy"}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

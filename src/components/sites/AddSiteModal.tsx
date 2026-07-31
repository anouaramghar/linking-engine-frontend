import { useId, useState } from "react";

import Modal from "../Modal";
import { useCreateSite } from "../../hooks/useSites";
import { errorDetail } from "../../lib/errors";
import type { SiteCreate } from "../../types/site";

export default function AddSiteModal({ onClose }: { onClose: () => void }) {
  const create = useCreateSite();
  const [form, setForm] = useState<SiteCreate>({ name: "", base_url: "", platform: "wordpress" });
  const nameId = useId();
  const urlId = useId();
  const platformId = useId();
  const usernameId = useId();
  const passwordId = useId();
  const credentialsHintId = useId();

  const set = (patch: Partial<SiteCreate>) => setForm((f) => ({ ...f, ...patch }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    create.mutate(form, { onSuccess: onClose });
  };

  return (
    <Modal title="Connect a site" onClose={onClose} panelClassName="max-w-md">
      <form onSubmit={submit}>
        <div className="flex flex-col gap-4">
          <div>
            <label htmlFor={nameId} className="mb-1.5 block text-caption font-medium text-ink">
              Site name <span className="font-normal text-muted">(required)</span>
            </label>
            <input
              id={nameId}
              name="site-name"
              className="field"
              placeholder="The Trail Post"
              autoComplete="organization"
              value={form.name}
              onChange={(e) => set({ name: e.target.value })}
              required
            />
          </div>
          <div>
            <label htmlFor={urlId} className="mb-1.5 block text-caption font-medium text-ink">
              Site URL <span className="font-normal text-muted">(required)</span>
            </label>
            <input
              id={urlId}
              name="site-url"
              className="field"
              placeholder="https://example.com"
              type="url"
              autoComplete="url"
              value={form.base_url}
              onChange={(e) => set({ base_url: e.target.value })}
              required
            />
          </div>
          <div>
            <label htmlFor={platformId} className="mb-1.5 block text-caption font-medium text-ink">
              Connector
            </label>
            <select
              id={platformId}
              name="platform"
              className="field"
              value={form.platform}
              onChange={(e) => set({ platform: e.target.value as SiteCreate["platform"] })}
            >
              <option value="wordpress">WordPress (REST API)</option>
              <option value="html">Static HTML (sitemap crawl)</option>
            </select>
          </div>
          {form.platform === "wordpress" && (
            <>
              <p id={credentialsHintId} className="-mb-1 text-caption leading-relaxed text-muted">
                WordPress credentials are optional. Add them only when LinkMesh should publish
                approved links back to this site.
              </p>
              <div>
                <label
                  htmlFor={usernameId}
                  className="mb-1.5 block text-caption font-medium text-ink"
                >
                  WordPress username <span className="font-normal text-muted">(optional)</span>
                </label>
                <input
                  id={usernameId}
                  name="wp-username"
                  className="field"
                  autoComplete="username"
                  aria-describedby={credentialsHintId}
                  value={form.wp_username ?? ""}
                  onChange={(e) => set({ wp_username: e.target.value || undefined })}
                />
              </div>
              <div>
                <label
                  htmlFor={passwordId}
                  className="mb-1.5 block text-caption font-medium text-ink"
                >
                  Application password <span className="font-normal text-muted">(optional)</span>
                </label>
                <input
                  id={passwordId}
                  name="wp-application-password"
                  className="field"
                  type="password"
                  autoComplete="current-password"
                  aria-describedby={credentialsHintId}
                  value={form.wp_app_password ?? ""}
                  onChange={(e) => set({ wp_app_password: e.target.value || undefined })}
                />
              </div>
            </>
          )}
        </div>
        {create.isError && (
          <div role="alert" className="mt-3 text-caption text-error">
            {errorDetail(create.error, "Could not create the site.")}
          </div>
        )}
        <div className="mt-6 flex gap-2">
          <button type="submit" disabled={create.isPending} className="btn btn-primary flex-1">
            {create.isPending ? "Connecting…" : "Connect site"}
          </button>
          <button type="button" onClick={onClose} className="btn btn-outline">
            Cancel
          </button>
        </div>
      </form>
    </Modal>
  );
}

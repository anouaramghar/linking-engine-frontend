import { useState } from "react";

import Modal from "../Modal";
import { useCreateSite } from "../../hooks/useSites";
import { errorDetail } from "../../lib/errors";
import type { SiteCreate } from "../../types/site";

export default function AddSiteModal({ onClose }: { onClose: () => void }) {
  const create = useCreateSite();
  const [form, setForm] = useState<SiteCreate>({ name: "", base_url: "", platform: "wordpress" });

  const set = (patch: Partial<SiteCreate>) => setForm((f) => ({ ...f, ...patch }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    create.mutate(form, { onSuccess: onClose });
  };

  return (
    <Modal title="Connect a site" onClose={onClose} panelClassName="max-w-md">
      <form onSubmit={submit}>
        <div className="flex flex-col gap-3">
          <input
            className="field"
            placeholder="Name — e.g. The Trail Post"
            value={form.name}
            onChange={(e) => set({ name: e.target.value })}
            required
          />
          <input
            className="field"
            placeholder="https://example.com"
            type="url"
            value={form.base_url}
            onChange={(e) => set({ base_url: e.target.value })}
            required
          />
          <select
            className="field"
            value={form.platform}
            onChange={(e) => set({ platform: e.target.value as SiteCreate["platform"] })}
          >
            <option value="wordpress">WordPress (REST API)</option>
            <option value="html">Static HTML (sitemap crawl)</option>
          </select>
          {form.platform === "wordpress" && (
            <>
              <input
                className="field"
                placeholder="WP username (for write-back)"
                value={form.wp_username ?? ""}
                onChange={(e) => set({ wp_username: e.target.value || undefined })}
              />
              <input
                className="field"
                placeholder="WP application password"
                type="password"
                value={form.wp_app_password ?? ""}
                onChange={(e) => set({ wp_app_password: e.target.value || undefined })}
              />
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

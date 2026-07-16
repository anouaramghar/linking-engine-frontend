import { useState } from "react";

import { useCreateSite } from "../../hooks/useSites";
import type { SiteCreate } from "../../types/site";

export default function AddSiteModal({ onClose }: { onClose: () => void }) {
  const create = useCreateSite();
  const [form, setForm] = useState<SiteCreate>({ name: "", base_url: "", platform: "wordpress" });

  const set = (patch: Partial<SiteCreate>) => setForm((f) => ({ ...f, ...patch }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    create.mutate(form, { onSuccess: onClose });
  };

  const field =
    "w-full rounded-xl border border-stone-300 bg-white px-3.5 py-2.5 text-sm focus:border-stone-950 focus:outline-none";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/30 p-4" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-stone-200 bg-stone-50 p-7"
      >
        <div className="mb-5 font-serif text-2xl">Connect a site</div>
        <div className="flex flex-col gap-3">
          <input
            className={field}
            placeholder="Name — e.g. The Trail Post"
            value={form.name}
            onChange={(e) => set({ name: e.target.value })}
            required
          />
          <input
            className={field}
            placeholder="https://example.com"
            type="url"
            value={form.base_url}
            onChange={(e) => set({ base_url: e.target.value })}
            required
          />
          <select
            className={field}
            value={form.platform}
            onChange={(e) => set({ platform: e.target.value as SiteCreate["platform"] })}
          >
            <option value="wordpress">WordPress (REST API)</option>
            <option value="html">Static HTML (sitemap crawl)</option>
          </select>
          {form.platform === "wordpress" && (
            <>
              <input
                className={field}
                placeholder="WP username (for write-back)"
                value={form.wp_username ?? ""}
                onChange={(e) => set({ wp_username: e.target.value || undefined })}
              />
              <input
                className={field}
                placeholder="WP application password"
                type="password"
                value={form.wp_app_password ?? ""}
                onChange={(e) => set({ wp_app_password: e.target.value || undefined })}
              />
            </>
          )}
        </div>
        {create.isError && (
          <div className="mt-3 text-sm text-red-600">
            {(create.error as { response?: { data?: { detail?: string } } }).response?.data
              ?.detail ?? "Could not create the site."}
          </div>
        )}
        <div className="mt-6 flex gap-2">
          <button
            type="submit"
            disabled={create.isPending}
            className="flex-1 rounded-full border border-stone-800 bg-stone-800 py-2.5 text-[15px] font-medium text-white hover:bg-stone-950 disabled:opacity-50"
          >
            {create.isPending ? "Connecting…" : "Connect site"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-stone-300 px-5 py-2.5 text-[15px] font-medium hover:border-stone-950"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

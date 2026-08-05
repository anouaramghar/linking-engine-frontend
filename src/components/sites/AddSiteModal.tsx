import { useId, useRef, useState } from "react";

import Modal from "../Modal";
import { useCreateSite } from "../../hooks/useSites";
import { errorDetail } from "../../lib/errors";
import type { SiteCreate } from "../../types/site";

/** Which control a validation failure belongs to, so it can say so and be reached. */
type ErrorField = "base_url" | "credentials";

export default function AddSiteModal({ onClose }: { onClose: () => void }) {
  const create = useCreateSite();
  const [form, setForm] = useState<SiteCreate>({ name: "", base_url: "", platform: "wordpress" });
  const [clientError, setClientError] = useState<{
    field: ErrorField;
    message: string;
  } | null>(null);
  const nameId = useId();
  const urlId = useId();
  const platformId = useId();
  const usernameId = useId();
  const passwordId = useId();
  const credentialsHintId = useId();
  const errorId = useId();
  const urlInput = useRef<HTMLInputElement>(null);
  const usernameInput = useRef<HTMLInputElement>(null);

  const set = (patch: Partial<SiteCreate>) => setForm((f) => ({ ...f, ...patch }));

  // An alert that only announces itself leaves the user hunting for the field
  // it is about. Naming the field, describing it from the message, and moving
  // the cursor there is what turns the alert into a recovery.
  const fail = (field: ErrorField, message: string) => {
    setClientError({ field, message });
    (field === "base_url" ? urlInput : usernameInput).current?.focus();
  };

  const invalid = (field: ErrorField) => clientError?.field === field;
  const describedBy = (field: ErrorField, ...ids: string[]) =>
    [...ids, invalid(field) ? errorId : null].filter(Boolean).join(" ") || undefined;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setClientError(null);
    let baseUrl: string;
    try {
      const parsed = new URL(form.base_url.trim());
      if (!["http:", "https:"].includes(parsed.protocol)) throw new Error();
      baseUrl = parsed.toString().replace(/\/$/, "");
    } catch {
      fail("base_url", "Enter a complete URL starting with http:// or https://.");
      return;
    }
    if (
      form.platform === "wordpress" &&
      Boolean(form.wp_username) !== Boolean(form.wp_app_password)
    ) {
      fail("credentials", "Provide both WordPress credentials, or leave both blank.");
      return;
    }
    create.mutate({ ...form, name: form.name.trim(), base_url: baseUrl }, { onSuccess: onClose });
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
              ref={urlInput}
              id={urlId}
              name="site-url"
              className={`field ${invalid("base_url") ? "border-error" : ""}`}
              placeholder="https://example.com"
              type="url"
              autoComplete="url"
              aria-invalid={invalid("base_url") || undefined}
              aria-describedby={describedBy("base_url")}
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
              onChange={(e) => {
                const platform = e.target.value as SiteCreate["platform"];
                set({
                  platform,
                  ...(platform === "wordpress"
                    ? {}
                    : { wp_username: undefined, wp_app_password: undefined }),
                });
              }}
            >
              <option value="wordpress">WordPress (REST API)</option>
              <option value="html">Static HTML (sitemap crawl)</option>
              <option value="pool">Content pool (RSS or Wikipedia)</option>
            </select>
            {form.platform === "pool" && (
              <p className="mt-1.5 text-caption leading-relaxed text-muted">
                Use an RSS/Atom feed URL or a Wikipedia article URL. Pool content is a read-only
                suggestion target and refreshes daily.
              </p>
            )}
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
                  ref={usernameInput}
                  id={usernameId}
                  name="wp-username"
                  className={`field ${invalid("credentials") ? "border-error" : ""}`}
                  autoComplete="username"
                  aria-invalid={invalid("credentials") || undefined}
                  aria-describedby={describedBy("credentials", credentialsHintId)}
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
                  className={`field ${invalid("credentials") ? "border-error" : ""}`}
                  type="password"
                  autoComplete="current-password"
                  aria-invalid={invalid("credentials") || undefined}
                  aria-describedby={describedBy("credentials", credentialsHintId)}
                  value={form.wp_app_password ?? ""}
                  onChange={(e) => set({ wp_app_password: e.target.value || undefined })}
                />
              </div>
            </>
          )}
        </div>
        {(clientError || create.isError) && (
          <div id={errorId} role="alert" className="mt-3 text-caption text-error-ink">
            {clientError?.message ?? errorDetail(create.error, "Could not create the site.")}
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

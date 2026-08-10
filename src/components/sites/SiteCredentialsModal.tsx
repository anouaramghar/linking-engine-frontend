import { useId, useRef, useState } from "react";

import Modal from "../Modal";
import {
  useClearWordPressCredentials,
  useSetWordPressCredentials,
} from "../../hooks/useSites";
import { errorDetail } from "../../lib/errors";
import type { Site } from "../../types/site";

/**
 * Attach, replace, or detach the WordPress account a site publishes through.
 *
 * Until this existed a credential could only be set while creating the site, so
 * a revoked or rotated application password meant deleting the site — and its
 * articles, its internal links, and its whole review history — to fix it.
 */
export default function SiteCredentialsModal({
  site,
  onClose,
  onDone,
}: {
  site: Site;
  onClose: () => void;
  /** Reports the outcome to the page, which owns the notice line. */
  onDone: (message: string) => void;
}) {
  const save = useSetWordPressCredentials();
  const clear = useClearWordPressCredentials();
  const attached = site.has_wordpress_credentials === true;

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [clientError, setClientError] = useState<string | null>(null);
  const [confirmingClear, setConfirmingClear] = useState(false);
  const usernameId = useId();
  const passwordId = useId();
  const hintId = useId();
  const errorId = useId();
  const usernameInput = useRef<HTMLInputElement>(null);

  const busy = save.isPending || clear.isPending;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setClientError(null);
    // The engine rejects a half pair too, but saying so here keeps the cursor
    // in the form instead of sending a request that can only fail.
    if (!username.trim() || !password.trim()) {
      setClientError("Both the username and the application password are required.");
      usernameInput.current?.focus();
      return;
    }
    save.mutate(
      {
        id: site.id,
        credentials: { wp_username: username.trim(), wp_app_password: password.trim() },
      },
      {
        onSuccess: () => {
          onDone(
            attached
              ? `Replaced the WordPress account for ${site.name}.`
              : `${site.name} can now publish approved edits.`,
          );
          onClose();
        },
      },
    );
  };

  const remove = () =>
    clear.mutate(site.id, {
      onSuccess: () => {
        onDone(`${site.name} no longer has a WordPress account, so it cannot publish.`);
        onClose();
      },
    });

  return (
    <Modal title={`WordPress account · ${site.name}`} onClose={onClose}>
      <form onSubmit={submit}>
        <p id={hintId} className="text-caption leading-relaxed text-muted">
          {attached
            ? "An account is attached. Publication reads every post for editing before it writes, so entering a new application password here replaces the stored one."
            : "Without an account, this site's exact edits cannot be prepared: WordPress refuses to return a post for editing to an anonymous caller."}{" "}
          Use an application password for a user who can edit posts — not the login password.
        </p>

        <div className="mt-4 flex flex-col gap-4">
          <div>
            <label htmlFor={usernameId} className="mb-1.5 block text-caption font-medium text-ink">
              WordPress username
            </label>
            <input
              ref={usernameInput}
              id={usernameId}
              name="wp-username"
              className={`field ${clientError ? "border-error" : ""}`}
              autoComplete="username"
              aria-invalid={clientError ? true : undefined}
              aria-describedby={[hintId, clientError ? errorId : null]
                .filter(Boolean)
                .join(" ")}
              value={username}
              onChange={(event) => setUsername(event.target.value)}
            />
          </div>
          <div>
            <label htmlFor={passwordId} className="mb-1.5 block text-caption font-medium text-ink">
              Application password
            </label>
            <input
              id={passwordId}
              name="wp-application-password"
              className={`field ${clientError ? "border-error" : ""}`}
              type="password"
              autoComplete="new-password"
              aria-invalid={clientError ? true : undefined}
              aria-describedby={[hintId, clientError ? errorId : null]
                .filter(Boolean)
                .join(" ")}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </div>
        </div>

        {(clientError || save.isError || clear.isError) && (
          <div id={errorId} role="alert" className="mt-3 text-caption text-error-ink">
            {clientError ??
              errorDetail(
                save.error ?? clear.error,
                "The WordPress account could not be saved.",
              )}
          </div>
        )}

        <div className="mt-6 flex flex-wrap gap-2">
          <button type="submit" disabled={busy} className="btn btn-primary flex-1">
            {save.isPending ? "Saving…" : attached ? "Replace account" : "Attach account"}
          </button>
          <button type="button" onClick={onClose} disabled={busy} className="btn btn-outline">
            Cancel
          </button>
        </div>

        {attached && (
          // Detaching stops publication for the site, so it asks first rather
          // than sitting one click away from the save button.
          <div className="mt-4 border-t border-hairline pt-4">
            {confirmingClear ? (
              <div className="flex flex-wrap items-center gap-3">
                <span className="min-w-0 flex-1 text-caption text-body">
                  Remove the account? {site.name} keeps crawling, and stops being able to
                  publish.
                </span>
                <button
                  type="button"
                  onClick={() => setConfirmingClear(false)}
                  disabled={busy}
                  className="btn btn-outline btn-sm"
                >
                  Keep it
                </button>
                <button
                  type="button"
                  onClick={remove}
                  disabled={busy}
                  className="btn btn-primary btn-sm"
                >
                  {clear.isPending ? "Removing…" : "Remove account"}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmingClear(true)}
                disabled={busy}
                className="text-caption font-medium text-ink underline underline-offset-2 hover:text-primary"
              >
                Remove this account
              </button>
            )}
          </div>
        )}
      </form>
    </Modal>
  );
}

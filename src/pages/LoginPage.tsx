import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { pollLogin, startLogin, type LoginState } from "../api/auth";
import LogoLoadingAnimation from "../components/LogoLoadingAnimation";
import { SESSION_QUERY_KEY } from "../hooks/useSession";

const POLL_INTERVAL_MS = 2000;

/** Everything except `waiting` is final for one nonce, so polling stops there. */
const EXPLANATION: Record<Exclude<LoginState, "waiting" | "approved">, string> = {
  pending:
    "Your request has been recorded. Someone already on the dashboard has to approve it before you can sign in — this page will work once they do.",
  revoked: "This account's access has been removed. Ask an approved teammate to restore it.",
  invalid: "That sign-in link expired or was already used. Start again to get a new one.",
};

export default function LoginPage() {
  const queryClient = useQueryClient();
  const [nonce, setNonce] = useState<string | null>(null);

  const start = useMutation({
    mutationFn: startLogin,
    onSuccess: (data) => setNonce(data.nonce),
  });

  const poll = useQuery({
    queryKey: ["login", nonce],
    queryFn: () => pollLogin(nonce!),
    enabled: nonce !== null,
    // The server decides when this is over: it answers `invalid` once the nonce
    // expires, so the browser needs no timer of its own.
    refetchInterval: (query) => (query.state.data?.state === "waiting" ? POLL_INTERVAL_MS : false),
    retry: false,
  });

  const state = poll.data?.state;

  useEffect(() => {
    // The cookie arrived on the polling response. Re-asking who we are is what
    // swaps this screen for the dashboard.
    if (state === "approved") queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
  }, [state, queryClient]);

  const deepLink = start.data?.deep_link;
  const waiting = nonce !== null && (state === undefined || state === "waiting");
  const finalState = state && state !== "waiting" && state !== "approved" ? state : null;
  const unconfigured = start.error !== null && !start.isPending;

  return (
    <main className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden px-4 py-10">
      <div className="pointer-events-none absolute -right-20 -top-32 h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle,theme(colors.orb-lavender/35%),transparent_70%)]" />
      <div className="pointer-events-none absolute -bottom-36 -left-20 h-[380px] w-[380px] rounded-full bg-[radial-gradient(circle,theme(colors.orb-mint/28%),transparent_70%)]" />

      <section className="card relative w-full max-w-md px-6 py-8 sm:px-8">
        <div className="flex items-center gap-3">
          <LogoLoadingAnimation size="lg" static className="flex-none text-ink" />
          <div>
            <div className="font-serif text-display-sm leading-none text-ink">LinkMesh</div>
            <div className="eyebrow mt-1.5">CMHW Domains</div>
          </div>
        </div>

        <h1 className="mt-6 font-serif text-display-sm text-ink">Sign in to continue</h1>
        <p className="mt-2 text-body-sm leading-relaxed text-muted">
          The dashboard identifies you through Telegram. Open the link, press Start, and come
          back to this tab.
        </p>

        {unconfigured ? (
          <p role="alert" className="mt-6 rounded-lg bg-error px-4 py-3 text-caption text-on-dark">
            Telegram sign-in is not configured on this deployment. Set TELEGRAM_BOT_TOKEN and
            TELEGRAM_BOT_USERNAME on the API, then reload.
          </p>
        ) : nonce === null ? (
          <button
            type="button"
            onClick={() => start.mutate()}
            disabled={start.isPending}
            className="btn btn-primary mt-6 w-full disabled:opacity-50"
          >
            {start.isPending ? "Preparing…" : "Sign in with Telegram"}
          </button>
        ) : (
          <div className="mt-6">
            {deepLink && !finalState && (
              <a
                href={deepLink}
                target="_blank"
                rel="noreferrer"
                className="btn btn-primary w-full"
              >
                Open Telegram
              </a>
            )}

            {waiting && (
              <div role="status" aria-live="polite" className="mt-4 flex items-center gap-2 text-caption text-muted">
                <LogoLoadingAnimation size="sm" aria-hidden="true" />
                <span>Waiting for you to press Start in Telegram…</span>
              </div>
            )}

            {finalState && (
              <p role="status" className="text-body-sm leading-relaxed text-ink">
                {EXPLANATION[finalState]}
              </p>
            )}

            {(finalState === "invalid" || poll.isError) && (
              <button
                type="button"
                onClick={() => {
                  setNonce(null);
                  start.reset();
                }}
                className="btn btn-outline mt-4 w-full"
              >
                Start again
              </button>
            )}
          </div>
        )}
      </section>
    </main>
  );
}

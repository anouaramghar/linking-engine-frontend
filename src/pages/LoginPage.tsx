import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { pollLogin, startErrorMessage, startLogin, type LoginState } from "../api/auth";
import LogoLoadingAnimation from "../components/LogoLoadingAnimation";
import { SESSION_QUERY_KEY } from "../hooks/useSession";

const POLL_INTERVAL_MS = 2000;

/** Everything except `waiting` is final for one nonce, so polling stops there. */
const EXPLANATION: Record<Exclude<LoginState, "waiting" | "approved">, string> = {
  pending:
    "Your request has been recorded. Everyone already on the dashboard has been told, and Telegram will message you the moment one of them admits you.",
  revoked: "This account's access has been removed. Ask an approved teammate to restore it.",
  invalid: "That sign-in link expired or was already used. Start again to get a new one.",
};

/**
 * Telegram's mark, at Telegram's own colours.
 *
 * The only literal colours in the app. Everything else resolves through a theme
 * token, but this is somebody else's brand and it must not invert when the
 * dashboard does — and the pill under it is dark in light mode and light in
 * dark, which the blue disc reads against either way.
 */
function TelegramMark({ size = 18 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true" className="flex-none">
      <circle cx="12" cy="12" r="12" fill="#229ED9" />
      <path
        fill="#ffffff"
        d="M5.49 11.66c3.5-1.53 5.84-2.53 7.01-3.02 3.34-1.39 4.03-1.63 4.48-1.64.1 0 .32.02.47.14.12.1.15.24.17.34.02.1.04.32.02.5-.18 1.9-.97 6.53-1.37 8.66-.17.9-.5 1.21-.82 1.24-.7.06-1.23-.46-1.9-.9-1.06-.7-1.66-1.13-2.69-1.81-1.19-.79-.42-1.22.26-1.93.18-.19 3.26-2.99 3.32-3.24.01-.03.01-.15-.06-.21-.07-.06-.17-.04-.25-.02-.11.02-1.8 1.14-5.09 3.36-.48.33-.92.49-1.31.48-.43-.01-1.26-.24-1.88-.44-.76-.25-1.36-.38-1.31-.8.03-.22.33-.44.9-.68z"
      />
    </svg>
  );
}

/**
 * The product, drawn: articles as nodes, links as the arcs between them.
 *
 * The split is the point rather than decoration — the thin static arcs are
 * links that already exist, the three heavier moving ones are what the engine
 * is proposing, which is the only thing an operator signs in here to work on.
 * Node and link shapes are the logo's, scaled up.
 */
const MESH_NODES = [
  { x: 44, y: 62, r: 5 },
  { x: 124, y: 28, r: 3.5 },
  { x: 208, y: 66, r: 6 },
  { x: 286, y: 34, r: 3.5 },
  { x: 62, y: 148, r: 3.5 },
  { x: 152, y: 128, r: 7 },
  { x: 246, y: 156, r: 5 },
  { x: 40, y: 226, r: 3.5 },
  { x: 134, y: 216, r: 5 },
  { x: 252, y: 238, r: 3.5 },
];

const MESH_EDGES: { from: number; to: number; proposed?: true }[] = [
  { from: 0, to: 1 },
  { from: 1, to: 2 },
  { from: 2, to: 3 },
  { from: 0, to: 4 },
  { from: 4, to: 5 },
  { from: 5, to: 2 },
  { from: 5, to: 6 },
  { from: 6, to: 3 },
  { from: 4, to: 7 },
  { from: 7, to: 8 },
  { from: 8, to: 9 },
  { from: 6, to: 9 },
  { from: 5, to: 8, proposed: true },
  { from: 2, to: 6, proposed: true },
  { from: 8, to: 0, proposed: true },
];

/** Bowed, not straight: fifteen straight lines through ten points read as a
 *  lattice, and a link between two articles is a relation, not a girder. */
function arc(a: (typeof MESH_NODES)[number], b: (typeof MESH_NODES)[number]) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return `M${a.x} ${a.y} Q${(a.x + b.x) / 2 - dy * 0.12} ${(a.y + b.y) / 2 + dx * 0.12} ${b.x} ${b.y}`;
}

const LINKED = new Set(MESH_EDGES.filter((e) => e.proposed).flatMap((e) => [e.from, e.to]));

function MeshFigure() {
  return (
    <svg
      viewBox="0 0 326 266"
      role="img"
      aria-label="A mesh of articles: thin arcs are links already published, three heavier arcs are links the engine is proposing."
      className="h-auto w-full max-w-md"
    >
      {MESH_EDGES.map((edge, index) => (
        <path
          key={`${edge.from}-${edge.to}`}
          d={arc(MESH_NODES[edge.from], MESH_NODES[edge.to])}
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth={edge.proposed ? 1.6 : 1}
          opacity={edge.proposed ? 1 : 0.45}
          className={edge.proposed ? "login-link-proposed text-ink" : "text-muted-soft"}
          style={edge.proposed ? { animationDelay: `${index * 0.4}s` } : undefined}
        />
      ))}
      {MESH_NODES.map((node, index) =>
        LINKED.has(index) ? (
          <circle key={index} cx={node.x} cy={node.y} r={node.r} fill="currentColor" className="text-ink" />
        ) : (
          <circle
            key={index}
            cx={node.x}
            cy={node.y}
            r={node.r}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            opacity="0.7"
            className="text-muted-soft"
          />
        ),
      )}
    </svg>
  );
}

function LegendRule({ proposed = false }: { proposed?: boolean }) {
  return (
    <svg width="24" height="8" aria-hidden="true" className="flex-none">
      <line
        x1="1"
        y1="4"
        x2="23"
        y2="4"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth={proposed ? 1.6 : 1}
        strokeDasharray={proposed ? "3 3" : undefined}
        className={proposed ? "text-ink" : "text-muted-soft"}
      />
    </svg>
  );
}

export default function LoginPage() {
  const queryClient = useQueryClient();
  const [nonce, setNonce] = useState<string | null>(null);
  // Whether the hand-off tab actually opened. A blocked pop-up otherwise leaves
  // the operator watching a spinner that waits for something that never happened.
  const [handedOff, setHandedOff] = useState(true);
  const telegramTab = useRef<Window | null>(null);

  const start = useMutation({
    mutationFn: startLogin,
    onSuccess: (data) => {
      setNonce(data.nonce);
      if (telegramTab.current) telegramTab.current.location.href = data.deep_link;
    },
    // Do not leave a blank tab sitting there after a 429 or a 503.
    onError: () => telegramTab.current?.close(),
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

  /**
   * The tab is opened here, inside the click, and pointed at Telegram once the
   * deep link comes back. It cannot be opened in the response callback instead:
   * the link only exists after the round-trip, and by then the browser no
   * longer counts the `window.open` as user-initiated and blocks it. Opening
   * this tab rather than navigating away keeps the poll below running, which is
   * what signs the operator in without a second visit.
   */
  function signIn() {
    const tab = window.open("", "_blank");
    telegramTab.current = tab;
    setHandedOff(tab !== null);
    start.mutate();
  }

  const deepLink = start.data?.deep_link;
  const waiting = nonce !== null && (state === undefined || state === "waiting");
  const finalState = state && state !== "waiting" && state !== "approved" ? state : null;
  const startFailure = start.isPending ? null : startErrorMessage(start.error);

  return (
    <main className="relative min-h-[100dvh] overflow-hidden">
      <div className="pointer-events-none absolute -right-20 -top-32 h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle,theme(colors.orb-lavender/35%),transparent_70%)]" />
      <div className="pointer-events-none absolute -bottom-36 -left-20 h-[380px] w-[380px] rounded-full bg-[radial-gradient(circle,theme(colors.orb-mint/28%),transparent_70%)]" />

      <div className="relative mx-auto flex min-h-[100dvh] max-w-5xl flex-col justify-center gap-10 px-4 py-10 lg:grid lg:grid-cols-[minmax(0,1fr)_384px] lg:items-center lg:gap-16 lg:px-8">
        <section>
          <div className="flex items-center gap-3">
            <LogoLoadingAnimation size="lg" static className="flex-none text-ink" />
            <div>
              <div className="font-serif text-display-sm leading-none text-ink">LinkMesh</div>
              <div className="eyebrow mt-1.5">CMHW Domains</div>
            </div>
          </div>

          <h1 className="mt-8 max-w-lg text-balance font-serif text-display-md text-ink lg:text-display-xl">
            Internal links, proposed by meaning.
          </h1>
          <p className="mt-4 max-w-md text-body-md leading-relaxed text-body">
            LinkMesh reads every article across your sites, finds the pairs that belong
            together, and drafts the link between them. You review each one before anything
            publishes.
          </p>

          <div className="mt-10 hidden sm:block">
            <MeshFigure />
            <ul className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-2 text-caption-sm text-muted">
              <li className="flex items-center gap-2">
                <LegendRule />
                Links already published
              </li>
              <li className="flex items-center gap-2">
                <LegendRule proposed />
                Waiting in the review queue
              </li>
            </ul>
          </div>
        </section>

        <section className="card w-full px-6 py-8 sm:px-8 lg:justify-self-end">
          <div className="eyebrow">Sign in</div>
          <h2 className="mt-2 font-serif text-display-sm text-ink">Continue with Telegram</h2>
          <p className="mt-3 text-body-sm leading-relaxed text-muted">
            Telegram opens in a new tab. Press Start there, and this tab signs you in on its
            own — nothing to copy across.
          </p>

          {nonce === null ? (
            <>
              {startFailure && (
                <p
                  role="alert"
                  className="mt-6 rounded-lg bg-error px-4 py-3 text-caption leading-relaxed text-on-dark"
                >
                  {startFailure}
                </p>
              )}
              <button
                type="button"
                onClick={signIn}
                disabled={start.isPending}
                className="btn btn-primary mt-6 w-full disabled:opacity-50"
              >
                <TelegramMark />
                {start.isPending ? "Preparing…" : startFailure ? "Try again" : "Sign in with Telegram"}
              </button>
            </>
          ) : (
            <div className="mt-6 flex flex-col gap-4">
              {deepLink && !finalState && !handedOff && (
                <>
                  <p role="alert" className="text-caption leading-relaxed text-error-ink">
                    Your browser blocked the new tab. Open Telegram from here instead.
                  </p>
                  <a href={deepLink} target="_blank" rel="noreferrer" className="btn btn-primary w-full">
                    <TelegramMark />
                    Open Telegram
                  </a>
                </>
              )}

              {waiting && (
                <div
                  role="status"
                  aria-live="polite"
                  className="flex items-center gap-2 text-caption text-muted"
                >
                  <LogoLoadingAnimation size="sm" aria-hidden="true" />
                  <span>Waiting for you to press Start in Telegram…</span>
                </div>
              )}

              {waiting && handedOff && deepLink && (
                <a
                  href={deepLink}
                  target="_blank"
                  rel="noreferrer"
                  className="self-start text-caption text-muted underline underline-offset-4 hover:text-ink"
                >
                  Telegram didn&rsquo;t open? Open it again
                </a>
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
                    setHandedOff(true);
                    start.reset();
                  }}
                  className="btn btn-outline w-full"
                >
                  Start again
                </button>
              )}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

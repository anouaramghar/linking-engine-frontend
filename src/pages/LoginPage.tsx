import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { completeLogin, startErrorMessage, startLogin, type LoginState } from "../api/auth";
import LogoLoadingAnimation from "../components/LogoLoadingAnimation";
import NeonBorder from "../components/NeonBorder";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { SESSION_QUERY_KEY } from "../hooks/useSession";
import { REDUCED_MOTION_QUERY, useTheme } from "../hooks/useTheme";

/**
 * NeonBorder takes its corner radius as a percentage of half the shorter side,
 * not in pixels, so the value that makes the ring sit flush against the card
 * has to be solved for the card's real size: the card is `{rounded.xl}` = 16px,
 * and the sign-in panel's shorter side runs about 330–384px across its two
 * states and both breakpoints, so half of it is ~165–192px and 16px of that is
 * ~8–10%. Nine splits the difference and leaves the ring within about a pixel
 * of the corner in every state. It cannot be exact in all of them at once —
 * that is the component's API, not a rounding mistake here.
 */
const NEON_ROUNDED_PCT = 9;

/**
 * The ring's colour in light mode, where it composites normally rather than
 * additively (see `.login-neon` in {@link file://./../index.css}).
 *
 * It needs its own value because the two blend modes do different things to the
 * same hex. Additively over ink, Originkit's amber climbs its own channels until
 * the core burns out near white and only the falloff stays gold — the ring reads
 * far lighter than the colour that produced it. Composited normally over white,
 * that same amber is simply itself, which lands as a flat orange band. This is
 * the amber lifted toward what the dark ring actually looks like on screen.
 *
 * The prop is a hex string parsed by the component, not a token: `withAlpha`
 * there reads hex or comma-form `rgb()`, and the palette's channels are
 * space-separated, which that parser falls back to black on.
 */
const LIGHT_NEON = "#F0C68F";

const EXPLANATION: Record<Exclude<LoginState, "approved">, string> = {
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

/**
 * Each proposed arc's place in the stagger — counted among the proposed arcs,
 * not among all fifteen. They are the last three entries of MESH_EDGES, so a
 * delay taken from the MESH_EDGES index lands at 4.8s/5.2s/5.6s and the figure
 * sits dead still for five seconds after the page loads.
 *
 * The delay is applied negative: the arcs start already partway through the
 * dash cycle, which is what the stagger was for (three flows out of lockstep)
 * without anything waiting its turn to begin.
 */
const PROPOSED_ORDER = new Map(
  MESH_EDGES.map((edge, index) => [index, edge] as const)
    .filter(([, edge]) => edge.proposed)
    .map(([index], order) => [index, order]),
);

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
          style={
            edge.proposed
              ? { animationDelay: `-${(PROPOSED_ORDER.get(index) ?? 0) * 0.4}s` }
              : undefined
          }
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
  const [started, setStarted] = useState(false);
  const [code, setCode] = useState("");
  // Whether the hand-off tab actually opened. A blocked pop-up otherwise leaves
  // the operator watching a spinner that waits for something that never happened.
  const [handedOff, setHandedOff] = useState(true);
  const telegramTab = useRef<Window | null>(null);
  /**
   * `speed={0}` is how the neon ring honours this: the component's frame loop
   * keeps running but stops advancing the arc, so the ring holds the position
   * it was first rendered at instead of travelling the perimeter. The rest of
   * the page's motion is stopped in CSS, at {@link file://./../index.css}.
   */
  const prefersReducedMotion = useMediaQuery(REDUCED_MOTION_QUERY);
  /**
   * Safe to call here even though `useTheme` writes `<html data-theme>` and that
   * attribute may have only one writer: `RequireSession` renders this page or
   * the app shell, never both, so App's copy of the hook is unmounted whenever
   * this one is live.
   */
  const { resolved } = useTheme();

  const start = useMutation({
    mutationFn: startLogin,
    onSuccess: (data) => {
      setStarted(true);
      if (telegramTab.current) telegramTab.current.location.href = data.deep_link;
    },
    // Do not leave a blank tab sitting there after a 429 or a 503.
    onError: () => telegramTab.current?.close(),
  });

  const complete = useMutation({
    mutationFn: completeLogin,
    onSuccess: (result) => {
      if (result.state === "approved") {
        queryClient.invalidateQueries({ queryKey: SESSION_QUERY_KEY });
      }
    },
  });

  /**
   * The tab is opened here, inside the click, and pointed at Telegram once the
   * deep link comes back. It cannot be opened in the response callback instead:
   * the link only exists after the round-trip, and by then the browser no
   * longer counts the `window.open` as user-initiated and blocks it. Opening
   * this tab rather than navigating away keeps the code form in place.
   */
  function signIn() {
    const tab = window.open("", "_blank");
    telegramTab.current = tab;
    setHandedOff(tab !== null);
    start.mutate();
  }

  const deepLink = start.data?.deep_link;
  const state = complete.data?.state;
  const finalState = state && state !== "approved" ? state : null;
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

        <section className="card relative w-full px-6 py-8 sm:px-8 lg:justify-self-end">
          {/* NeonBorder takes no children — it measures the box it is stretched
              across and paints the ring *outside* that box. So it is a filler
              layer inside the card rather than a wrapper around it, which is
              also why it never covers the content it sits on top of in paint
              order. `.card` sets no overflow, so the glow is free to spill.

              `.login-neon` is what makes the ring survive the light theme: the
              component composites additively, which needs a dark ground, so the
              rule behind that class composites it normally there instead. See
              {@link file://./../index.css}. */}
          <div aria-hidden="true" className="login-neon pointer-events-none absolute inset-0">
            <NeonBorder
              rounded={NEON_ROUNDED_PCT}
              color={resolved === "light" ? LIGHT_NEON : undefined}
              speed={prefersReducedMotion ? 0 : undefined}
            />
          </div>

          <div className="eyebrow">Sign in</div>
          <h2 className="mt-2 font-serif text-display-sm text-ink">Continue with Telegram</h2>
          <p className="mt-3 text-body-sm leading-relaxed text-muted">
            Telegram opens in a new tab. Press Start there, then enter the one-time code it
            gives you below. New accounts remain pending until a teammate approves them.
          </p>

          {!started ? (
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
              {deepLink && !handedOff && (
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

              {handedOff && deepLink && (
                <a
                  href={deepLink}
                  target="_blank"
                  rel="noreferrer"
                  className="self-start text-caption text-muted underline underline-offset-4 hover:text-ink"
                >
                  Telegram didn&rsquo;t open? Open it again
                </a>
              )}

              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  complete.mutate(code);
                }}
                className="flex flex-col gap-3"
              >
                <label htmlFor="telegram-code" className="text-caption font-medium text-ink">
                  One-time Telegram code
                </label>
                <input
                  id="telegram-code"
                  value={code}
                  onChange={(event) => {
                    setCode(event.target.value);
                    complete.reset();
                  }}
                  autoComplete="one-time-code"
                  autoCapitalize="characters"
                  spellCheck={false}
                  required
                  placeholder="ABCD-EFGH-JKLM"
                  className="input font-mono uppercase tracking-widest"
                />
                <button
                  type="submit"
                  disabled={complete.isPending || !code.trim()}
                  className="btn btn-primary w-full disabled:opacity-50"
                >
                  {complete.isPending ? "Signing in…" : "Complete sign in"}
                </button>
              </form>

              {complete.isError && (
                <p role="alert" className="text-caption leading-relaxed text-error-ink">
                  Could not verify the code. Check that the engine is reachable and try again.
                </p>
              )}

              {finalState && (
                <p role="status" className="text-body-sm leading-relaxed text-ink">
                  {EXPLANATION[finalState]}
                </p>
              )}

              {finalState === "invalid" && (
                <button
                  type="button"
                  onClick={() => {
                    setStarted(false);
                    setCode("");
                    setHandedOff(true);
                    start.reset();
                    complete.reset();
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

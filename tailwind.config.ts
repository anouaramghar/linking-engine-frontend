import type { Config } from "tailwindcss";

/**
 * The binding between DESIGN-elevenlabs.md and the app. Every name below is a
 * token from that file, so component code can reference `{colors.hairline}` as
 * `border-hairline` and a reader can check it against the system in one step.
 *
 * `colors` and `borderRadius` REPLACE Tailwind's defaults rather than extending
 * them. That is deliberate: the stock palette shadows the token names (Tailwind
 * `rounded-xl` is 12px, the system's `{rounded.xl}` is 16px) and leaving both
 * reachable is how the design drifted in the first place. With the defaults
 * gone, an off-system class emits no CSS and shows up immediately.
 *
 * Every colour resolves through a CSS variable rather than a literal, and the
 * literals themselves live in `src/index.css`. That indirection is what makes
 * the dark theme a palette swap instead of a rewrite: the tokens are named for
 * their *role* (`canvas`, `ink`, `hairline`), so re-pointing the variables under
 * `[data-theme="dark"]` re-themes every component without touching a single
 * class. The channels are stored space-separated (`12 10 9`) so Tailwind's
 * `<alpha-value>` placeholder keeps working — `bg-error/5` and `bg-canvas-deep/40`
 * still compose opacity on top of a themed colour.
 */
const token = (name: string) => `rgb(var(--c-${name}) / <alpha-value>)`;

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  // The theme is an explicit preference, not only an OS reading: `useTheme`
  // resolves "system" to a concrete attribute on <html>, so one selector covers
  // both. Components should rarely need `dark:` — the tokens above already
  // carry the change — but it is here for the cases the palette cannot express.
  darkMode: ["selector", '[data-theme="dark"]'],
  theme: {
    colors: {
      transparent: "transparent",
      current: "currentColor",

      // Brand & accent — the ink pill is the only CTA colour in the system.
      // Dark inverts the pill rather than dimming it: an ink pill on an ink
      // canvas is not a button.
      primary: token("primary"),
      "primary-active": token("primary-active"),
      "notification-unread": token("notification-unread"),

      // Text
      ink: token("ink"),
      body: token("body"),
      "body-strong": token("body-strong"),
      // Darkened from the source palette so normal caption text clears WCAG AA
      // on every light product surface, including {colors.surface-strong}.
      muted: token("muted"),
      "muted-soft": token("muted-soft"),
      "on-primary": token("on-primary"),
      // `on-dark` stays white in both themes. It is the partner of the two
      // grounds that do not invert — the error fill and the raised notice — so
      // flipping it with the rest would put dark text on a red banner.
      "on-dark": token("on-dark"),
      "on-dark-soft": token("on-dark-soft"),

      // Hairlines
      hairline: token("hairline"),
      "hairline-soft": token("hairline-soft"),
      "hairline-strong": token("hairline-strong"),
      // Derived: the boundary of a control the user is meant to type into.
      // `hairline-strong` measures 1.49:1 on {colors.surface-card}, and a field
      // whose fill matches the page is identified by its border alone — WCAG
      // 1.4.11 wants 3:1 for that. A border has a surface on each side, so this
      // is the lightest value in the same stone family that clears 3:1 against
      // all three grounds a control can sit between: surface-card 3.33,
      // canvas-soft 3.19, canvas 3.05. Still a hairline, not a rule.
      "hairline-control": token("hairline-control"),

      // Surface. The elevation order survives the flip by reversing: in light,
      // raised means lighter than the page; in dark, it still means lighter,
      // which is why `canvas` is the darkest value of the three rather than the
      // lightest.
      canvas: token("canvas"),
      "canvas-soft": token("canvas-soft"),
      // The modal scrim. A scrim is a shadow, not a surface, so this one stays
      // dark in both themes instead of inverting into a white wash.
      "canvas-deep": token("canvas-deep"),
      "surface-card": token("surface-card"),
      "surface-strong": token("surface-strong"),
      "surface-dark": token("surface-dark"),
      "surface-dark-elevated": token("surface-dark-elevated"),

      // Atmospheric gradient stops. Decoration only — never a button fill, a
      // text colour, or a component background. They are always drawn at 28–45%
      // over their ground, which is why they have to travel with the theme:
      // partial opacity *adds* the stop to what is behind it, so a pastel that
      // reads as a wash on white blooms into visible grey fog on ink. Dark
      // re-anchors the same five hues below its canvas to get the same whisper.
      "orb-mint": token("orb-mint"),
      "orb-peach": token("orb-peach"),
      "orb-lavender": token("orb-lavender"),
      "orb-sky": token("orb-sky"),
      "orb-rose": token("orb-rose"),

      // Syntax. Derived, and the one place the system's monochrome rule is
      // deliberately set aside: the exact-HTML review asks an operator to read
      // markup, and markup is read in a coloured editor everywhere else they
      // work. Held to the muted end of each hue and measured against
      // {colors.surface-card} in both themes by `theme.contrast.test.ts`. Never
      // used outside a code surface.
      "code-tag": token("code-tag"),
      "code-attr": token("code-attr"),
      "code-value": token("code-value"),
      "code-comment": token("code-comment"),

      // Semantic
      success: token("success"),
      error: token("error"),
      // Derived, not in the design system: it documents `{colors.semantic-error}`
      // as a single flat value but no press state, and destructive confirms need
      // one. Kept as the same hue one step darker so it reads as the same token.
      "error-active": token("error-active"),
      // Derived: `error` as *text*. #dc2626 clears AA on pure white (4.83:1) but
      // the app almost never puts it there — on the tinted `bg-error/5` grounds
      // where failures are actually reported it falls to 4.1–4.3:1. Same value
      // as `error-active` on purpose: one hue, two intents. `error` stays the
      // fill and border; `error-ink` is the only one allowed to carry words.
      // This is the one semantic that must travel: a dark red on an ink canvas
      // is unreadable, so the dark theme lightens it instead.
      "error-ink": token("error-ink"),

      // Status grounds. Named for what the state *is* rather than for the hue
      // it happens to take, so "published" can be re-pointed without every
      // badge in the app learning a new colour name. Always paired with the
      // status label — the tint is a second channel on top of the words, never
      // the only one. Measured against `ink` in both themes by
      // `theme.contrast.test.ts`.
      "tint-positive": token("tint-positive"),
      "tint-negative": token("tint-negative"),
      "tint-active": token("tint-active"),
      "tint-progress": token("tint-progress"),
    },
    borderRadius: {
      none: "0px",
      xs: "4px",
      sm: "6px",
      md: "8px",
      lg: "12px",
      xl: "16px",
      xxl: "24px",
      pill: "9999px",
      full: "9999px",
    },
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)"],
        // Waldenburg is licensed; EB Garamond is the substitute the design
        // system documents.
        serif: ["'EB Garamond'", "Georgia", "serif"],
      },
      /**
       * Weight travels with the token only where it is structural — display
       * always 300, titles/buttons/nav always 500, eyebrows always 600. The
       * body sizes stay weightless so `font-medium` can compose on top, which
       * is how `{typography.body-strong}` is built.
       *
       * Display carries fontWeight 300 as the system specifies. EB Garamond's
       * lightest cut is 400, so it renders at 400 until a licensed Waldenburg
       * is dropped in; browsers do not synthesise weights lighter than the
       * available cut, so this is a no-op rather than a faux-light.
       */
      fontSize: {
        "display-mega": ["64px", { lineHeight: "1.05", letterSpacing: "-1.92px", fontWeight: "300" }],
        "display-xl": ["48px", { lineHeight: "1.08", letterSpacing: "-0.96px", fontWeight: "300" }],
        "display-lg": ["36px", { lineHeight: "1.17", letterSpacing: "-0.36px", fontWeight: "300" }],
        "display-md": ["32px", { lineHeight: "1.13", letterSpacing: "-0.32px", fontWeight: "300" }],
        "display-sm": ["24px", { lineHeight: "1.2", letterSpacing: "0", fontWeight: "300" }],
        "title-md": ["20px", { lineHeight: "1.35", letterSpacing: "0", fontWeight: "500" }],
        "title-sm": ["18px", { lineHeight: "1.44", letterSpacing: "0.18px", fontWeight: "500" }],
        "body-md": ["16px", { lineHeight: "1.5", letterSpacing: "0.16px" }],
        "body-sm": ["15px", { lineHeight: "1.47", letterSpacing: "0.15px" }],
        caption: ["14px", { lineHeight: "1.5", letterSpacing: "0" }],
        // Derived: the system's smallest size is `caption-upper`, but that cut
        // is uppercase, tracked and semibold — wrong for a sentence-case metric
        // label under a number. This is the same 12px step in ordinary voice.
        "caption-sm": ["12px", { lineHeight: "1.4", letterSpacing: "0" }],
        "caption-upper": ["12px", { lineHeight: "1.4", letterSpacing: "0.96px", fontWeight: "600" }],
        button: ["15px", { lineHeight: "1", letterSpacing: "0", fontWeight: "500" }],
        "nav-link": ["15px", { lineHeight: "1.4", letterSpacing: "0", fontWeight: "500" }],
      },
      spacing: {
        // The 4px-multiple scale is already Tailwind's. These named dashboard
        // geometry values keep the queue and chart widths from becoming
        // unreviewable arbitrary classes.
        score: "96px",
        meter: "3px",
        filter: "16rem",
        decision: "220px",
        "decision-review": "290px",
        chart: "620px",
        section: "96px",
      },
      boxShadow: {
        // A black shadow says nothing on a near-black canvas, so the opacity is
        // a variable too — the dark theme deepens it and leans on the hairline
        // to carry the edge that light relies on the shadow for.
        // The system's single shadow tier.
        soft: "0 4px 16px rgb(0 0 0 / var(--shadow-soft))",
        // Derived: a lifted variant for the two surfaces that float above the
        // page (menu pop-out, overlaid detail drawer). The system documents
        // one tier because its surfaces never stack.
        lift: "0 8px 24px rgb(0 0 0 / var(--shadow-lift))",
        drawer: "0 8px 40px rgb(0 0 0 / var(--shadow-drawer))",
      },
      /**
       * Motion is tokenised for the same reason colour is: the dashboard's
       * transitions were written inline at each call site, so "a state change"
       * lasted 150ms in the rail and 200ms on a card with no rule saying which
       * was right. Duration here encodes *consequence*, not taste — feedback is
       * faster than a state change, which is faster than something arriving.
       */
      transitionTimingFunction: {
        // Exponential ease-out. Motion in this app decelerates into place; it
        // never overshoots, because a review desk that bounces is a review desk
        // that looks unsure of the decision it just recorded.
        settle: "cubic-bezier(0.16, 1, 0.3, 1)",
      },
      transitionDuration: {
        // Acknowledgement of a press: below the threshold where it reads as lag.
        feedback: "120ms",
        // A control or row changing state.
        state: "200ms",
        // Something entering or leaving the composition.
        arrive: "280ms",
      },
      keyframes: {
        rowIn: {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "none" },
        },
        /**
         * The score meter draws itself rather than appearing pre-filled.
         *
         * `scaleX` on a span whose width is already the score, not an animated
         * `width`: the queue mounts up to a page of these at once, and width is
         * a layout property. The pill's end cap is squashed while the transform
         * is in flight and exact at rest, which is the right way round.
         */
        meterFill: {
          from: { transform: "scaleX(0)" },
          to: { transform: "scaleX(1)" },
        },
        /** A notice arrives from the edge it is anchored to. */
        noticeIn: {
          from: { opacity: "0", transform: "translateY(-6px)" },
          to: { opacity: "1", transform: "none" },
        },
      },
      animation: {
        rowIn: "rowIn .28s cubic-bezier(0.16, 1, 0.3, 1) both",
        meterFill: "meterFill .5s cubic-bezier(0.16, 1, 0.3, 1) both",
        noticeIn: "noticeIn .28s cubic-bezier(0.16, 1, 0.3, 1) both",
      },
    },
  },
  plugins: [],
} satisfies Config;

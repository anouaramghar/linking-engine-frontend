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
 */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    colors: {
      transparent: "transparent",
      current: "currentColor",

      // Brand & accent — the ink pill is the only CTA colour in the system.
      primary: "#292524",
      "primary-active": "#0c0a09",

      // Text
      ink: "#0c0a09",
      body: "#4e4e4e",
      "body-strong": "#292524",
      muted: "#777169",
      "muted-soft": "#a8a29e",
      "on-primary": "#ffffff",
      "on-dark": "#ffffff",
      "on-dark-soft": "#a8a29e",

      // Hairlines
      hairline: "#e7e5e4",
      "hairline-soft": "#f0efed",
      "hairline-strong": "#d6d3d1",

      // Surface
      canvas: "#f5f5f5",
      "canvas-soft": "#fafafa",
      "canvas-deep": "#0c0a09",
      "surface-card": "#ffffff",
      "surface-strong": "#f0efed",
      "surface-dark": "#0c0a09",
      "surface-dark-elevated": "#1c1917",

      // Atmospheric gradient stops. Decoration only — never a button fill, a
      // text colour, or a component background.
      "orb-mint": "#a7e5d3",
      "orb-peach": "#f4c5a8",
      "orb-lavender": "#c8b8e0",
      "orb-sky": "#a8c8e8",
      "orb-rose": "#e8b8c4",

      // Semantic
      success: "#16a34a",
      error: "#dc2626",
      // Derived, not in the design system: it documents `{colors.semantic-error}`
      // as a single flat value but no press state, and destructive confirms need
      // one. Kept as the same hue one step darker so it reads as the same token.
      "error-active": "#b91c1c",
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
        "caption-upper": ["12px", { lineHeight: "1.4", letterSpacing: "0.96px", fontWeight: "600" }],
        button: ["15px", { lineHeight: "1", letterSpacing: "0", fontWeight: "500" }],
        "nav-link": ["15px", { lineHeight: "1.4", letterSpacing: "0", fontWeight: "500" }],
      },
      spacing: {
        // The 4px-multiple scale is already Tailwind's; only the section
        // rhythm needs adding.
        section: "96px",
      },
      boxShadow: {
        // The system's single shadow tier.
        soft: "0 4px 16px rgba(0, 0, 0, 0.04)",
        // Derived: a lifted variant for the two surfaces that float above the
        // page (menu pop-out, overlaid detail drawer). The system documents
        // one tier because its surfaces never stack.
        lift: "0 8px 24px rgba(0, 0, 0, 0.08)",
        drawer: "0 8px 40px rgba(0, 0, 0, 0.16)",
      },
      keyframes: {
        rowIn: {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "none" },
        },
      },
      animation: { rowIn: "rowIn .25s ease both" },
    },
  },
  plugins: [],
} satisfies Config;

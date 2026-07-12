import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        serif: ["'EB Garamond'", "Georgia", "serif"],
      },
      colors: {
        chip: "#f0efed", // the prototype's soft fill between stone-100 and stone-200
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

import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

const cspSafeAjvPath = new URL("./src/lib/cspSafeAjv.ts", import.meta.url).pathname.replace(
  /^\/([A-Za-z]:)/,
  "$1",
);

/**
 * Preload the self-hosted faces.
 *
 * The @font-face rules live in the stylesheet, so the browser only discovers
 * them once the CSS has loaded and parsed — a round trip during which the
 * display serif in every page header renders in its fallback and then swaps.
 * Their filenames are content-hashed at build time, so the links cannot be
 * written into index.html by hand; they are read off the emitted bundle.
 *
 * All four are used above the fold on first paint: Inter 400/500/600 across
 * the shell, EB Garamond on the page title.
 */
const preloadFonts = (): Plugin => ({
  name: "linkmesh-preload-fonts",
  enforce: "post",
  transformIndexHtml(_html, ctx) {
    return Object.keys(ctx.bundle ?? {})
      .filter((file) => file.endsWith(".woff2"))
      .map((file) => ({
        tag: "link",
        attrs: {
          rel: "preload",
          as: "font",
          type: "font/woff2",
          href: `/${file}`,
          // Fonts are fetched anonymously. Without this the preload does not
          // match the later request and the file is downloaded twice.
          crossorigin: "",
        },
        injectTo: "head" as const,
      }));
  },
});

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, ".", "");
  const apiKey = env.LINKMESH_API_KEY;

  return {
    plugins: [react(), preloadFonts()],
    resolve: {
      // avatar-core 0.1.0 compiles its bundled JSON schema with Ajv at module
      // load. Ajv uses Function(), which a strict production CSP must reject.
      // The dashboard supplies one trusted, compile-time avatar definition;
      // production aliases only that validator to the CSP-safe static shim.
      // Development keeps the package's real validator for feedback.
      alias:
        mode === "production"
          ? {
              "ajv/dist/2020.js": cspSafeAjvPath,
            }
          : undefined,
    },
    server: {
      // Loopback only: the dev proxy injects the shared backend key, so binding
      // to all interfaces would hand full API authority to the LAN.
      host: "127.0.0.1",
      port: 5173,
      strictPort: true,
      proxy: {
        "/api": {
          target: env.BACKEND_URL ?? "http://127.0.0.1:8000",
          changeOrigin: true,
          headers: apiKey ? { "X-API-Key": apiKey } : undefined,
        },
      },
    },
  };
});

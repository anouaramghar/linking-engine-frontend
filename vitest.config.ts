import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    // Vitest stubs stylesheet imports to an empty string by default, which also
    // empties the `?raw` import `theme.contrast.test.ts` uses to read the
    // palette out of `index.css`. Nothing else in the suite imports CSS, so
    // turning the stubbing off costs nothing and keeps that test reading the
    // real values rather than a copy of them.
    css: true,
  },
});

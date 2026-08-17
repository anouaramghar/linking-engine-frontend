import { describe, expect, it } from "vitest";

// The stylesheet's own text, via Vite's `?raw`. Read through the bundler rather
// than `node:fs` so the production `tsc -b` — which type-checks this file and
// has no Node types — still compiles.
import css from "./index.css?raw";

/**
 * The palette, checked against WCAG rather than against a screenshot.
 *
 * A second palette is the easy thing to let rot: nobody runs the app in dark
 * mode as often as in light, so a token nudged for looks can sit below AA for
 * months. These pairings are the ones the app actually paints — every `text-*`
 * over the grounds it lands on — so a value that stops clearing its minimum
 * fails here instead of in front of an operator.
 *
 * Read from the stylesheet rather than a duplicated table, because a copy of
 * the palette would be one more thing to keep in step.
 */
const palette = (selector: RegExp): Record<string, [number, number, number]> => {
  const start = css.search(selector);
  if (start === -1) throw new Error(`palette block not found: ${selector}`);
  const open = css.indexOf("{", start);
  const body = css.slice(open + 1, css.indexOf("}", open));

  const out: Record<string, [number, number, number]> = {};
  for (const line of body.split(";")) {
    const m = line.match(/--c-([a-z-]+):\s*(\d+)\s+(\d+)\s+(\d+)/);
    if (m) out[m[1]] = [Number(m[2]), Number(m[3]), Number(m[4])];
  }
  return out;
};

const relativeLuminance = ([r, g, b]: [number, number, number]) => {
  const channel = (value: number) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};

const contrast = (a: [number, number, number], b: [number, number, number]) => {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/** [foreground, background, minimum]. 4.5 for text, 3 for borders and dots. */
const PAIRS: Array<[string, string, number]> = [
  ["ink", "canvas", 4.5],
  ["ink", "canvas-soft", 4.5],
  ["ink", "surface-card", 4.5],
  ["ink", "surface-strong", 4.5],
  ["body", "canvas", 4.5],
  ["body", "canvas-soft", 4.5],
  ["body", "surface-card", 4.5],
  ["body-strong", "surface-card", 4.5],
  ["muted", "canvas", 4.5],
  ["muted", "canvas-soft", 4.5],
  ["muted", "surface-card", 4.5],
  ["muted", "surface-strong", 4.5],
  // A tinted status badge is still a badge: it carries `ink` at 12px, so the
  // four grounds are held to the text minimum in both themes. This is the pair
  // that stops a tint from being nudged "just a bit stronger" for looks until
  // the label stops being readable on it.
  ["ink", "tint-positive", 4.5],
  ["ink", "tint-negative", 4.5],
  ["ink", "tint-active", 4.5],
  ["ink", "tint-progress", 4.5],
  ["error-ink", "canvas", 4.5],
  ["error-ink", "canvas-soft", 4.5],
  ["error-ink", "surface-card", 4.5],
  ["on-primary", "primary", 4.5],
  // Syntax is text, and a colour nobody can read is worse than no colour at
  // all. Code sits on the card surface; the folded rows in the same view sit on
  // the soft canvas.
  ["code-tag", "surface-card", 4.5],
  ["code-tag", "canvas-soft", 4.5],
  ["code-attr", "surface-card", 4.5],
  ["code-attr", "canvas-soft", 4.5],
  ["code-value", "surface-card", 4.5],
  ["code-value", "canvas-soft", 4.5],
  ["code-comment", "surface-card", 4.5],
  ["code-comment", "canvas-soft", 4.5],
  ["on-dark", "surface-dark", 4.5],
  // The two grounds that stay dark in both themes, so both take `on-dark`
  // rather than `on-primary`: the Notice banner and the `.btn-danger` pill.
  // `on-primary` inverts with the theme and measured 4.09:1 here, which is how
  // the danger button lost its contrast in dark without any test noticing.
  ["on-dark", "error", 4.5],
  ["on-dark", "error-active", 4.5],
  ["on-dark-soft", "surface-dark", 4.5],
  // Selected text is still text. This pair is the reason selection has its own
  // two tokens rather than borrowing the lavender orb, which travels.
  ["selection-ink", "selection", 4.5],
  // WCAG 1.4.11: a control identified by its border, and a status dot, are
  // non-text contrast.
  ["hairline-control", "canvas", 3],
  ["hairline-control", "canvas-soft", 3],
  ["hairline-control", "surface-card", 3],
  ["success", "canvas", 3],
  ["success", "canvas-soft", 3],
  ["success", "surface-card", 3],
  ["error", "canvas", 3],
  ["error", "canvas-soft", 3],
  ["error", "surface-card", 3],
];

describe.each([
  ["light", /:root\s*\{/],
  ["dark", /:root\[data-theme="dark"\]\s*\{/],
])("%s palette", (_name, selector) => {
  const colors = palette(selector);

  it.each(PAIRS)("%s on %s clears %s:1", (fg, bg, min) => {
    expect(colors[fg], `token --c-${fg} is missing`).toBeDefined();
    expect(colors[bg], `token --c-${bg} is missing`).toBeDefined();

    const ratio = contrast(colors[fg], colors[bg]);
    expect(
      Number(ratio.toFixed(2)),
      `${fg} on ${bg} measured ${ratio.toFixed(2)}:1`,
    ).toBeGreaterThanOrEqual(min);
  });
});

import { describe, expect, it } from "vitest";

// The stylesheet's own text, via Vite's `?raw`, matching theme.contrast.test.ts.
import css from "./index.css?raw";

/**
 * The focus ring must not reshape what it surrounds.
 *
 * CSS has no outline-radius. An outline takes the shape of the element it
 * surrounds, so the only way to round the ring is to round the element — and
 * the global `:focus-visible` rule is unlayered, landing after Tailwind's
 * utilities at equal specificity. A `border-radius` there therefore outranks
 * every `rounded-*` class in the app.
 *
 * That is how a `border-radius: 2px` once squared off every pill button and
 * card at the instant it received focus: 9999px to 2px on a button, 16px to 2px
 * on a card, springing back when focus moved on. Only keyboard users ever saw
 * it, which is the whole point of the rule — the shape change was sprung on the
 * one person navigating by watching this ring move.
 *
 * Checked as text rather than in a browser because jsdom resolves neither the
 * cascade nor `outline`, so the assertion that matters is simply that nobody
 * reintroduces the property.
 */
describe("the keyboard focus ring", () => {
  const focusVisibleRule = () => {
    const start = css.search(/^:focus-visible\s*\{/m);
    if (start === -1) throw new Error("global :focus-visible rule not found");
    return css.slice(css.indexOf("{", start) + 1, css.indexOf("}", start));
  };

  it("draws a visible ring offset from the control", () => {
    const rule = focusVisibleRule();
    expect(rule).toMatch(/outline:\s*2px solid/);
    expect(rule).toMatch(/outline-offset:\s*2px/);
  });

  it("does not override the radius of the element it surrounds", () => {
    expect(focusVisibleRule()).not.toMatch(/border-radius/);
  });
});

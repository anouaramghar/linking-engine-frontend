/**
 * The pre-paint theme script has to stay a same-origin file.
 *
 * Resolving the theme before the first paint is what stops a light flash on a
 * dark-mode dashboard, and the obvious way to do it is an inline `<script>` in
 * the document head. The deployed dashboard sends `script-src 'self'`, which
 * browsers enforce by refusing inline script outright — so an inline block does
 * not degrade, it simply never runs, and only in production.
 *
 * Three separate things have to agree for this to work, and none of them is
 * checked by a component test: the document must reference the file, nginx must
 * serve it without loosening the policy, and the build must copy it out of
 * `public/`. This asserts all three against the real files.
 */
import { describe, expect, it } from "vitest";

// The deployed files themselves, read verbatim. Nothing here is a copy that
// could agree with the test while the shipped artifact disagrees.
import html from "../index.html?raw";
import nginxConf from "../nginx.conf?raw";
import themeBoot from "../public/theme-boot.js?raw";

describe("the pre-paint theme script", () => {
  it("is referenced by the entry document as an external same-origin file", () => {
    expect(html).toContain('<script src="/theme-boot.js"></script>');
    // An inline block in the head is the thing the CSP refuses. `type="module"`
    // on the bundle entry is a src too, so only a script with a body counts.
    const inlineHeadScript = /<script(?![^>]*\ssrc=)[^>]*>[\s\S]*?<\/script>/.exec(html);
    expect(inlineHeadScript).toBeNull();
  });

  it("ships as a public asset the build copies verbatim", () => {
    // `public/` is Vite's copy-as-is directory, so a file here reaches the
    // container at the fixed path index.html names. It resolves the stored
    // preference and stamps the root element, which is the whole job: the
    // stylesheet keys its palette off that attribute.
    expect(themeBoot).toContain("linkmesh.theme");
    expect(themeBoot).toContain("documentElement.dataset.theme");
  });

  it("is served by nginx under a policy that still rejects inline script", () => {
    expect(nginxConf).toContain("location = /theme-boot.js");
    // Every policy in the file, on every location: none of them may grow an
    // 'unsafe-inline' or a nonce to make an inline script work again.
    const policies = [...nginxConf.matchAll(/Content-Security-Policy "([^"]+)"/g)].map(
      ([, value]) => value,
    );
    expect(policies.length).toBeGreaterThan(0);
    for (const policy of policies) {
      expect(policy).toContain("script-src 'self'");
      expect(policy).not.toMatch(/script-src[^;]*unsafe-inline/);
      expect(policy).not.toMatch(/script-src[^;]*nonce-/);
    }
  });
});

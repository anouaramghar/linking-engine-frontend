/** jsdom does not provide matchMedia, but the assistant renderer uses it to
 * honor the browser's reduced-motion preference while it animates. */
const matchMedia = (query: string): MediaQueryList =>
  ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }) as unknown as MediaQueryList;

Object.defineProperty(window, "matchMedia", {
  configurable: true,
  value: matchMedia,
  writable: true,
});

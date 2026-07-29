/**
 * The preview is a column beside the list on a wide screen and a drawer over it
 * below `xl`. The two differ in more than width: only the drawer is a dialog,
 * traps focus, and owns Escape — beside the list those would all be wrong, since
 * Tab must reach the queue and the page's own shortcuts handle Escape.
 *
 * jsdom has no `matchMedia`, so the hook reports "wide" everywhere unless a test
 * says otherwise. That is why the rest of the suite never sees the drawer, and
 * why these tests stub it explicitly rather than relying on a default.
 */

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Suggestion } from "../../types/suggestion";
import SuggestionPreview from "./SuggestionPreview";

const realMatchMedia = window.matchMedia;

afterEach(() => {
  cleanup();
  window.matchMedia = realMatchMedia;
});

/** `true` puts the viewport below the breakpoint, where the preview overlays. */
const setNarrow = (matches: boolean) => {
  window.matchMedia = vi.fn().mockImplementation((media: string) => ({
    matches,
    media,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
};

const suggestion: Suggestion = {
  id: 1,
  site_id: 1,
  source_article: { id: 10, title: "Source", url: "https://example.com/source" },
  target_article: { id: 11, title: "Target", url: "https://example.com/target" },
  method: "baseline_cosine",
  score: 0.9,
  status: "pending",
  anchor_text: "anchor",
  created_at: "2026-07-16T10:00:00Z",
};

const renderPreview = (onClose = vi.fn()) => {
  const result = render(
    <SuggestionPreview
      suggestion={suggestion}
      siteName="Example site"
      onClose={onClose}
      onAccept={vi.fn()}
      onReject={vi.fn()}
      onUndo={vi.fn()}
    />,
  );
  return { ...result, onClose };
};

describe("beside the list", () => {
  it("is ordinary page content, not a dialog", () => {
    setNarrow(false);
    renderPreview();

    expect(screen.getByRole("complementary", { name: "Suggestion detail" })).not.toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("leaves Escape to the queue's own shortcut handler", () => {
    setNarrow(false);
    const { onClose } = renderPreview();

    fireEvent.keyDown(screen.getByRole("complementary", { name: "Suggestion detail" }), {
      key: "Escape",
    });

    expect(onClose).not.toHaveBeenCalled();
  });

  it("does not take focus away from the row that opened it", () => {
    setNarrow(false);
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();

    renderPreview();

    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it("leaves the page scrollable", () => {
    // The drawer locks body scroll so the list cannot move underneath it. As a
    // column there is nothing underneath, and locking would freeze the queue
    // the panel sits next to. This is the assertion that fails if the trap ever
    // stops honouring its `active` flag — the ref and handler are simply not
    // wired up in this branch, so nothing else here would notice.
    setNarrow(false);
    renderPreview();

    expect(document.body.style.overflow).not.toBe("hidden");
  });
});

describe("overlaying the list", () => {
  it("is a modal dialog", () => {
    setNarrow(true);
    renderPreview();

    const dialog = screen.getByRole("dialog", { name: "Suggestion detail" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
  });

  it("shows the same detail as the side-by-side panel", () => {
    setNarrow(true);
    renderPreview();

    expect(screen.getByText("Source")).not.toBeNull();
    expect(screen.getByText("Target")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Accept & queue placement" })).not.toBeNull();
  });

  it("owns Escape, because the page shortcuts stand down inside a dialog", () => {
    setNarrow(true);
    const { onClose } = renderPreview();

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("closes on the backdrop but not on a drag that ends there", () => {
    setNarrow(true);
    const { onClose } = renderPreview();
    const dialog = screen.getByRole("dialog");
    const backdrop = dialog.parentElement!;

    // A press that starts inside the panel is a text selection, not a dismissal.
    fireEvent.mouseDown(dialog);
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.mouseDown(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("moves focus into the panel and hands it back on close", () => {
    setNarrow(true);
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();

    const { unmount } = renderPreview();
    expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(true);
    // The close button leads, so a stray Enter dismisses rather than approves.
    expect(document.activeElement?.getAttribute("aria-label")).toBe("Close preview");

    unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it("keeps Tab inside the panel", () => {
    setNarrow(true);
    renderPreview();
    const dialog = screen.getByRole("dialog");
    const focusable = [...dialog.querySelectorAll<HTMLElement>("a[href], button")];
    const last = focusable[focusable.length - 1];

    last.focus();
    fireEvent.keyDown(dialog, { key: "Tab" });

    expect(document.activeElement).toBe(focusable[0]);
  });

  it("releases the body scroll lock when it closes", () => {
    setNarrow(true);
    const { unmount } = renderPreview();
    expect(document.body.style.overflow).toBe("hidden");

    unmount();
    expect(document.body.style.overflow).not.toBe("hidden");
  });
});

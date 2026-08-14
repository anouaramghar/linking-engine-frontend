import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Placement } from "../../types/suggestion";
import PlacementContextCard from "./PlacementContextCard";
import type { PlacementState } from "./PlacementContextCard";

afterEach(cleanup);

const CONTEXT =
  "The long steep pulls fewer acids out of the grounds, which is why it tastes rounder.";

const found = (overrides: Partial<Placement> = {}): Placement => ({
  suggestion_id: 1,
  found: true,
  placement_context: CONTEXT,
  anchor_text: "fewer acids",
  llm_model: "google/gemma-4-31b-it",
  generated_at: "2026-08-03T10:00:00Z",
  ...overrides,
});

const state = (overrides: Partial<PlacementState> = {}): PlacementState => ({
  data: undefined,
  isLoading: false,
  error: null,
  onRetry: vi.fn(),
  ...overrides,
});

const renderCard = (overrides: Partial<PlacementState> = {}) =>
  render(<PlacementContextCard placement={state(overrides)} />);

const httpError = (status: number, detail?: string) => ({
  response: { status, data: detail === undefined ? {} : { detail } },
});

describe("PlacementContextCard", () => {
  it("quotes the passage and marks the anchor inside it", () => {
    renderCard({ data: found() });

    // The passage is split around the mark, so assert on the card's whole text.
    expect(screen.getByText("Placement context")).not.toBeNull();
    expect(document.body.textContent).toContain(CONTEXT);

    const mark = document.querySelector("mark");
    expect(mark?.textContent).toBe("fewer acids");
  });

  it("does not duplicate the anchor while highlighting it", () => {
    // A naive split-and-join can print the anchor twice; the passage the editor
    // reads has to stay exactly what the engine quoted.
    renderCard({ data: found() });

    const quote = document.querySelector("blockquote");
    expect(quote?.textContent).toBe(CONTEXT);
  });

  it("still shows the passage when the anchor cannot be located in it", () => {
    // Losing the highlight is acceptable; losing the passage is not.
    renderCard({ data: found({ anchor_text: "not in the passage" }) });

    expect(document.querySelector("blockquote")?.textContent).toBe(CONTEXT);
    expect(document.querySelector("mark")).toBeNull();
  });

  it("reports that no spot fits, without inviting a retry", () => {
    // A settled answer from the model, not a failure.
    renderCard({ data: found({ found: false, placement_context: null, anchor_text: null }) });

    expect(screen.getByText("No natural spot for this link in the article.")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("shows progress while the model is reading", () => {
    renderCard({ isLoading: true });

    expect(screen.getByText(/Reading the source article/)).not.toBeNull();
    expect(document.querySelector("blockquote")).toBeNull();
  });

  it("offers a retry after a failure, and reports the reason", () => {
    const onRetry = vi.fn();
    renderCard({ error: httpError(502, "the placement model is unavailable; try again"), onRetry });

    expect(screen.getByText("the placement model is unavailable; try again")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalled();
  });

  it("does not offer a retry when the feature is switched off", () => {
    // 503 is an unset API key. Trying again fails identically every time.
    renderCard({ error: httpError(503, "placement generation is not configured") });

    expect(screen.getByText("Placement context is not configured on this engine.")).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("survives a validation error whose detail is not a string", () => {
    // FastAPI returns an array of objects for a 422; rendering it as a React
    // child would crash the whole drawer.
    renderCard({ error: { response: { status: 422, data: { detail: [{ msg: "bad" }] } } } });

    expect(screen.getByText("Could not work out where this link belongs.")).not.toBeNull();
  });

  it("prefers progress over a stale error while retrying", () => {
    renderCard({ isLoading: true, error: httpError(502, "gone") });

    expect(screen.getByText(/Reading the source article/)).not.toBeNull();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });
});

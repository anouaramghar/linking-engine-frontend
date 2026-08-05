import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import BulkActions from "./BulkActions";

afterEach(cleanup);

const baseProps = () => ({
  chips: [{ key: "pending", label: "Pending review", count: 4 }],
  active: "pending",
  onSelect: vi.fn(),
  threshold: 80,
  onThresholdChange: vi.fn(),
  acceptCount: 2,
  rejectCount: 1,
  actionable: true,
  confirmation: null,
  onRequest: vi.fn(),
  onConfirm: vi.fn(),
  onCancel: vi.fn(),
});

describe("BulkActions", () => {
  it("renders the threshold and current target counts", () => {
    render(<BulkActions {...baseProps()} />);

    expect((screen.getByLabelText("Score threshold") as HTMLInputElement).value).toBe("80");
    expect(screen.getByRole("button", { name: /Accept.*2/ })).not.toBeNull();
    expect(screen.getByRole("button", { name: /Reject.*1/ })).not.toBeNull();
    expect(screen.queryByRole("button", { name: "GNN" })).toBeNull();
  });

  it("reports bulk-action intents immediately", () => {
    const props = baseProps();
    render(<BulkActions {...props} />);

    fireEvent.click(screen.getByRole("button", { name: /Accept/ }));

    expect(props.onRequest).toHaveBeenCalledWith("approve");
  });

  /**
   * Each committed threshold is a fresh query key for two count endpoints, so
   * the field paints every keystroke but only reports the settled number. A
   * two-digit entry has to cost one commit, not one per digit.
   */
  it("commits the threshold once the typing settles, not per keystroke", async () => {
    const props = baseProps();
    render(<BulkActions {...props} />);
    const field = screen.getByLabelText("Score threshold");

    fireEvent.change(field, { target: { value: "7" } });
    fireEvent.change(field, { target: { value: "75" } });

    expect(props.onThresholdChange).not.toHaveBeenCalled();
    expect((field as HTMLInputElement).value).toBe("75");

    await waitFor(() => expect(props.onThresholdChange).toHaveBeenCalledWith(75));
    expect(props.onThresholdChange).toHaveBeenCalledTimes(1);
  });

  it("settles the threshold at once when the field is left", () => {
    const props = baseProps();
    render(<BulkActions {...props} />);
    const field = screen.getByLabelText("Score threshold");

    fireEvent.change(field, { target: { value: "75" } });
    fireEvent.blur(field);

    expect(props.onThresholdChange).toHaveBeenCalledWith(75);
  });

  it("disables empty actions and renders confirmation details", () => {
    const props = baseProps();
    render(
      <BulkActions
        {...props}
        acceptCount={0}
        confirmation={{
          action: "reject",
          count: 3,
          threshold: 80,
          siteLabel: "Example site",
          undoAvailable: true,
        }}
      />,
    );

    expect(
      (screen.getByRole("button", { name: /Accept/ }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(screen.getByRole("alertdialog").textContent).toContain("3 pending suggestions");
    expect(screen.getByRole("alertdialog").textContent).toContain("Example site");
  });

  it("warns before confirming a rule too large for exact undo", () => {
    const props = baseProps();
    render(
      <BulkActions
        {...props}
        confirmation={{
          action: "approve",
          count: 1001,
          threshold: 80,
          siteLabel: "All sites",
          undoAvailable: false,
        }}
      />,
    );

    expect(screen.getByRole("alertdialog").textContent).toContain(
      "too large to undo in one step",
    );
  });
});

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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

  it("reports threshold and bulk-action intents", () => {
    const props = baseProps();
    render(<BulkActions {...props} />);

    fireEvent.change(screen.getByLabelText("Score threshold"), {
      target: { value: "75" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Accept/ }));

    expect(props.onThresholdChange).toHaveBeenCalledWith(75);
    expect(props.onRequest).toHaveBeenCalledWith("approve");
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

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import ConfirmDialog from "./ConfirmDialog";

afterEach(cleanup);

const renderDialog = (props: Partial<Parameters<typeof ConfirmDialog>[0]> = {}) => {
  const onConfirm = vi.fn();
  render(
    <ConfirmDialog
      title="Delete Acme Blog?"
      description="This removes the site and its articles."
      confirmLabel="Delete site"
      onConfirm={onConfirm}
      onCancel={vi.fn()}
      {...props}
    />,
  );
  return onConfirm;
};

describe("ConfirmDialog", () => {
  it("confirms immediately when no phrase is required", async () => {
    const onConfirm = renderDialog();

    await userEvent.click(screen.getByRole("button", { name: "Delete site" }));

    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("holds the destructive action until the name is typed exactly", async () => {
    const onConfirm = renderDialog({ confirmPhrase: "Acme Blog" });

    const confirm = screen.getByRole("button", { name: "Delete site" });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);

    const input = screen.getByRole("textbox");
    await userEvent.type(input, "Acme Blo");
    expect((confirm as HTMLButtonElement).disabled).toBe(true);

    await userEvent.type(input, "g");
    expect((confirm as HTMLButtonElement).disabled).toBe(false);

    await userEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("treats the confirmation as case- and whitespace-sensitive", async () => {
    renderDialog({ confirmPhrase: "Acme Blog" });

    await userEvent.type(screen.getByRole("textbox"), "acme blog ");

    expect((screen.getByRole("button", { name: "Delete site" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it("stays disabled while the request is in flight", () => {
    renderDialog({ confirmPhrase: "Acme Blog", pending: true });

    expect((screen.getByRole("button", { name: "Working…" }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });
});

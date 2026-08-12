import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import Modal from "./Modal";

afterEach(cleanup);

const renderModal = (onClose = vi.fn()) => {
  render(
    <Modal title="Connect a site" onClose={onClose}>
      <input aria-label="Name" />
      <button type="button">Save</button>
    </Modal>,
  );
  return onClose;
};

describe("Modal", () => {
  it("announces itself as a labelled dialog", () => {
    renderModal();

    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-label")).toBeNull();
    expect(screen.getByRole("heading", { name: "Connect a site" })).not.toBeNull();
  });

  it("moves focus in on open and restores it on close", async () => {
    const opener = document.createElement("button");
    document.body.append(opener);
    opener.focus();

    const { unmount } = render(
      <Modal title="Connect a site" onClose={vi.fn()}>
        <input aria-label="Name" />
      </Modal>,
    );
    expect(document.activeElement).toBe(screen.getByLabelText("Name"));

    unmount();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });

  it("closes on Escape", async () => {
    const onClose = renderModal();

    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalled();
  });

  it("keeps Tab inside the dialog", async () => {
    renderModal();
    const save = screen.getByRole("button", { name: "Save" });

    save.focus();
    await userEvent.tab();
    expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(true);
  });

  it("closes on a backdrop press but not on a drag released over it", () => {
    const onClose = renderModal();
    const dialog = screen.getByRole("dialog");
    const backdrop = dialog.parentElement!;

    // A selection drag starting inside the panel must not discard the form.
    fireEvent.mouseDown(dialog);
    fireEvent.click(backdrop);
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.mouseDown(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("keeps a description out of the part that scrolls", () => {
    render(
      <Modal
        title="Import sites from CSV"
        description={<>Columns: name, base_url</>}
        onClose={vi.fn()}
      >
        <p>Body</p>
      </Modal>,
    );

    // In the body it slid under the heading the moment anything below it grew,
    // which is how the column list ended up half-hidden behind the title.
    const description = screen.getByText(/Columns: name, base_url/);
    const scroller = screen.getByText("Body").parentElement!;
    expect(scroller.contains(description)).toBe(false);
  });

  it("can protect a review from accidental backdrop dismissal", () => {
    const onClose = vi.fn();
    render(
      <Modal title="Review exact edits" onClose={onClose} dismissOnBackdrop={false}>
        <button type="button">Approve</button>
      </Modal>,
    );

    fireEvent.mouseDown(screen.getByRole("dialog").parentElement!);

    expect(onClose).not.toHaveBeenCalled();
  });
});

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import AddSiteModal from "./AddSiteModal";

const mutate = vi.fn();

vi.mock("../../hooks/useSites", () => ({
  useCreateSite: () => ({
    mutate,
    isPending: false,
    isError: false,
    error: null,
  }),
}));

afterEach(() => {
  cleanup();
  mutate.mockReset();
});

describe("AddSiteModal", () => {
  it("gives every field a persistent accessible label", () => {
    render(<AddSiteModal onClose={vi.fn()} />);

    expect(screen.getByRole("textbox", { name: /Site name/ })).not.toBeNull();
    expect(screen.getByRole("textbox", { name: /Site URL/ })).not.toBeNull();
    expect(screen.getByRole("combobox", { name: "Connector" })).not.toBeNull();
    expect(screen.getByRole("textbox", { name: /WordPress username/ })).not.toBeNull();
    expect(screen.getByLabelText(/Application password/)).not.toBeNull();
  });

  it("marks the required fields and keeps credentials optional", () => {
    render(<AddSiteModal onClose={vi.fn()} />);

    expect(screen.getByRole("textbox", { name: /Site name/ }).hasAttribute("required")).toBe(true);
    expect(screen.getByRole("textbox", { name: /Site URL/ }).hasAttribute("required")).toBe(true);
    expect(screen.getByRole("textbox", { name: /WordPress username/ }).hasAttribute("required")).toBe(
      false,
    );
  });

  it("hides WordPress credentials when the sitemap connector is selected", () => {
    render(<AddSiteModal onClose={vi.fn()} />);

    fireEvent.change(screen.getByRole("combobox", { name: "Connector" }), {
      target: { value: "html" },
    });

    expect(screen.queryByRole("textbox", { name: /WordPress username/ })).toBeNull();
    expect(screen.queryByLabelText(/Application password/)).toBeNull();
  });

  it("offers a read-only content-pool connector", () => {
    render(<AddSiteModal onClose={vi.fn()} />);

    fireEvent.change(screen.getByRole("combobox", { name: "Connector" }), {
      target: { value: "pool" },
    });

    expect(document.body.textContent).toContain("RSS/Atom feed URL");
    expect(screen.queryByRole("textbox", { name: /WordPress username/ })).toBeNull();
    expect(screen.getByLabelText(/Domain registration date/)).not.toBeNull();
  });

  it("rejects incomplete WordPress credentials before calling the API", () => {
    render(<AddSiteModal onClose={vi.fn()} />);
    fireEvent.change(screen.getByRole("textbox", { name: /Site name/ }), {
      target: { value: "Docs" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: /Site URL/ }), {
      target: { value: "https://example.com" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: /WordPress username/ }), {
      target: { value: "editor" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Connect site" }));

    expect(screen.getByRole("alert").textContent).toContain("both WordPress credentials");
    expect(mutate).not.toHaveBeenCalled();
  });
});

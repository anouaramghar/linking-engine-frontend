import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import BulkImportModal from "./BulkImportModal";

const mutate = vi.fn();
const state: { data: unknown; isPending: boolean; isError: boolean; error: unknown } = {
  data: undefined,
  isPending: false,
  isError: false,
  error: null,
};

vi.mock("../../hooks/useSites", () => ({
  useBulkCreateSites: () => ({ ...state, mutate, reset: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  mutate.mockReset();
  state.data = undefined;
});

const upload = async (contents: string, name = "sites.csv") => {
  const user = userEvent.setup();
  const { rerender } = render(<BulkImportModal onClose={vi.fn()} />);
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  await user.upload(input, new File([contents], name, { type: "text/csv" }));
  return { user, rerender: () => rerender(<BulkImportModal onClose={vi.fn()} />) };
};

const CSV = [
  "name,base_url,platform",
  "Trail,https://trail.example.com,wordpress",
  "Docs,https://docs.example.com,html",
].join("\n");

describe("BulkImportModal", () => {
  it("previews parsed rows before anything is sent", async () => {
    await upload(CSV);

    await waitFor(() => expect(screen.getByText("2 ready")).toBeTruthy());
    expect(screen.getByText("https://trail.example.com")).toBeTruthy();
    expect(screen.getByText("sites.csv")).toBeTruthy();
    expect(mutate).not.toHaveBeenCalled(); // preview is local — no request yet
  });

  it("submits only the importable rows, in file order", async () => {
    const { user } = await upload(`${CSV}\nBroken,not-a-url,html`);

    await waitFor(() => expect(screen.getByText("2 ready")).toBeTruthy());
    expect(screen.getByText("1 skipped")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /Import 2 sites/ }));

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls[0][0]).toEqual([
      expect.objectContaining({ base_url: "https://trail.example.com" }),
      expect.objectContaining({ base_url: "https://docs.example.com" }),
    ]);
  });

  it("blocks the import when a required column is absent", async () => {
    await upload("nickname,platform\nTrail,wordpress");

    await waitFor(() => expect(screen.getByText(/Missing required columns/)).toBeTruthy());
    expect(screen.getByRole("button", { name: /Import/ }).hasAttribute("disabled")).toBe(true);
  });

  it("warns when the file carries application passwords", async () => {
    await upload(
      "name,base_url,wp_username,wp_app_password\nTrail,https://trail.example.com,editor,secret",
    );

    await waitFor(() =>
      expect(screen.getByText(/delete it after importing/)).toBeTruthy(),
    );
  });

  it("maps API row numbers back to the original file lines", async () => {
    const { rerender } = await upload(`${CSV}\nBroken,not-a-url,html`);
    await waitFor(() => expect(screen.getByText("2 ready")).toBeTruthy());

    state.data = {
      created: [{ row: 1, id: 1, name: "Trail", base_url: "https://trail.example.com" }],
      skipped: [
        {
          row: 2,
          base_url: "https://docs.example.com",
          reason: "a site with this base_url already exists",
        },
      ],
      rejected: [],
    };
    rerender();

    // Submitted row 2 is the third line of the file (header + Trail precede it).
    await waitFor(() => expect(screen.getByText("line 3")).toBeTruthy());
    expect(screen.getByText("1 imported")).toBeTruthy();
    expect(screen.getByText("1 already existed")).toBeTruthy();
    expect(screen.getByText("1 invalid rows")).toBeTruthy();
    expect(screen.getByText("line 4")).toBeTruthy();
    expect(screen.getByText("base_url must start with http:// or https://")).toBeTruthy();
  });
});

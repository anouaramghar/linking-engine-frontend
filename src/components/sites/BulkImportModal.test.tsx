import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import BulkImportModal from "./BulkImportModal";

const mutate = vi.fn();
const validate = vi.fn();
const state: { data: unknown; isPending: boolean; isError: boolean; error: unknown } = {
  data: undefined,
  isPending: false,
  isError: false,
  error: null,
};

vi.mock("../../hooks/useSites", () => ({
  useBulkCreateSites: () => ({ ...state, mutate, reset: vi.fn() }),
  useValidatePoolSources: () => ({
    mutateAsync: validate,
    reset: vi.fn(),
    isPending: false,
    isError: false,
    error: null,
  }),
}));

beforeEach(() => {
  validate.mockImplementation(async (sites: Array<{ base_url: string }>) =>
    sites.map((site) => ({
      base_url: site.base_url,
      valid: true,
      source_type: site.base_url.includes("wikipedia.org") ? "wikipedia" : "rss_atom",
      reason: null,
    })),
  );
});

afterEach(() => {
  cleanup();
  mutate.mockReset();
  validate.mockReset();
  state.data = undefined;
});

const upload = async (
  contents: string,
  name = "sites.csv",
  mode: "sites" | "pool" = "sites",
) => {
  const user = userEvent.setup();
  const { rerender } = render(<BulkImportModal onClose={vi.fn()} mode={mode} />);
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  await user.upload(input, new File([contents], name, { type: "text/csv" }));
  return {
    user,
    rerender: () => rerender(<BulkImportModal onClose={vi.fn()} mode={mode} />),
  };
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

  it("imports a dedicated pool CSV as unapproved pool sources", async () => {
    const { user } = await upload(
      [
        "name,base_url",
        "Wikipedia AI,https://en.wikipedia.org/wiki/Artificial_intelligence",
        "Industry feed,https://news.example.com/feed.xml",
      ].join("\n"),
      "pool.csv",
      "pool",
    );

    await waitFor(() => expect(screen.getByText("2 ready")).toBeTruthy());
    expect(screen.getByText("Wikipedia")).toBeTruthy();
    expect(screen.getByText("RSS/Atom candidate")).toBeTruthy();
    expect(screen.getByText(/unapproved content-pool source/)).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Import 2 sources" }));

    expect(mutate).toHaveBeenCalledWith([
      {
        name: "Wikipedia AI",
        base_url: "https://en.wikipedia.org/wiki/Artificial_intelligence",
        platform: "pool",
        wp_username: undefined,
        wp_app_password: undefined,
      },
      {
        name: "Industry feed",
        base_url: "https://news.example.com/feed.xml",
        platform: "pool",
        wp_username: undefined,
        wp_app_password: undefined,
      },
    ]);
  });

  it("shows live validation failures and imports only valid pool sources", async () => {
    validate.mockResolvedValueOnce([
      {
        base_url: "https://news.example.com/feed.xml",
        valid: true,
        source_type: "rss_atom",
        reason: null,
      },
      {
        base_url: "https://broken.example.com/feed.xml",
        valid: false,
        source_type: "rss_atom",
        reason: "invalid RSS/Atom feed: missing feed version",
      },
    ]);

    const { user } = await upload(
      [
        "name,base_url",
        "News,https://news.example.com/feed.xml",
        "Broken,https://broken.example.com/feed.xml",
      ].join("\n"),
      "pool.csv",
      "pool",
    );

    await waitFor(() => expect(screen.getByText("1 ready")).toBeTruthy());
    expect(screen.getByText("invalid RSS/Atom feed: missing feed version")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Import 1 source" }));

    expect(mutate).toHaveBeenCalledWith([
      expect.objectContaining({ base_url: "https://news.example.com/feed.xml" }),
    ]);
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
    expect(screen.getByText("1 invalid in file")).toBeTruthy();
    expect(screen.getByText("line 4")).toBeTruthy();
    expect(screen.getByText("base_url must start with http:// or https://")).toBeTruthy();
  });
});

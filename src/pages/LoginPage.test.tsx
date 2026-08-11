import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import LoginPage from "./LoginPage";

const startLogin = vi.fn();
const completeLogin = vi.fn();

vi.mock("../api/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../api/auth")>()),
  startLogin: () => startLogin(),
  completeLogin: (code: string) => completeLogin(code),
}));

const DEEP_LINK = "https://t.me/linkmeshbot?start=login";
const LOGIN_START = { deep_link: DEEP_LINK, expires_in_seconds: 300 };

function renderLogin() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <LoginPage />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("LoginPage", () => {
  it("hands off to Telegram on the one click, with no second button to press", async () => {
    const tab = { location: { href: "" }, close: vi.fn() };
    const open = vi.fn(() => tab);
    vi.stubGlobal("open", open);
    startLogin.mockResolvedValue(LOGIN_START);

    renderLogin();
    await userEvent.click(screen.getByRole("button", { name: /sign in with telegram/i }));

    // Opened blank, because the deep link does not exist yet: the tab has to be
    // claimed inside the click or the browser blocks it as a pop-up.
    expect(open).toHaveBeenCalledWith("", "_blank");
    await waitFor(() => expect(tab.location.href).toBe(DEEP_LINK));
    expect(screen.queryByRole("link", { name: "Open Telegram" })).toBeNull();
  });

  it("offers the link when the browser blocks the tab", async () => {
    vi.stubGlobal("open", vi.fn(() => null));
    startLogin.mockResolvedValue(LOGIN_START);

    renderLogin();
    await userEvent.click(screen.getByRole("button", { name: /sign in with telegram/i }));

    const link = await screen.findByRole("link", { name: "Open Telegram" });
    expect(link.getAttribute("href")).toBe(DEEP_LINK);
  });

  it("closes the empty tab when the sign-in never starts", async () => {
    const tab = { location: { href: "" }, close: vi.fn() };
    vi.stubGlobal("open", vi.fn(() => tab));
    startLogin.mockRejectedValue(new Error("rate limited"));

    renderLogin();
    await userEvent.click(screen.getByRole("button", { name: /sign in with telegram/i }));

    await waitFor(() => expect(tab.close).toHaveBeenCalled());
    expect(await screen.findByRole("alert")).toBeTruthy();
  });

  it("redeems the one-time code Telegram gives the approved operator", async () => {
    const tab = { location: { href: "" }, close: vi.fn() };
    vi.stubGlobal("open", vi.fn(() => tab));
    startLogin.mockResolvedValue(LOGIN_START);
    completeLogin.mockResolvedValue({ state: "approved", user: null });

    renderLogin();
    await userEvent.click(screen.getByRole("button", { name: /sign in with telegram/i }));
    const code = await screen.findByLabelText(/one-time telegram code/i);
    expect(code.className).toContain("field");
    await userEvent.type(code, "ABCD-EFGH-JKLM");
    await userEvent.click(screen.getByRole("button", { name: /complete sign in/i }));

    await waitFor(() => expect(completeLogin).toHaveBeenCalledWith("ABCD-EFGH-JKLM"));
  });

  it("counts down the code lifetime and prevents submitting an expired code", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-11T12:00:00Z"));
    vi.stubGlobal("open", vi.fn(() => null));
    startLogin.mockResolvedValue(LOGIN_START);

    renderLogin();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /sign in with telegram/i }));
    });

    expect(screen.getByRole("timer").textContent).toBe("Expires in 5:00");

    act(() => vi.advanceTimersByTime(1_000));
    expect(screen.getByRole("timer").textContent).toBe("Expires in 4:59");

    act(() => vi.advanceTimersByTime(299_000));
    expect(screen.getByRole("timer").textContent).toBe("Code expired");
    expect((screen.getByLabelText(/one-time telegram code/i) as HTMLInputElement).disabled).toBe(
      true,
    );
    expect(screen.getByRole("button", { name: /start again/i })).toBeTruthy();
  });
});

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import RequireSession from "./RequireSession";

const useSession = vi.fn();

vi.mock("../hooks/useSession", () => ({
  useSession: () => useSession(),
  SESSION_QUERY_KEY: ["session"],
}));

vi.mock("../pages/LoginPage", () => ({
  default: () => <div>Login screen</div>,
}));

afterEach(cleanup);

describe("RequireSession", () => {
  it("shows the login screen when nobody is signed in", () => {
    useSession.mockReturnValue({ data: null, isPending: false });

    render(
      <RequireSession>
        <div>Dashboard</div>
      </RequireSession>,
    );

    expect(screen.getByText("Login screen")).toBeTruthy();
    expect(screen.queryByText("Dashboard")).toBeNull();
  });

  it("renders the dashboard for a signed-in operator", () => {
    useSession.mockReturnValue({ data: { id: 1, telegram_id: 42 }, isPending: false });

    render(
      <RequireSession>
        <div>Dashboard</div>
      </RequireSession>,
    );

    expect(screen.getByText("Dashboard")).toBeTruthy();
    expect(screen.queryByText("Login screen")).toBeNull();
  });

  it("shows neither while the session is still being checked", () => {
    // Flashing the login screen at an operator who is already signed in, on
    // every reload, is the failure this guards against.
    useSession.mockReturnValue({ data: undefined, isPending: true });

    render(
      <RequireSession>
        <div>Dashboard</div>
      </RequireSession>,
    );

    expect(screen.queryByText("Dashboard")).toBeNull();
    expect(screen.queryByText("Login screen")).toBeNull();
    expect(screen.getByRole("status", { name: "Checking your session" })).toBeTruthy();
  });
});

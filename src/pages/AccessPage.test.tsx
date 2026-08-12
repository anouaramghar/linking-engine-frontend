import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import AccessPage from "./AccessPage";
import type { DashboardUser } from "../api/auth";

const mocks = vi.hoisted(() => ({
  listUsers: vi.fn(),
  approve: vi.fn(),
  revoke: vi.fn(),
  grantAdmin: vi.fn(),
  revokeAdmin: vi.fn(),
  session: undefined as DashboardUser | undefined,
}));

vi.mock("../api/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api/auth")>();
  return {
    ...actual,
    listDashboardUsers: mocks.listUsers,
    approveDashboardUser: mocks.approve,
    revokeDashboardUser: mocks.revoke,
    grantDashboardAdmin: mocks.grantAdmin,
    revokeDashboardAdmin: mocks.revokeAdmin,
  };
});

vi.mock("../hooks/useSession", () => ({
  useSession: () => ({ data: mocks.session }),
}));

vi.mock("../components/AccountControls", () => ({
  UserAvatar: () => <span />,
}));

const user = (over: Partial<DashboardUser> & Pick<DashboardUser, "id">): DashboardUser => ({
  telegram_id: 1000 + over.id,
  username: null,
  display_name: `Operator ${over.id}`,
  status: "approved",
  is_admin: false,
  requested_at: "2026-08-10T09:00:00Z",
  approved_at: "2026-08-10T09:05:00Z",
  approved_by: "bootstrap",
  last_seen_at: null,
  ...over,
});

const ADMIN = user({ id: 1, is_admin: true, display_name: "Amir" });
const MEMBER = user({ id: 2, display_name: "Anouar" });
const NEWCOMER = user({ id: 3, status: "pending", display_name: "Wiam", approved_at: null });

const renderAccess = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <AccessPage />
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  mocks.listUsers.mockReset().mockResolvedValue([NEWCOMER, ADMIN, MEMBER]);
  mocks.approve.mockReset().mockResolvedValue(NEWCOMER);
  mocks.revoke.mockReset().mockResolvedValue(MEMBER);
  mocks.grantAdmin.mockReset().mockResolvedValue({ ...MEMBER, is_admin: true });
  mocks.revokeAdmin.mockReset().mockResolvedValue(ADMIN);
  mocks.session = ADMIN;
});

afterEach(cleanup);

describe("AccessPage", () => {
  it("offers admission controls to an admin", async () => {
    renderAccess();

    expect(await screen.findByRole("button", { name: "Approve" })).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Revoke" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Make admin" })).toHaveLength(1);
  });

  it("shows an approved non-admin the roster and none of the controls", async () => {
    mocks.session = MEMBER;
    renderAccess();

    expect(await screen.findByText("Amir")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Revoke" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Make admin" })).toBeNull();
    expect(document.body.textContent).toContain("belong to an admin");
  });

  it("treats an engine that reports no admin group as not admin", async () => {
    // The API is the gate. A UI guessing `true` here would only offer buttons
    // that come back 403.
    mocks.session = { ...ADMIN, is_admin: undefined };
    renderAccess();

    expect(await screen.findByText("Amir")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Revoke" })).toBeNull();
  });

  it("promotes another account into the admin group", async () => {
    const operator = userEvent.setup();
    renderAccess();

    await operator.click(await screen.findByRole("button", { name: "Make admin" }));

    await waitFor(() => expect(mocks.grantAdmin).toHaveBeenCalledWith(MEMBER.id));
  });

  it("never offers to remove your own admin rights or your own access", async () => {
    renderAccess();
    await screen.findByText("Amir");

    // Both are refused by the API for the same reason: the last admin out
    // locks the door behind them.
    const demote = screen.getByRole("button", { name: "Remove admin" });
    const revokes = screen.getAllByRole("button", { name: "Revoke" });
    expect(demote.hasAttribute("disabled")).toBe(true);
    expect(revokes.some((button) => button.hasAttribute("disabled"))).toBe(true);
  });
});
